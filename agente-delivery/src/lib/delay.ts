export function randomDelayMs(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function humanDelayMs(charCount: number, minMs = 2000, maxMs = 25000): number {
  let base: number;
  if (charCount < 100) {
    // "Tu nombre." → 2-6s (estaba 1-4s)
    base = randomDelayMs(2_000, 6_000);
  } else if (charCount < 400) {
    // respuesta normal → 6-14s (estaba 4-10s)
    base = randomDelayMs(6_000, 14_000);
  } else if (charCount < 800) {
    // receipt → 12-20s (estaba 8-16s)
    base = randomDelayMs(12_000, 20_000);
  } else {
    // receipt largo → 18-25s (estaba 14-22s)
    base = randomDelayMs(18_000, maxMs);
  }

  const jitter = gaussianRandom() * 0.2;
  const jittered = Math.round(base * (1 + jitter));

  return Math.max(minMs, Math.min(maxMs, jittered));
}
