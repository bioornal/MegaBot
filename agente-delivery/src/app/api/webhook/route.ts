import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import {
  getOrCreateConversation,
  insertMessage,
  getConversationById,
  getRecentHistory,
} from "@/lib/db";
import { sendWhatsAppMessage } from "@/lib/ycloud";
import { getAIReply } from "@/lib/openai";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";

function verifySignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-ycloud-signature") ?? "";

  if (
    !verifySignature(
      rawBody,
      signature,
      process.env.YCLOUD_WEBHOOK_SECRET!
    )
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = JSON.parse(rawBody);

    if (
      body.type !== "whatsapp" ||
      body.payload?.type !== "text" ||
      !body.payload?.text?.body
    ) {
      return NextResponse.json({ ok: true });
    }

    const phone: string = body.payload.from;
    const name: string | undefined = body.payload.contact?.name;
    const messageText: string = body.payload.text.body;

    console.log(
      `[webhook] ← Mensaje de ${phone} (${name ?? "sin nombre"}): "${messageText}"`
    );

    const convo = getOrCreateConversation(phone, name);
    insertMessage(convo.id, "user", messageText);

    const fresh = getConversationById(convo.id);
    if (!fresh || fresh.mode !== "AI") {
      return NextResponse.json({ ok: true });
    }

    const history = getRecentHistory(convo.id, 20);
    const llmMessages = history.map((m) => ({
      role: (m.role === "human" ? "assistant" : m.role) as
        | "user"
        | "assistant",
      content: m.content,
    }));

    console.log(
      `[webhook] llamando LLM con ${llmMessages.length} mensajes...`
    );
    const start = Date.now();
    const reply = await getAIReply(llmMessages, SYSTEM_PROMPT);
    console.log(`[webhook] LLM respondió en ${Date.now() - start}ms`);

    insertMessage(convo.id, "assistant", reply);
    await sendWhatsAppMessage(phone, reply);
    console.log(`[webhook] → Enviado a ${phone}`);
  } catch (err) {
    console.error("[webhook] Error interno:", err);
    // NO re-throw — YCloud retries on 4xx/5xx, causing duplicate messages
  }

  return NextResponse.json({ ok: true });
}
