import { NextRequest, NextResponse } from "next/server";
import { getSessionTenant } from "@/lib/tenant";
import { getDb } from "@/lib/db";

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const tenant = await getSessionTenant();
  if (!tenant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = getDb(tenant.dataDir);

  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);

  const convo = db.getConversationById(id);
  if (!convo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const mode = body?.mode;
  if (mode !== "AI" && mode !== "HUMAN") {
    return NextResponse.json(
      { error: "mode debe ser AI o HUMAN" },
      { status: 400 }
    );
  }

  db.setMode(id, mode);
  return NextResponse.json({ ok: true, mode });
}
