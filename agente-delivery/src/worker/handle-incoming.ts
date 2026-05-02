import {
  getOrCreateConversation,
  getConversationById,
  insertMessage,
  getRecentHistory,
} from '../lib/db';
import { getAIReply } from '../lib/openai';
import { SYSTEM_PROMPT } from '../lib/system-prompt';
import type { WhatsAppProvider, IncomingMessage } from '../providers/types';

export async function handleIncoming(
  msg: IncomingMessage,
  provider: WhatsAppProvider
): Promise<void> {
  console.log(
    `[handler] ← ${msg.provider} | de ${msg.from} (${msg.senderName ?? 'sin nombre'}): "${msg.text}"`
  );

  const convo = getOrCreateConversation(msg.from, msg.senderName);
  insertMessage(convo.id, 'user', msg.text);

  const fresh = getConversationById(convo.id);
  if (!fresh || fresh.mode !== 'AI') {
    console.log(`[handler] Conversación ${convo.id} en modo HUMAN — sin auto-respuesta`);
    return;
  }

  const history = getRecentHistory(convo.id, 20);
  const llmMessages = history.map((m) => ({
    role: (m.role === 'human' ? 'assistant' : m.role) as 'user' | 'assistant',
    content: m.content,
  }));

  console.log(`[handler] Llamando LLM con ${llmMessages.length} mensajes...`);
  const start = Date.now();
  const reply = await getAIReply(llmMessages, SYSTEM_PROMPT);
  console.log(`[handler] LLM respondió en ${Date.now() - start}ms`);

  insertMessage(convo.id, 'assistant', reply);
  await provider.sendMessage(msg.from, reply);
  console.log(`[handler] → Enviado a ${msg.from}`);
}
