import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { Conversation, ConversationWithPreview, Message } from '../types';

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "messages.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    phone            TEXT UNIQUE NOT NULL,
    name             TEXT,
    mode             TEXT CHECK(mode IN ('AI','HUMAN')) NOT NULL DEFAULT 'AI',
    last_message_at  INTEGER,
    created_at       INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS messages (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id  INTEGER NOT NULL REFERENCES conversations(id),
    role             TEXT CHECK(role IN ('user','assistant','human')) NOT NULL,
    content          TEXT NOT NULL,
    created_at       INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conv
    ON messages(conversation_id, created_at);
`);

const stmts = {
  upsertConversation: db.prepare(`
    INSERT INTO conversations (phone, name) VALUES (?, ?)
    ON CONFLICT(phone) DO UPDATE SET name = COALESCE(excluded.name, conversations.name)
    RETURNING *
  `),
  getConversationById: db.prepare(
    `SELECT * FROM conversations WHERE id = ?`
  ),
  setMode: db.prepare(
    `UPDATE conversations SET mode = ? WHERE id = ?`
  ),
  listConversations: db.prepare(`
    SELECT c.*,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_preview
    FROM conversations c
    ORDER BY COALESCE(c.last_message_at, 0) DESC
  `),
  insertMessage: db.prepare(`
    INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)
    RETURNING *
  `),
  updateLastMessageAt: db.prepare(
    `UPDATE conversations SET last_message_at = unixepoch() WHERE id = ?`
  ),
  getMessages: db.prepare(`
    SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?
  `),
  getRecentHistoryDesc: db.prepare(`
    SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?
  `),
  deleteMessages: db.prepare(
    `DELETE FROM messages WHERE conversation_id = ?`
  ),
  deleteConversation: db.prepare(
    `DELETE FROM conversations WHERE id = ?`
  ),
};

export function getOrCreateConversation(
  phone: string,
  name?: string
): Conversation {
  return stmts.upsertConversation.get(phone, name ?? null) as Conversation;
}

export function getConversationById(id: number): Conversation | null {
  return (stmts.getConversationById.get(id) as Conversation) ?? null;
}

const insertMessageTx = db.transaction(
  (conversationId: number, role: string, content: string): Message => {
    const msg = stmts.insertMessage.get(
      conversationId,
      role,
      content
    ) as Message;
    stmts.updateLastMessageAt.run(conversationId);
    return msg;
  }
);

export function insertMessage(
  conversationId: number,
  role: "user" | "assistant" | "human",
  content: string
): Message {
  return insertMessageTx(conversationId, role, content);
}

export function getMessages(
  conversationId: number,
  limit = 50
): Message[] {
  return stmts.getMessages.all(conversationId, limit) as Message[];
}

export function getRecentHistory(
  conversationId: number,
  limit = 20
): Message[] {
  const rows = stmts.getRecentHistoryDesc.all(
    conversationId,
    limit
  ) as Message[];
  return rows.reverse();
}

export function setMode(
  conversationId: number,
  mode: "AI" | "HUMAN"
): void {
  stmts.setMode.run(mode, conversationId);
}

export function listConversations(): ConversationWithPreview[] {
  return stmts.listConversations.all() as ConversationWithPreview[];
}

const deleteConversationTx = db.transaction((id: number) => {
  stmts.deleteMessages.run(id);
  stmts.deleteConversation.run(id);
});

export function deleteConversation(id: number): void {
  deleteConversationTx(id);
}
