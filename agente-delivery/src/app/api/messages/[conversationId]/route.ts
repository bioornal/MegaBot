import { NextRequest, NextResponse } from "next/server";
import { getConversationById, getMessages, insertMessage, clearMessages } from "@/lib/db";
import { sendMessage } from "@/lib/send-message";

export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ conversationId: string }>;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);

  const convo = getConversationById(id);
  if (!convo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const messages = getMessages(id, 50);
  return NextResponse.json(messages);
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);

  const convo = getConversationById(id);
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
    await sendMessage(convo.phone, trimmed);
  } catch (err) {
    console.error("[messages] Error enviando mensaje:", err);
    return NextResponse.json(
      { error: "Error enviando mensaje a WhatsApp" },
      { status: 502 }
    );
  }

  const message = insertMessage(id, "human", trimmed);
  return NextResponse.json({ ok: true, messageId: message.id });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { conversationId } = await params;
  const id = parseInt(conversationId, 10);

  const convo = getConversationById(id);
  if (!convo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  clearMessages(id);
  return NextResponse.json({ ok: true });
}
