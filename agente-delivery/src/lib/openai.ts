import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function getAIReply(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
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
