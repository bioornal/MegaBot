import OpenAI from "openai";
import { toFile } from "openai/uploads";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function getAIReply(
  messages: Array<{ role: "user" | "assistant"; content: any }>,
  systemPrompt: string
): Promise<string> {
  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
  });

  return response.choices[0]?.message?.content ?? "";
}

export async function transcribeAudioBuffer(
  audio: Buffer,
  fileName = "audio.ogg"
): Promise<string> {
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
