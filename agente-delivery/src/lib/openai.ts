import OpenAI from "openai";
import { toFile } from "openai/uploads";

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
  });
  return _client;
}

function hasImageContent(messages: Array<{ role: string; content: any }>): boolean {
  return messages.some((m) => typeof m.content !== 'string' && Array.isArray(m.content));
}

export async function getAIReply(
  messages: Array<{ role: "user" | "assistant"; content: any }>,
  systemPrompt: string
): Promise<string> {
  // DeepSeek NO soporta imágenes → usar OpenAI para mensajes con imagen
  const isDeepSeek = process.env.OPENAI_BASE_URL?.includes('deepseek');
  const hasImage = hasImageContent(messages);

  if (isDeepSeek && hasImage) {
    console.log('[openai] Mensaje con imagen → usando OpenAI para procesar');
    const openaiImageClient = new OpenAI({ apiKey: process.env.OPENAI_FALLBACK_KEY });
    const response = await openaiImageClient.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 200,
      temperature: 0.4,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    });
    return response.choices[0]?.message?.content ?? '';
  }

  // DeepSeek o OpenAI para texto
  // DeepSeek V4 usa thinking mode por defecto → lo desactivamos
  const dsParams: any = {
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    max_tokens: 500,
    temperature: 0.3,
    messages: [
      { role: "system" as const, content: systemPrompt },
      ...messages,
    ],
  };
  if (isDeepSeek) dsParams.thinking = { type: "disabled" };

  const response = await getClient().chat.completions.create(dsParams);

  return response.choices[0]?.message?.content ?? "";
}

export async function transcribeAudioBuffer(
  audio: Buffer,
  fileName = "audio.ogg"
): Promise<string> {
  // DeepSeek NO soporta /v1/audio/transcriptions → usar siempre OpenAI
  const client = process.env.OPENAI_BASE_URL?.includes('deepseek')
    ? new OpenAI({ apiKey: process.env.OPENAI_FALLBACK_KEY || process.env.OPENAI_API_KEY })
    : getClient();

  const response = await client.audio.transcriptions.create({
    file: await toFile(audio, fileName),
    model: process.env.OPENAI_TRANSCRIPTION_MODEL ?? "whisper-1",
  });

  const text =
    typeof response === "string"
      ? response
      : (response as { text?: string }).text ?? "";

  return text.trim();
}
