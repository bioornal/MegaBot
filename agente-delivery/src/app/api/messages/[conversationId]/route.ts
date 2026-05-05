import { NextRequest, NextResponse } from "next/server";
import { getSessionTenant } from "@/lib/tenant";
import { getDb } from "@/lib/db";
import { sendMessage } from "@/lib/send-message";

export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const tenant = await getSessionTenant();
  if (!tenant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = getDb(tenant.dataDir);

  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);

  const convo = db.getConversationById(id);
  if (!convo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(db.getMessages(id, 50));
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
  if (convo.mode !== "HUMAN") {
    return NextResponse.json(
      { error: "Conversación no está en modo HUMAN" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const content: string = body?.content;
  if (!content || typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: "content requerido" }, { status: 400 });
  }

  const trimmed = content.trim();

  try {
    await sendMessage(convo.phone, trimmed, tenant.workerUrl);
  } catch (err) {
    console.error("[messages] Error enviando mensaje:", err);
    return NextResponse.json(
      { error: "Error enviando mensaje a WhatsApp" },
      { status: 502 }
    );
  }

  const message = db.insertMessage(id, "human", trimmed);
  return NextResponse.json({ ok: true, messageId: message.id });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const tenant = await getSessionTenant();
  if (!tenant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = getDb(tenant.dataDir);

  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);

  const convo = db.getConversationById(id);
  if (!convo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  db.clearMessages(id);
  return NextResponse.json({ ok: true });
}
