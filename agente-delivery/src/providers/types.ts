export type ProviderName = 'baileys' | 'ycloud' | 'meta';

export type ProviderStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'waiting_qr'
  | 'error';

export interface IncomingMessage {
  provider: ProviderName;
  externalMessageId: string;
  from: string;        // E.164 sin +: "5491112345678"
  to: string;          // número del bot
  text: string;
  timestamp: number;   // unix epoch segundos
  senderName?: string; // nombre del contacto si está disponible
  rawPayload: unknown;
}

export interface WhatsAppProvider {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(to: string, text: string): Promise<void>;
  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void;
  getStatus(): ProviderStatus;
  getQrCode?(): string | null; // sólo Baileys lo implementa
}
