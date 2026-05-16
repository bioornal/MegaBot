import type { WhatsAppProvider, ProviderName } from './types';

export function getProviderName(): ProviderName {
  const raw = process.env.WHATSAPP_PROVIDER ?? 'ycloud';
  if (raw !== 'baileys' && raw !== 'ycloud' && raw !== 'meta' && raw !== 'twilio') {
    throw new Error(
      `WHATSAPP_PROVIDER inválido: "${raw}". Valores válidos: baileys | ycloud | meta | twilio`
    );
  }
  return raw;
}

export async function createProvider(name: ProviderName): Promise<WhatsAppProvider> {
  if (name === 'baileys') {
    const { BaileysProvider } = await import('./baileys');
    return new BaileysProvider();
  }
  if (name === 'ycloud') {
    const { YCloudProvider } = await import('./ycloud');
    return new YCloudProvider();
  }
  if (name === 'twilio') {
    const { TwilioProvider } = await import('./twilio');
    return new TwilioProvider();
  }
  const { MetaProvider } = await import('./meta');
  return new MetaProvider();
}
