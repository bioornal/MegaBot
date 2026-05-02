import type { WhatsAppProvider, ProviderName } from './types';

export function getProviderName(): ProviderName {
  const raw = process.env.WHATSAPP_PROVIDER ?? 'ycloud';
  if (raw !== 'baileys' && raw !== 'ycloud' && raw !== 'meta') {
    throw new Error(
      `WHATSAPP_PROVIDER inválido: "${raw}". Valores válidos: baileys | ycloud | meta`
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
  const { MetaProvider } = await import('./meta');
  return new MetaProvider();
}
