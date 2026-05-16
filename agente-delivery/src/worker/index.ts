import http from 'node:http';
import { createProvider, getProviderName } from '../providers/factory';
import { handleIncoming } from './handle-incoming';
import { getTenantById } from '../tenants.config';
import { fetchMenuItems } from '../lib/insforge-client';

function loadTenantOrExit() {
  const id = process.env.TENANT_ID;
  if (!id) {
    console.error('[worker] FATAL: TENANT_ID env var es obligatorio.');
    process.exit(1);
  }
  const t = getTenantById(id);
  if (!t) {
    console.error(`[worker] FATAL: TENANT_ID="${id}" no existe en tenants.config.ts`);
    process.exit(1);
  }
  return t;
}
const TENANT = loadTenantOrExit();

const PORT = parseInt(process.env.WORKER_PORT ?? '', 10);
if (!Number.isFinite(PORT)) {
  console.error('[worker] FATAL: WORKER_PORT env var es obligatorio.');
  process.exit(1);
}

async function main() {
  const providerName = getProviderName();
  console.log(
    `[worker] boot | tenant=${TENANT.id} | port=${PORT} | dataDir=${TENANT.dataDir} | provider=${providerName}`
  );

  const provider = await createProvider(providerName);
  provider.onMessage((msg) => handleIncoming(msg, provider));

  await provider.start();

  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'GET' && req.url === '/status') {
      const status = provider.getStatus();
      const qr = provider.getQrCode?.() ?? null;
      res.writeHead(200);
      res.end(JSON.stringify({ status, provider: providerName, qr }));
      return;
    }

    if (req.method === 'POST' && req.url === '/send') {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const { to, text } = JSON.parse(body) as { to: string; text: string };
          if (!to || !text) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'to y text son requeridos' }));
            return;
          }
          await provider.sendMessage(to, text);
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          console.error('[worker] Error en POST /send:', err);
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    // Endpoint para providers webhook (Twilio, YCloud, etc.)
    // Llamado por la API route de Next.js cuando llega un webhook.
    // Body: { from: string, text: string, senderName?: string }
    if (req.method === 'POST' && req.url === '/incoming') {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const { from, text, senderName } = JSON.parse(body) as {
            from: string;
            text: string;
            senderName?: string;
          };
          if (!from || !text) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'from y text son requeridos' }));
            return;
          }
          const msg = {
            from,
            text,
            senderName: senderName ?? from,
            fromMe: false,
            isSelfChat: false,
            mediaUrl: undefined as string | undefined,
            provider: providerName,
            externalMessageId: `webhook-${Date.now()}`,
            to: process.env.TWILIO_WHATSAPP_FROM ?? process.env.TENANT_PHONE_NUMBER ?? '',
            timestamp: Math.floor(Date.now() / 1000),
            rawPayload: { from, text },
          };
          // Fire-and-forget: responde 200 de inmediato para no bloquear el webhook
          handleIncoming(msg, provider as any).catch((err: unknown) =>
            console.error('[worker] Error en handleIncoming (webhook):', err)
          );
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          console.error('[worker] Error en POST /incoming:', err);
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    // Endpoint de test: inyecta un mensaje entrante directamente al handler
    // Para probar sin WhatsApp. Body: { from: string, text: string, senderName?: string }
    if (req.method === 'POST' && req.url === '/test-inject') {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const { from, text, senderName } = JSON.parse(body) as {
            from: string;
            text: string;
            senderName?: string;
          };
          if (!from || !text) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'from y text son requeridos' }));
            return;
          }
          const msg = {
            from,
            text,
            senderName: senderName ?? 'Test',
            fromMe: false,
            isSelfChat: false,
            mediaUrl: undefined as string | undefined,
            provider: 'baileys' as const,
            externalMessageId: `test-${Date.now()}`,
            to: `${process.env.TENANT_PHONE_NUMBER ?? '5490000000000'}@s.whatsapp.net`,
            timestamp: Math.floor(Date.now() / 1000),
            rawPayload: { from, text },
          };
          console.log(`[test-inject] Simulating incoming from ${from}: "${text}"`);
          await handleIncoming(msg, provider as any);
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          console.error('[worker] Error en POST /test-inject:', err);
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    // Endpoint de test: limpia el cart de un número (para tests limpios)
    if (req.method === 'POST' && req.url === '/test-reset') {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const { from } = JSON.parse(body) as { from: string };
          if (!from) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'from es requerido' }));
            return;
          }
          const { clearCart } = require('../lib/cart');
          clearCart(from);
          console.log(`[test-reset] Cart limpiado para ${from}`);
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[worker] HTTP interno escuchando en http://127.0.0.1:${PORT}`);
  });

  // ── Insforge keep-alive ──
  // El tier gratuito de Insforge pausa proyectos inactivos.
  // Un ping cada ~24h mantiene el backend vivo sin parecer un bot.
  if (TENANT.dataSource === 'insforge') {
    const INTERVAL_HOURS = 24;
    const JITTER_MAX_MINUTES = 60; // ±30 min random para no ser predecible

    const ping = async () => {
      try {
        const items = await fetchMenuItems();
        console.log(`[worker] Insforge keep-alive OK (${items.length} productos)`);
      } catch {
        // Silencioso — si falla, el próximo intento en 24h lo resuelve
      }
    };

    // Primer ping al arrancar
    setTimeout(ping, 30_000);

    // Ping cada ~24h con jitter aleatorio
    const schedule = () => {
      const jitter = Math.floor(Math.random() * JITTER_MAX_MINUTES * 2 - JITTER_MAX_MINUTES) * 60_000;
      const interval = INTERVAL_HOURS * 60 * 60 * 1000 + jitter;
      setTimeout(() => {
        ping();
        schedule();
      }, interval);
    };
    schedule();
  }

  process.on('SIGINT', async () => {
    console.log('\n[worker] Deteniendo...');
    await provider.stop();
    server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await provider.stop();
    server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[worker] Error fatal:', err);
  process.exit(1);
});
