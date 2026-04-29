// Verification script — run with: node src/lib/db.test.mjs
import Database from "better-sqlite3";
import assert from "node:assert/strict";

const db = new Database(":memory:");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    name TEXT,
    mode TEXT CHECK(mode IN ('AI','HUMAN')) NOT NULL DEFAULT 'AI',
    last_message_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    role TEXT CHECK(role IN ('user','assistant','human')) NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

const upsert = db.prepare(`
  INSERT INTO conversations (phone, name) VALUES (?, ?)
  ON CONFLICT(phone) DO UPDATE SET name = COALESCE(excluded.name, conversations.name)
  RETURNING *
`);
const insertMsg = db.prepare(`INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?) RETURNING *`);
const updateTs = db.prepare(`UPDATE conversations SET last_message_at = unixepoch() WHERE id = ?`);
const insertTx = db.transaction((cid, role, content) => {
  const m = insertMsg.get(cid, role, content);
  updateTs.run(cid);
  return m;
});
const getMsgs = db.prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?`);
const setMode = db.prepare(`UPDATE conversations SET mode = ? WHERE id = ?`);
const getById = db.prepare(`SELECT * FROM conversations WHERE id = ?`);
const list = db.prepare(`SELECT c.*, (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_preview FROM conversations c ORDER BY COALESCE(c.last_message_at,0) DESC`);
const delMsgs = db.prepare(`DELETE FROM messages WHERE conversation_id = ?`);
const delConv = db.prepare(`DELETE FROM conversations WHERE id = ?`);
const delTx = db.transaction((id) => { delMsgs.run(id); delConv.run(id); });

// Test: create conversation
const c1 = upsert.get("5492994001234", "María García");
assert.equal(c1.phone, "5492994001234");
assert.equal(c1.name, "María García");
assert.equal(c1.mode, "AI");

// Test: idempotent upsert
const c2 = upsert.get("5492994001234", null);
assert.equal(c2.id, c1.id);
assert.equal(c2.name, "María García"); // name preserved with COALESCE

// Test: insert message
const m1 = insertTx(c1.id, "user", "Hola quiero info de sommiers");
assert.equal(m1.role, "user");
assert.equal(m1.content, "Hola quiero info de sommiers");

// Test: getMessages
const msgs = getMsgs.all(c1.id, 50);
assert.equal(msgs.length, 1);

// Test: setMode
setMode.run("HUMAN", c1.id);
const fresh = getById.get(c1.id);
assert.equal(fresh.mode, "HUMAN");

// Test: listConversations with preview
const rows = list.all();
assert.ok(rows.find(r => r.id === c1.id));
assert.equal(rows[0].last_message_preview, "Hola quiero info de sommiers");

// Test: deleteConversation
delTx(c1.id);
const rows2 = list.all();
assert.ok(!rows2.find(r => r.id === c1.id));

console.log("✓ Todos los tests de DB pasaron");
