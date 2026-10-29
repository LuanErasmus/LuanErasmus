import { randomInt } from 'node:crypto';

export const HOLES = 3;
export const PAR_PER_HOLE = 3;

export const STYLES = {
  safe: { label: 'Safe', emoji: '🛡️' },
  aggressive: { label: 'Aggressive', emoji: '🔥' },
  yolo: { label: 'YOLO', emoji: '💀' },
};

export const RESULTS = {
  bull: { score: 0, name: 'Bullseye ace', emoji: '🎯' },
  treble: { score: 1, name: 'Eagle (treble)', emoji: '🦅' },
  double: { score: 2, name: 'Birdie (double)', emoji: '🐦' },
  single: { score: 3, name: 'Par (single)', emoji: '⛳' },
  miss: { score: 5, name: 'Bogey (miss)', emoji: '💨' },
};

// Weights per 1000 throws. Expected score per hole is ~2.9-3.0 for every style; only variance differs.
export const ODDS = {
  safe: { bull: 5, treble: 45, double: 100, single: 760, miss: 90 },
  aggressive: { bull: 20, treble: 250, double: 130, single: 300, miss: 300 },
  yolo: { bull: 130, treble: 250, double: 60, single: 130, miss: 430 },
};

const TITLE_RE = /^dartsgolf\|(safe|aggressive|yolo)$/;

export function isGameTitle(title) {
  return typeof title === 'string' && title.startsWith('dartsgolf|');
}

export function parseTitle(title) {
  if (typeof title !== 'string' || title.length > 40) return null;
  const m = TITLE_RE.exec(title.trim());
  return m ? m[1] : null;
}

export function defaultRng(maxExclusive) {
  return randomInt(maxExclusive);
}

function pickResult(style, rng) {
  const table = ODDS[style];
  const total = Object.values(table).reduce((a, b) => a + b, 0);
  let roll = rng(total);
  for (const [result, weight] of Object.entries(table)) {
    if (roll < weight) return result;
    roll -= weight;
  }
  return 'miss';
}

export function playRound(style, rng = defaultRng) {
  if (!Object.hasOwn(ODDS, style)) throw new Error('Unknown style');
  const holes = [];
  for (let i = 0; i < HOLES; i++) {
    const target = rng(20) + 1;
    const result = pickResult(style, rng);
    holes.push({ hole: i + 1, target, result, score: RESULTS[result].score });
  }
  const total = holes.reduce((a, h) => a + h.score, 0);
  return { style, holes, total, par: HOLES * PAR_PER_HOLE };
}

export function relativeToPar(total, par = HOLES * PAR_PER_HOLE) {
  const d = total - par;
  return d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`;
}
