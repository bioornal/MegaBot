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

// Cliente dedicado a OpenAI real (nunca DeepSeek) para audio e imágenes
let _openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!_openaiClient) {
    const key = process.env.OPENAI_FALLBACK_KEY || process.env.OPENAI_API_KEY || '';
    _openaiClient = new OpenAI({ apiKey: key, baseURL: 'https://api.openai.com/v1' });
  }
  return _openaiClient;
}

function hasImageContent(messages: Array<{ role: string; content: any }>): boolean {
  return messages.some((m) => typeof m.content !== 'string' && Array.isArray(m.content));
}

export async function getAIReply(
  messages: Array<{ role: "user" | "assistant"; content: any }>,
  systemPrompt: string,
  modelOverride?: string
): Promise<string> {
  const isDeepSeek = process.env.OPENAI_BASE_URL?.includes('deepseek');
  const hasImage = hasImageContent(messages);

  if (isDeepSeek && hasImage) {
    console.log('[openai] Mensaje con imagen → usando OpenAI gpt-4o-mini');
    const response = await getOpenAIClient().chat.completions.create({
      model: modelOverride ?? 'gpt-4o-mini',
      max_tokens: 200,
      temperature: 0.4,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    });
    return response.choices[0]?.message?.content ?? '';
  }

  const model = modelOverride ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const dsParams: any = {
    model,
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
  const isDeepSeek = process.env.OPENAI_BASE_URL?.includes('deepseek');
  const fallbackKey = process.env.OPENAI_FALLBACK_KEY || '';
  const mainKey = process.env.OPENAI_API_KEY || '';

  console.log('[openai:audio] isDeepSeek:', isDeepSeek,
    '| fallbackKey.len:', fallbackKey.length,
    '| fallbackKey:', fallbackKey.slice(0, 15) + '...' + fallbackKey.slice(-4),
    '| mainKey.len:', mainKey.length,
    '| mainKey:', mainKey.slice(0, 15) + '...' + mainKey.slice(-4));

  // Crear siempre cliente nuevo apuntando a OpenAI real, nunca cacheado
  const apiKey = (fallbackKey || mainKey).trim();
  const client = new OpenAI({ apiKey, baseURL: 'https://api.openai.com/v1' });

  const response = await client.audio.transcriptions.create({
    file: await toFile(audio, fileName),
    model: "whisper-1",
  });

  const text =
    typeof response === "string"
      ? response
      : (response as { text?: string }).text ?? "";

  return text.trim();
}
