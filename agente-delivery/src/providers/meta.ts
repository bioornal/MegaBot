import type { WhatsAppProvider, IncomingMessage, ProviderStatus } from './types';

export class MetaProvider implements WhatsAppProvider {
  async start(): Promise<void> {
    throw new Error(
      'MetaProvider no implementado. ' +
      'Usá WHATSAPP_PROVIDER=ycloud para YCloud o WHATSAPP_PROVIDER=baileys para Baileys.'
    );
  }

  async stop(): Promise<void> {}

  async sendMessage(_to: string, _text: string): Promise<void> {
    throw new Error('MetaProvider no implementado.');
  }

  onMessage(_handler: (msg: IncomingMessage) => Promise<void>): void {}

  getStatus(): ProviderStatus {
    return 'disconnected';
  }

  async markAsRead(_msg: IncomingMessage): Promise<void> {}

  async sendTyping(_to: string): Promise<void> {}

  async stopTyping(_to: string): Promise<void> {}
}
