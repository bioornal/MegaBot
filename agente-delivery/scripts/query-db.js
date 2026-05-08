const db = require('better-sqlite3')('./data/impasto/messages.db');

const conv = db.prepare('SELECT * FROM conversations WHERE phone=? ORDER BY id DESC LIMIT 1').get('5491112345678');

if (!conv) {
  console.log('No conversation found');
  process.exit(0);
}

const msgs = db.prepare(`
  SELECT
    datetime(created_at,'unixepoch','localtime') as ts,
    role,
    substr(content,1,200) as content
  FROM messages
  WHERE conversation_id = ?
  ORDER BY created_at ASC
`).all(conv.id);

console.log(`\n╔══════════════════════════════════════════════════════╗`);
console.log(`║ CONV ${conv.id} — ${conv.phone} (${conv.name})`);
console.log(`╚══════════════════════════════════════════════════════╝`);
console.log(`${msgs.length} mensajes:\n`);

msgs.forEach(m => {
  const arrow = m.role === 'user' ? '>>>' : '<<<';
  console.log(`${m.ts} ${arrow} ${m.content}`);
});