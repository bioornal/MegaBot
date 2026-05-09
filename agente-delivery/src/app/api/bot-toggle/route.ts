import { NextResponse } from 'next/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getSessionTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

function flagPath(dataDir: string): string {
  return path.join(path.resolve(dataDir), 'bot_paused.flag');
}

export async function GET() {
  const tenant = await getSessionTenant();
  if (!tenant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const paused = fs.existsSync(flagPath(tenant.dataDir));
  return NextResponse.json({ paused });
}

export async function POST(req: Request) {
  const tenant = await getSessionTenant();
  if (!tenant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { paused } = (await req.json()) as { paused?: boolean };
  if (typeof paused !== 'boolean') {
    return NextResponse.json({ error: 'Body { paused: boolean } requerido' }, { status: 400 });
  }

  const file = flagPath(tenant.dataDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (paused) {
    fs.writeFileSync(file, '1');
  } else {
    try { fs.unlinkSync(file); } catch { /* ya no existe */ }
  }
  return NextResponse.json({ paused });
}