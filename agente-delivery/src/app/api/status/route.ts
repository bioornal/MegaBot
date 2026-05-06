import { NextResponse } from 'next/server';
import { getSessionTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function GET() {
  const provider = process.env.WHATSAPP_PROVIDER ?? 'ycloud';

  if (provider !== 'baileys') {
    return NextResponse.json({ status: 'connected', provider });
  }

  const tenant = await getSessionTenant();
  if (!tenant) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const res = await fetch(`${tenant.workerUrl}/status`, {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Worker respondió ${res.status}`);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({
      status: 'disconnected',
      provider: 'baileys',
      error: `Worker ${tenant.id} no disponible (${tenant.workerUrl}).`,
    });
  }
}
