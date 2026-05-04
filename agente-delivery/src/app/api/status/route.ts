import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const provider = process.env.WHATSAPP_PROVIDER ?? 'ycloud';

  if (provider !== 'baileys') {
    // YCloud y Meta son webhook-based: si están configurados, están "conectados"
    return NextResponse.json({ status: 'connected', provider });
  }

  const workerUrl = process.env.WORKER_INTERNAL_URL ?? 'http://localhost:3001';

  try {
    const res = await fetch(`${workerUrl}/status`, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Worker respondió ${res.status}`);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({
      status: 'disconnected',
      provider: 'baileys',
      error: 'Worker no disponible — ¿corrés npm run worker:dev?',
    });
  }
}
