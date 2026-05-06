import path from 'node:path';
import fs from 'node:fs/promises';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { transcribeAudioBuffer } from '../lib/openai';
import type { WhatsAppProvider, IncomingMessage, ProviderStatus } from './types';
import { getTenantById } from '../tenants.config';

const PROVIDER: 'baileys' = 'baileys';

function jidToPhone(jid: string): string {
  return jid.split('@')[0].split(':')[0];
}

function contactToJid(contact: string): string {
  if (contact.includes('@')) return contact;
  return contact.replace(/[^\d]/g, '') + '@s.whatsapp.net';
}

async function transcribeBaileysAudioMessage(message: any): Promise<{
  text: string;
  mediaType: 'audio' | 'voice';
  mediaMimeType?: string;
} | null> {
  const audioMessage = message.message?.audioMessage;
  if (!audioMessage) return null;

  const buffer = await downloadMediaMessage(message, 'buffer', {});
  const mediaType = audioMessage.ptt ? 'voice' : 'audio';
  const mediaMimeType = audioMessage.mimetype ?? undefined;
  const fileName = mediaMimeType?.includes('ogg')
    ? 'audio.ogg'
    : mediaMimeType?.includes('mpeg')
      ? 'audio.mp3'
      : 'audio.bin';

  const text = await transcribeAudioBuffer(Buffer.from(buffer), fileName);
  return text
    ? { text, mediaType, mediaMimeType }
    : null;
}

export class BaileysProvider implements WhatsAppProvider {
  private sock: ReturnType<typeof makeWASocket> | null = null;
  private status: ProviderStatus = 'disconnected';
  private currentQr: string | null = null;
  private handler: ((msg: IncomingMessage) => Promise<void>) | null = null;
  private reconnectDelay = 1000;
  private stopped = false;
  private cachedVersion: [number, number, number] | null = null;
  private readonly authDir: string;

  constructor() {
    const tenantId = process.env.TENANT_ID;
    if (!tenantId) {
      throw new Error('[baileys] TENANT_ID env var es obligatorio (revisar PM2 + .env.{tenant})');
    }
    const tenant = getTenantById(tenantId);
    if (!tenant) {
      throw new Error(`[baileys] TENANT_ID="${tenantId}" no existe en tenants.config.ts`);
    }
    this.authDir = path.join(tenant.dataDir, 'baileys-auth');
    console.log(`[baileys] Tenant: ${tenant.id} | authDir: ${this.authDir}`);
  }

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.handler = handler;
  }

  getStatus(): ProviderStatus {
    return this.status;
  }

  getQrCode(): string | null {
    return this.currentQr;
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  private async getVersion(): Promise<[number, number, number]> {
    if (this.cachedVersion) return this.cachedVersion;
    try {
      const { version } = await fetchLatestBaileysVersion();
      this.cachedVersion = version;
      return version;
    } catch {
      console.warn('[baileys] No se pudo obtener versión remota, usando fallback');
      return [2, 3000, 0];
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.sock?.end(undefined);
    this.sock = null;
    this.status = 'disconnected';
    console.log('[baileys] Detenido.');
  }

  async sendMessage(to: string, text: string): Promise<void> {
    if (!this.sock || this.status !== 'connected') {
      throw new Error(`[baileys] No se puede enviar: estado es "${this.status}"`);
    }
    await this.sock.sendMessage(contactToJid(to), { text });
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;

    await fs.mkdir(this.authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const version = await this.getVersion();

    this.status = 'connecting';
    console.log(`[baileys] Conectando con versión ${version.join('.')}...`);

    this.sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.currentQr = qr;
        this.status = 'waiting_qr';
        console.log('[baileys] QR generado — abrí el dashboard en http://localhost:3000 para escanearlo');
      }

      if (connection === 'open') {
        this.currentQr = null;
        this.status = 'connected';
        this.reconnectDelay = 1000;
        console.log('[baileys] ✓ Conectado a WhatsApp');
      }

      if (connection === 'close') {
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;

        const shouldClearCreds =
          reason === DisconnectReason.loggedOut ||
          reason === DisconnectReason.badSession;

        if (shouldClearCreds) {
          console.log(`[baileys] Borrando credenciales (código ${reason}) — reiniciando QR...`);
          await fs.rm(this.authDir, { recursive: true, force: true });
          this.reconnectDelay = 1000;
        }

        if (reason === DisconnectReason.forbidden) {
          console.error('[baileys] Cuenta prohibida (403) — deteniendo permanentemente.');
          this.stopped = true;
          this.status = 'error';
          return;
        }

        if (!shouldClearCreds) {
          console.log(`[baileys] Conexión cerrada (código ${reason}) — reconectando en ${this.reconnectDelay}ms...`);
        }

        if (!this.stopped) {
          this.status = 'connecting';
          setTimeout(() => this.connect().catch((err) => {
            console.error('[baileys] Error en reconexión:', err);
            this.status = 'error';
          }), this.reconnectDelay);
          this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
        }
      }
    });

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (!msg.message) continue;
        if (msg.key.remoteJid?.endsWith('@g.us')) continue;
        if (msg.key.remoteJid === 'status@broadcast') continue;

        let text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          '';

        let mediaType: 'audio' | 'voice' | 'image' | undefined;
        let mediaMimeType: string | undefined;
        let mediaUrl: string | undefined;

        if (!text.trim() && msg.message.audioMessage) {
          try {
            const transcript = await transcribeBaileysAudioMessage(msg);
            if (transcript) {
              text = transcript.text;
              mediaType = transcript.mediaType;
              mediaMimeType = transcript.mediaMimeType;
            }
          } catch (err) {
            console.error('[baileys] Error transcribiendo audio:', err);
          }
        } else if (msg.message.imageMessage) {
          try {
            const buffer = await downloadMediaMessage(msg, 'buffer', {});
            const mimetype = msg.message.imageMessage.mimetype || 'image/jpeg';
            mediaUrl = `data:${mimetype};base64,${buffer.toString('base64')}`;
            mediaType = 'image';
            mediaMimeType = mimetype;
          } catch (err) {
            console.error('[baileys] Error descargando imagen:', err);
          }
        }

        if (!text.trim() && !mediaUrl) continue;

        const fromMe = msg.key.fromMe ?? false;
        const remoteJid = msg.key.remoteJid ?? '';
        const selfPhone = jidToPhone(this.sock?.user?.id ?? '');
        const isSelfChat = jidToPhone(remoteJid) === selfPhone;

        const externalMessageId = msg.key.id ?? '';
        const timestamp =
          typeof msg.messageTimestamp === 'number'
            ? msg.messageTimestamp
            : Number(msg.messageTimestamp ?? Math.floor(Date.now() / 1000));

        const normalized: IncomingMessage = {
          provider: PROVIDER,
          externalMessageId,
          from: remoteJid,
          to: selfPhone,
          text: text.trim(),
          timestamp,
          senderName: fromMe ? undefined : (msg.pushName ?? undefined),
          fromMe,
          isSelfChat,
          mediaType,
          mediaUrl,
          mediaMimeType,
          originalText: msg.message.audioMessage ? '[audio]' : (msg.message.imageMessage ? '[imagen]' : undefined),
          rawPayload: msg,
        };

        if (this.handler) {
          await this.handler(normalized).catch((err) => {
            console.error('[baileys] Error procesando mensaje:', err);
          });
        }
      }
    });
  }
}
