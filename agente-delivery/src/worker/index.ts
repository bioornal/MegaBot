import http from 'node:http';
import { createProvider, getProviderName } from '../providers/factory';
import { handleIncoming } from './handle-incoming';

const PORT = parseInt(process.env.WORKER_PORT ?? '3001', 10);

async function main() {
  const providerName = getProviderName();
  console.log(`[worker] Iniciando con proveedor: ${providerName}`);

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

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[worker] HTTP interno escuchando en http://127.0.0.1:${PORT}`);
  });

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
