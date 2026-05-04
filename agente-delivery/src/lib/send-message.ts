import { sendWhatsAppMessage } from './ycloud';

export async function sendMessage(to: string, text: string): Promise<void> {
  const provider = process.env.WHATSAPP_PROVIDER ?? 'ycloud';

  if (provider === 'baileys') {
    const workerUrl = (
      process.env.WORKER_INTERNAL_URL ?? 'http://localhost:3001'
    ).replace(/\/+$/, '');
    const res = await fetch(`${workerUrl}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Worker /send falló (${res.status}): ${body}`);
    }
    return;
  }

  if (provider === 'ycloud') {
    await sendWhatsAppMessage(to, text);
    return;
  }

  throw new Error(`sendMessage: proveedor "${provider}" no implementado para envío directo`);
}
