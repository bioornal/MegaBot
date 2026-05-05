import { NextResponse } from "next/server";
import { getSessionTenant } from "@/lib/tenant";
import { getDb } from "@/lib/db";

export const dynamic = 'force-dynamic';

export async function GET() {
  const tenant = await getSessionTenant();
  if (!tenant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(getDb(tenant.dataDir).listConversations());
}
