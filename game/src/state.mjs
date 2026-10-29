export const COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const DAILY_CAP = 100;
export const MAX_PLAYERS = 200;
export const RECENT_COUNT = 5;

const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const STYLES = new Set(['safe', 'aggressive', 'yolo']);

export function isValidLogin(login) {
  return typeof login === 'string' && LOGIN_RE.test(login);
}

export function emptyState() {
  return {
    version: 1, day: '', roundsToday: 0, totalRounds: 0,
    versus: { player: 0, luan: 0, draw: 0 },
    lastPlayed: {}, players: {}, recent: [],
  };
}

const OUTCOMES = new Set(['win', 'loss', 'draw']);

export function outcomeOf(playerTotal, luanTotal) {
  return playerTotal < luanTotal ? 'win' : playerTotal > luanTotal ? 'loss' : 'draw';
}

const isInt = (n) => Number.isInteger(n) && n >= 0;
const isIso = (s) => typeof s === 'string' && s.length <= 30 && !Number.isNaN(Date.parse(s));

// Rebuilds state from untrusted JSON, keeping only well-formed entries.
export function sanitizeState(raw) {
  const s = emptyState();
  if (!raw || typeof raw !== 'object') return s;
  if (typeof raw.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.day)) s.day = raw.day;
  if (isInt(raw.roundsToday)) s.roundsToday = raw.roundsToday;
  if (isInt(raw.totalRounds)) s.totalRounds = raw.totalRounds;
  for (const k of ['player', 'luan', 'draw']) if (isInt(raw.versus?.[k])) s.versus[k] = raw.versus[k];
  for (const [login, at] of Object.entries(raw.lastPlayed ?? {})) {
    if (isValidLogin(login) && isIso(at)) s.lastPlayed[login] = at;
  }
  for (const [login, p] of Object.entries(raw.players ?? {})) {
    if (isValidLogin(login) && p && isInt(p.best) && isInt(p.rounds) && isIso(p.bestAt)) {
      s.players[login] = { best: p.best, bestAt: p.bestAt, rounds: p.rounds, wins: isInt(p.wins) ? p.wins : 0 };
    }
  }
  if (Array.isArray(raw.recent)) {
    s.recent = raw.recent
      .filter((r) => r && isValidLogin(r.login) && STYLES.has(r.style) && isInt(r.total) && isIso(r.at))
      .map(({ login, style, total, at, luan, outcome }) => {
        const r = { login, style, total, at };
        if (isInt(luan) && OUTCOMES.has(outcome)) Object.assign(r, { luan, outcome });
        return r;
      })
      .slice(0, RECENT_COUNT);
  }
  return s;
}

const utcDay = (now) => now.toISOString().slice(0, 10);

export function checkLimits(state, login, now) {
  const roundsToday = state.day === utcDay(now) ? state.roundsToday : 0;
  if (roundsToday >= DAILY_CAP) return { ok: false, reason: 'daily-cap' };
  const last = state.lastPlayed[login];
  if (last) {
    const nextAt = Date.parse(last) + COOLDOWN_MS;
    if (now.getTime() < nextAt) return { ok: false, reason: 'cooldown', nextAt: new Date(nextAt).toISOString() };
  }
  return { ok: true };
}

export function recordRound(state, login, round, now, luanTotal) {
  const at = now.toISOString();
  const day = utcDay(now);
  const next = sanitizeState(state);
  next.roundsToday = next.day === day ? next.roundsToday + 1 : 1;
  next.day = day;
  next.totalRounds += 1;
  next.lastPlayed[login] = at;

  for (const [l, t] of Object.entries(next.lastPlayed)) {
    if (now.getTime() - Date.parse(t) >= COOLDOWN_MS) delete next.lastPlayed[l];
  }

  const won = luanTotal !== undefined && outcomeOf(round.total, luanTotal) === 'win' ? 1 : 0;
  const prev = next.players[login];
  if (!prev) next.players[login] = { best: round.total, bestAt: at, rounds: 1, wins: won };
  else {
    prev.rounds += 1;
    prev.wins += won;
    if (round.total < prev.best) Object.assign(prev, { best: round.total, bestAt: at });
  }

  const ranked = leaderboard(next, Infinity);
  if (ranked.length > MAX_PLAYERS) {
    next.players = Object.fromEntries(ranked.slice(0, MAX_PLAYERS).map((p) => [p.login, next.players[p.login]]));
  }

  const entry = { login, style: round.style, total: round.total, at };
  if (luanTotal !== undefined) {
    const outcome = outcomeOf(round.total, luanTotal);
    next.versus[{ win: 'player', loss: 'luan', draw: 'draw' }[outcome]] += 1;
    Object.assign(entry, { luan: luanTotal, outcome });
  }
  next.recent = [entry, ...next.recent].slice(0, RECENT_COUNT);
  return next;
}

// Lowest best score wins; ties go to whoever set it first.
export function leaderboard(state, limit = 10) {
  return Object.entries(state.players)
    .map(([login, p]) => ({ login, ...p }))
    .sort((a, b) => a.best - b.best || Date.parse(a.bestAt) - Date.parse(b.bestAt) || a.login.localeCompare(b.login))
    .slice(0, limit);
}
