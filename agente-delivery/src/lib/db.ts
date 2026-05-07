import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { Conversation, ConversationWithPreview, Message } from '../types';

export interface DbContext {
  getOrCreateConversation(phone: string, name?: string): Conversation;
  getConversationById(id: number): Conversation | null;
  insertMessage(conversationId: number, role: "user" | "assistant" | "human", content: string, mediaUrl?: string | null): Message;
  getMessages(conversationId: number, limit?: number): Message[];
  getRecentHistory(conversationId: number, limit?: number): Message[];
  setMode(conversationId: number, mode: "AI" | "HUMAN"): void;
  listConversations(): ConversationWithPreview[];
  deleteConversation(id: number): void;
  clearMessages(conversationId: number): void;
  getConversationByPhone(phone: string): Conversation | null;
  getReservationState(conversationId: number): string | null;
  setReservationState(conversationId: number, json: string | null): void;
}

const cache = new Map<string, DbContext>();

export function getDb(dataDir: string): DbContext {
  const resolved = path.resolve(dataDir);
  const cached = cache.get(resolved);
  if (cached) return cached;

  fs.mkdirSync(resolved, { recursive: true });
  const db = new Database(path.join(resolved, "messages.db"));
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
      media_url        TEXT,
      created_at       INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conv
      ON messages(conversation_id, created_at);
  `);
  try { db.exec(`ALTER TABLE messages ADD COLUMN media_url TEXT;`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE conversations ADD COLUMN reservation_state TEXT;`); } catch { /* already exists */ }

  const stmts = {
    upsertConversation: db.prepare(`
      INSERT INTO conversations (phone, name) VALUES (?, ?)
      ON CONFLICT(phone) DO UPDATE SET name = COALESCE(excluded.name, conversations.name)
      RETURNING *
    `),
    getConversationById: db.prepare(`SELECT * FROM conversations WHERE id = ?`),
    setMode: db.prepare(`UPDATE conversations SET mode = ? WHERE id = ?`),
    listConversations: db.prepare(`
      SELECT c.*,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_preview,
        (SELECT role FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_role
      FROM conversations c
      ORDER BY COALESCE(c.last_message_at, 0) DESC
    `),
    insertMessage: db.prepare(`INSERT INTO messages (conversation_id, role, content, media_url) VALUES (?, ?, ?, ?) RETURNING *`),
    updateLastMessageAt: db.prepare(`UPDATE conversations SET last_message_at = unixepoch() WHERE id = ?`),
    getMessages: db.prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?`),
    getRecentHistoryDesc: db.prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?`),
    deleteMessages: db.prepare(`DELETE FROM messages WHERE conversation_id = ?`),
    getConversationByPhone: db.prepare(`SELECT * FROM conversations WHERE phone = ? OR phone LIKE ? LIMIT 1`),
    deleteConversation: db.prepare(`DELETE FROM conversations WHERE id = ?`),
    getReservationState: db.prepare(`SELECT reservation_state FROM conversations WHERE id = ?`),
    setReservationState: db.prepare(`UPDATE conversations SET reservation_state = ? WHERE id = ?`),
  };

  const insertMessageTx = db.transaction(
    (conversationId: number, role: string, content: string, mediaUrl: string | null): Message => {
      const msg = stmts.insertMessage.get(conversationId, role, content, mediaUrl) as Message;
      stmts.updateLastMessageAt.run(conversationId);
      return msg;
    }
  );

  const deleteConversationTx = db.transaction((id: number) => {
    stmts.deleteMessages.run(id);
    stmts.deleteConversation.run(id);
  });

  const ctx: DbContext = {
    getOrCreateConversation(phone, name) {
      return stmts.upsertConversation.get(phone, name ?? null) as Conversation;
    },
    getConversationById(id) {
      return (stmts.getConversationById.get(id) as Conversation) ?? null;
    },
    insertMessage(conversationId, role, content, mediaUrl = null) {
      return insertMessageTx(conversationId, role, content, mediaUrl);
    },
    getMessages(conversationId, limit = 50) {
      return stmts.getMessages.all(conversationId, limit) as Message[];
    },
    getRecentHistory(conversationId, limit = 20) {
      const rows = stmts.getRecentHistoryDesc.all(conversationId, limit) as Message[];
      return rows.reverse();
    },
    setMode(conversationId, mode) {
      stmts.setMode.run(mode, conversationId);
    },
    listConversations() {
      return stmts.listConversations.all() as ConversationWithPreview[];
    },
    deleteConversation(id) {
      deleteConversationTx(id);
    },
    clearMessages(conversationId) {
      stmts.deleteMessages.run(conversationId);
    },
    getConversationByPhone(phone) {
      const digits = phone.replace(/\D/g, '');
      return (stmts.getConversationByPhone.get(digits, `${digits}@%`) as Conversation) ?? null;
    },
    getReservationState(conversationId) {
      const row = stmts.getReservationState.get(conversationId) as { reservation_state: string | null } | undefined;
      return row?.reservation_state ?? null;
    },
    setReservationState(conversationId, json) {
      stmts.setReservationState.run(json, conversationId);
    },
  };

  cache.set(resolved, ctx);
  return ctx;
}

// Backward-compat named exports (worker imports these directly)
const defaultDataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), 'data');

export const getOrCreateConversation = (...args: Parameters<DbContext['getOrCreateConversation']>) => getDb(defaultDataDir).getOrCreateConversation(...args);
export const getConversationById = (...args: Parameters<DbContext['getConversationById']>) => getDb(defaultDataDir).getConversationById(...args);
export const insertMessage = (...args: Parameters<DbContext['insertMessage']>) => getDb(defaultDataDir).insertMessage(...args);
export const getMessages = (...args: Parameters<DbContext['getMessages']>) => getDb(defaultDataDir).getMessages(...args);
export const getRecentHistory = (...args: Parameters<DbContext['getRecentHistory']>) => getDb(defaultDataDir).getRecentHistory(...args);
export const setMode = (...args: Parameters<DbContext['setMode']>) => getDb(defaultDataDir).setMode(...args);
export const listConversations = () => getDb(defaultDataDir).listConversations();
export const deleteConversation = (...args: Parameters<DbContext['deleteConversation']>) => getDb(defaultDataDir).deleteConversation(...args);
export const clearMessages = (...args: Parameters<DbContext['clearMessages']>) => getDb(defaultDataDir).clearMessages(...args);
export const getConversationByPhone = (...args: Parameters<DbContext['getConversationByPhone']>) => getDb(defaultDataDir).getConversationByPhone(...args);
export const getReservationState = (...args: Parameters<DbContext['getReservationState']>) => getDb(defaultDataDir).getReservationState(...args);
export const setReservationState = (...args: Parameters<DbContext['setReservationState']>) => getDb(defaultDataDir).setReservationState(...args);
