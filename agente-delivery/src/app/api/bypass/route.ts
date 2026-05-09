import { NextResponse } from 'next/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getSessionTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

function flagPath(dataDir: string): string {
  return path.join(path.resolve(dataDir), 'bypass_receipt.flag');
}

export async function GET() {
  const tenant = await getSessionTenant();
  if (!tenant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (tenant.id !== 'iguazufalls') {
    return NextResponse.json({ error: 'Solo disponible para IguazuFalls' }, { status: 403 });
  }
  const active = fs.existsSync(flagPath(tenant.dataDir));
  return NextResponse.json({ active });
}

export async function POST(req: Request) {
  const tenant = await getSessionTenant();
  if (!tenant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (tenant.id !== 'iguazufalls') {
    return NextResponse.json({ error: 'Solo disponible para IguazuFalls' }, { status: 403 });
  }

  const { active } = (await req.json()) as { active?: boolean };
  if (typeof active !== 'boolean') {
    return NextResponse.json({ error: 'Body { active: boolean } requerido' }, { status: 400 });
  }

  const file = flagPath(tenant.dataDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (active) {
    fs.writeFileSync(file, '1');
  } else {
    try { fs.unlinkSync(file); } catch { /* ya no existe */ }
  }
  return NextResponse.json({ active });
}
