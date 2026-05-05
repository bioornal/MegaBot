import { NextResponse } from 'next/server';
import { getSessionTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function GET() {
  const provider = process.env.WHATSAPP_PROVIDER ?? 'ycloud';

  if (provider !== 'baileys') {
    return NextResponse.json({ status: 'connected', provider });
  }

  const tenant = await getSessionTenant();
  // En dev, WORKER_INTERNAL_URL apunta al único worker corriendo (puerto real).
  // En producción no está seteado → usa el workerUrl del tenant (3001/3002/3003).
  const workerUrl = process.env.WORKER_INTERNAL_URL ?? tenant?.workerUrl ?? 'http://localhost:3001';

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
