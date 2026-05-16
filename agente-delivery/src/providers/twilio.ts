import twilio from 'twilio';
import type { WhatsAppProvider, ProviderStatus, IncomingMessage } from './types';

export class TwilioProvider implements WhatsAppProvider {
  private client: ReturnType<typeof twilio>;
  private from: string;

  constructor() {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_WHATSAPP_FROM;
    if (!sid || !token || !from) {
      throw new Error(
        '[TwilioProvider] Faltan TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN o TWILIO_WHATSAPP_FROM'
      );
    }
    this.client = twilio(sid, token);
    this.from = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
  }

  async start(): Promise<void> {
    console.log('[TwilioProvider] Listo — webhook-based, sin conexión persistente');
  }

  async stop(): Promise<void> {}

  getStatus(): ProviderStatus {
    return 'connected';
  }

  // onMessage no se usa en Twilio: los mensajes entrantes llegan vía webhook HTTP,
  // no por polling. El webhook route llama al worker /incoming directamente.
  onMessage(_handler: (msg: IncomingMessage) => Promise<void>): void {}

  async sendMessage(to: string, text: string): Promise<void> {
    // to viene en formato E.164 sin + (ej: "5491112345678")
    const dest = `whatsapp:+${to}`;
    await this.client.messages.create({
      from: this.from,
      to: dest,
      body: text,
    });
  }

  async markAsRead(_msg: IncomingMessage): Promise<void> {}
  async sendTyping(_to: string): Promise<void> {}
  async stopTyping(_to: string): Promise<void> {}
}
