import OpenAI from 'openai';

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export interface VerifyInput {
  imageUrl: string;
  expectedAmount: number;
  bankAlias: string;
  bankCBU: string;
  bankTitular: string;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; issue: 'amount_mismatch' | 'wrong_account' | 'unreadable'; detail: string };

const SYSTEM = `
Sos un verificador de comprobantes de transferencia bancaria argentina.
Recibís una imagen y debés extraer:
  - monto transferido (en pesos argentinos)
  - CBU o alias de la cuenta de DESTINO
  - nombre del titular de la cuenta de DESTINO

Respondé SIEMPRE con un único JSON con esta forma:
{ "monto": number | null, "cbu": string | null, "alias": string | null, "titular": string | null, "legible": boolean }

Reglas:
- Si la imagen no es un comprobante o no se puede leer, devolvé "legible": false y el resto null.
- "monto" debe ser numero entero (sin separadores, sin signos).
- "cbu" debe ser una secuencia de 22 dígitos sin espacios. Si no encontrás CBU, null.
- "alias" debe ser un string sin espacios. Si no hay alias visible, null.
- No inventes datos.
`.trim();

interface Extracted {
  monto: number | null;
  cbu: string | null;
  alias: string | null;
  titular: string | null;
  legible: boolean;
}

export async function verifyPaymentReceipt(input: VerifyInput): Promise<VerifyResult> {
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  const r = await getClient().chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analizá este comprobante.' },
          { type: 'image_url', image_url: { url: input.imageUrl } },
        ] as any,
      },
    ],
  });

  const raw = r.choices[0]?.message?.content ?? '{}';
  let data: Extracted;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, issue: 'unreadable', detail: 'Respuesta del modelo no parseable' };
  }

  if (!data.legible) {
    return { ok: false, issue: 'unreadable', detail: 'No pude leer el comprobante' };
  }

  // Cuenta correcta — basta con que coincida CBU o alias o titular
  const cbuOk    = !!data.cbu    && data.cbu.replace(/\D/g, '') === input.bankCBU.replace(/\D/g, '');
  const aliasOk  = !!data.alias  && data.alias.toLowerCase() === input.bankAlias.toLowerCase();
  const titularOk = !!data.titular && data.titular.toLowerCase().includes(input.bankTitular.toLowerCase().split(' ')[0]);
  const accountOk = cbuOk || aliasOk || titularOk;
  if (!accountOk) {
    return { ok: false, issue: 'wrong_account', detail: 'La cuenta de destino no coincide con la nuestra' };
  }

  // Monto — tolerancia del 1% por redondeos
  if (data.monto == null) {
    return { ok: false, issue: 'unreadable', detail: 'No se detectó el monto' };
  }
  const tolerance = Math.max(input.expectedAmount * 0.01, 100);
  if (Math.abs(data.monto - input.expectedAmount) > tolerance) {
    return {
      ok: false,
      issue: 'amount_mismatch',
      detail: `Monto en comprobante $${data.monto.toLocaleString('es-AR')} no coincide con la seña esperada $${input.expectedAmount.toLocaleString('es-AR')}`,
    };
  }

  return { ok: true };
}
