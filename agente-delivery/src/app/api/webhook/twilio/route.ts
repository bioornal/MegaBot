import { validateRequest } from 'twilio';
import { TENANTS } from '../../../../tenants.config';

export async function POST(req: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error('[webhook/twilio] TWILIO_AUTH_TOKEN no configurado');
    return new Response(null, { status: 500 });
  }

  // Twilio envía application/x-www-form-urlencoded
  const text = await req.text();
  const params = Object.fromEntries(new URLSearchParams(text));

  // Verificar firma de Twilio para prevenir requests falsas
  const signature = req.headers.get('x-twilio-signature') ?? '';
  const url = process.env.TWILIO_WEBHOOK_URL ?? `https://megabot-admin.cloud/api/webhook/twilio`;
  if (!validateRequest(authToken, signature, url, params)) {
    console.warn('[webhook/twilio] Firma inválida — request rechazado');
    return new Response(null, { status: 403 });
  }

  // From: "whatsapp:+5491112345678" → "5491112345678"
  const rawFrom = params['From'] ?? '';
  const rawTo = params['To'] ?? '';
  const body = params['Body'] ?? '';
  const senderName = params['ProfileName'] ?? rawFrom;

  const from = rawFrom.replace(/^whatsapp:\+?/, '');
  const toNumber = rawTo.replace(/^whatsapp:/, ''); // "+14155238886"

  if (!from || !body) {
    return new Response(null, { status: 200 });
  }

  // Identificar tenant por número de Twilio
  const tenant = TENANTS.find(
    (t) => t.twilioPhoneNumber && t.twilioPhoneNumber === toNumber
  );

  if (!tenant) {
    console.warn(`[webhook/twilio] No hay tenant para el número ${toNumber}`);
    return new Response(null, { status: 200 });
  }

  // Fire-and-forget: llama al worker del tenant para que procese el mensaje
  // El worker usa su TwilioProvider para enviar la respuesta
  fetch(`${tenant.workerUrl}/incoming`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, text: body, senderName }),
  }).catch((err: unknown) =>
    console.error(`[webhook/twilio] Error llamando worker ${tenant.id}:`, err)
  );

  // Responder a Twilio inmediatamente (evita retries por timeout)
  return new Response(null, { status: 200 });
}
