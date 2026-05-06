import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import {
  getOrCreateConversation,
  insertMessage,
  getConversationById,
  getRecentHistory,
} from "@/lib/db";
import { sendMessage } from "@/lib/send-message";
import { getAIReply, transcribeAudioBuffer } from "@/lib/openai";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { getCatalogContext } from "@/lib/catalog";
import { getCompanyInfoContext } from "@/lib/company-info";
import { randomDelayMs, sleep } from "@/lib/delay";

const AI_REPLY_DELAY_MIN_MS = 5_000;
const AI_REPLY_DELAY_MAX_MS = 10_000;

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

function isAudioPayload(payload: any): boolean {
  const type = String(payload?.type ?? "").toLowerCase();
  return type === "audio" || type === "voice" || type === "ptt";
}

function findFirstMediaUrl(value: unknown, depth = 0): string | null {
  if (!value || depth > 4) return null;
  if (typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const directKeys = ["url", "link", "mediaUrl", "media_url", "downloadUrl"];
  for (const key of directKeys) {
    const candidate = record[key];
    if (typeof candidate === "string" && /^https?:\/\//i.test(candidate)) {
      return candidate;
    }
  }

  for (const nested of Object.values(record)) {
    const found = findFirstMediaUrl(nested, depth + 1);
    if (found) return found;
  }

  return null;
}

async function downloadAudioBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: process.env.YCLOUD_API_KEY
      ? { "X-API-Key": process.env.YCLOUD_API_KEY }
      : undefined,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`No se pudo descargar el audio (${res.status}): ${body}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function extractIncomingTextFromWebhook(body: any): Promise<{
  text: string | null;
  originalText?: string;
  mediaType?: "audio" | "voice";
}> {
  const payload = body?.payload;
  const type = String(payload?.type ?? "").toLowerCase();

  if (type === "text" && payload?.text?.body) {
    return { text: String(payload.text.body) };
  }

  if (!isAudioPayload(payload)) {
    return { text: null };
  }

  const mediaUrl =
    findFirstMediaUrl(payload) ||
    findFirstMediaUrl(payload?.audio) ||
    findFirstMediaUrl(payload?.voice) ||
    findFirstMediaUrl(payload?.media);

  if (!mediaUrl) {
    return { text: null, originalText: "[audio]", mediaType: type === "voice" ? "voice" : "audio" };
  }

  const audioBuffer = await downloadAudioBuffer(mediaUrl);
  const transcript = await transcribeAudioBuffer(
    audioBuffer,
    mediaUrl.includes(".")
      ? mediaUrl.split("/").pop()?.split("?")[0] ?? "audio.ogg"
      : "audio.ogg"
  );

  return {
    text: transcript || null,
    originalText: "[audio transcripto]",
    mediaType: type === "voice" ? "voice" : "audio",
  };
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

  if (process.env.WHATSAPP_PROVIDER === "baileys") {
    return NextResponse.json({ ok: true });
  }

  try {
    const body = JSON.parse(rawBody);

    if (body.type !== "whatsapp") {
      return NextResponse.json({ ok: true });
    }

    const phone: string = body.payload.from;
    const name: string | undefined = body.payload.contact?.name;
    const extracted = await extractIncomingTextFromWebhook(body);

    if (!extracted.text) {
      return NextResponse.json({ ok: true });
    }

    const messageText: string = extracted.text;
    const storedText = extracted.originalText
      ? `${extracted.originalText}\n${messageText}`
      : messageText;

    console.log(
      `[webhook] <- Mensaje de ${phone} (${name ?? "sin nombre"}): "${messageText}"`
    );

    const convo = getOrCreateConversation(phone, name);
    insertMessage(convo.id, "user", storedText);

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
    const companyInfoContext = await getCompanyInfoContext();
    const catalogContext = await getCatalogContext(messageText);
    const reply = await getAIReply(
      llmMessages,
      [SYSTEM_PROMPT, companyInfoContext, catalogContext]
        .filter(Boolean)
        .join("\n\n")
    );
    console.log(`[webhook] LLM respondio en ${Date.now() - start}ms`);

    const delayMs = randomDelayMs(AI_REPLY_DELAY_MIN_MS, AI_REPLY_DELAY_MAX_MS);
    console.log(`[webhook] Esperando ${delayMs}ms antes de enviar respuesta IA...`);
    await sleep(delayMs);

    insertMessage(convo.id, "assistant", reply);
    // El webhook YCloud no es multi-tenant; en baileys este path no se usa.
    // sendMessage ignora workerUrl cuando WHATSAPP_PROVIDER=ycloud.
    await sendMessage(phone, reply, "");
    console.log(`[webhook] -> Enviado a ${phone}`);
  } catch (err) {
    console.error("[webhook] Error interno:", err);
    // YCloud retries on 4xx/5xx, causing duplicate messages.
  }

  return NextResponse.json({ ok: true });
}
