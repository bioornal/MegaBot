import { sendWhatsAppMessage } from '../lib/ycloud';
import type { WhatsAppProvider, IncomingMessage, ProviderStatus } from './types';

export class YCloudProvider implements WhatsAppProvider {
  private status: ProviderStatus = 'connected';
  private handler: ((msg: IncomingMessage) => Promise<void>) | null = null;

  async start(): Promise<void> {
    this.status = 'connected';
    console.log('[ycloud] Provider listo (webhook-based, siempre conectado)');
  }

  async stop(): Promise<void> {
    this.status = 'disconnected';
  }

  async sendMessage(to: string, text: string): Promise<void> {
    await sendWhatsAppMessage(to, text);
  }

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.handler = handler;
  }

  async handleWebhookMessage(msg: IncomingMessage): Promise<void> {
    if (this.handler) await this.handler(msg);
  }

  getStatus(): ProviderStatus {
    return this.status;
  }
}
