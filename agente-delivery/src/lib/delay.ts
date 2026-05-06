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

export function humanDelayMs(charCount: number, minMs = 1000, maxMs = 22000): number {
  let base: number;
  if (charCount < 100) {
    base = randomDelayMs(1000, 4000);
  } else if (charCount < 400) {
    base = randomDelayMs(4000, 10000);
  } else if (charCount < 800) {
    base = randomDelayMs(8000, 16000);
  } else {
    base = randomDelayMs(14000, maxMs);
  }

  const jitter = gaussianRandom() * 0.2;
  const jittered = Math.round(base * (1 + jitter));

  return Math.max(minMs, Math.min(maxMs, jittered));
}
