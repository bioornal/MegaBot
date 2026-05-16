export type ProviderName = 'baileys' | 'ycloud' | 'meta' | 'twilio';

export type ProviderStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'waiting_qr'
  | 'error';

export interface IncomingMessage {
  provider: ProviderName;
  externalMessageId: string;
  from: string; // E.164 sin + o JID de WhatsApp: "549..." / "...@lid"
  to: string; // número/JID del bot
  text: string;
  timestamp: number; // unix epoch segundos
  senderName?: string; // nombre del contacto si está disponible
  fromMe?: boolean; // enviado por el operador desde dispositivo vinculado
  isSelfChat?: boolean; // el destinatario es el propio número del bot (chat de control)
  mediaType?: 'audio' | 'voice' | 'image' | 'video' | 'document';
  mediaUrl?: string;
  mediaMimeType?: string;
  originalText?: string;
  rawPayload: unknown;
}

export interface WhatsAppProvider {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(to: string, text: string): Promise<void>;
  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void;
  getStatus(): ProviderStatus;
  getQrCode?(): string | null;
  markAsRead(msg: IncomingMessage): Promise<void>;
  sendTyping(to: string): Promise<void>;
  stopTyping(to: string): Promise<void>;
}
