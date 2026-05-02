import path from 'node:path';
import fs from 'node:fs/promises';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import type { WhatsAppProvider, IncomingMessage, ProviderStatus } from './types';

const PROVIDER: 'baileys' = 'baileys';

function jidToPhone(jid: string): string {
  return jid.split('@')[0];
}

function phoneToJid(phone: string): string {
  return phone.replace(/[^\d]/g, '') + '@s.whatsapp.net';
}

export class BaileysProvider implements WhatsAppProvider {
  private sock: ReturnType<typeof makeWASocket> | null = null;
  private status: ProviderStatus = 'disconnected';
  private currentQr: string | null = null;
  private handler: ((msg: IncomingMessage) => Promise<void>) | null = null;
  private reconnectDelay = 1000;
  private stopped = false;
  private readonly authDir: string;

  constructor() {
    const dataDir = process.env.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.join(process.cwd(), 'data');
    this.authDir = path.join(dataDir, 'baileys-auth');
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
    await this.sock.sendMessage(phoneToJid(to), { text });
  }

  private async connect(): Promise<void> {
    await fs.mkdir(this.authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const { version } = await fetchLatestBaileysVersion();

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
        const loggedOut = reason === DisconnectReason.loggedOut;

        if (loggedOut) {
          console.log('[baileys] Sesión cerrada (logout) — borrando credenciales y reiniciando QR...');
          await fs.rm(this.authDir, { recursive: true, force: true });
          this.reconnectDelay = 1000;
        } else {
          console.log(`[baileys] Conexión cerrada (código ${reason}) — reconectando en ${this.reconnectDelay}ms...`);
        }

        if (!this.stopped) {
          this.status = 'connecting';
          setTimeout(() => this.connect(), this.reconnectDelay);
          this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
        }
      }
    });

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (msg.key.fromMe || !msg.message) continue;

        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          '';
        if (!text.trim()) continue;

        const from = jidToPhone(msg.key.remoteJid ?? '');
        const to = jidToPhone(this.sock?.user?.id ?? '');
        const externalMessageId = msg.key.id ?? '';
        const timestamp =
          typeof msg.messageTimestamp === 'number'
            ? msg.messageTimestamp
            : Number(msg.messageTimestamp ?? Math.floor(Date.now() / 1000));

        const normalized: IncomingMessage = {
          provider: PROVIDER,
          externalMessageId,
          from,
          to,
          text: text.trim(),
          timestamp,
          senderName: msg.pushName ?? undefined,
          rawPayload: msg,
        };

        if (this.handler) {
          await this.handler(normalized).catch((err) => {
            console.error('[baileys] Error procesando mensaje entrante:', err);
          });
        }
      }
    });
  }
}
