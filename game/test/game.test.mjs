import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ODDS, RESULTS, isGameTitle, parseTitle, playRound } from '../src/engine.mjs';
import { COOLDOWN_MS, DAILY_CAP, MAX_PLAYERS, checkLimits, emptyState, leaderboard, outcomeOf, recordRound, sanitizeState } from '../src/state.mjs';
import { END, START, assertOnlySectionChanged, replaceSection } from '../src/readme.mjs';
import { renderReadmeSection, renderScorecard } from '../src/render.mjs';
import { run } from '../src/main.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixedRng = (values) => {
  let i = 0;
  return (max) => values[i++ % values.length] % max;
};

test('parseTitle accepts only exact allowlisted titles', () => {
  assert.equal(parseTitle('dartsgolf|safe'), 'safe');
  assert.equal(parseTitle('dartsgolf|aggressive'), 'aggressive');
  assert.equal(parseTitle('dartsgolf|yolo'), 'yolo');
  for (const bad of [
    'dartsgolf|SAFE', 'dartsgolf|safe; rm -rf /', 'dartsgolf|safe$(id)', 'dartsgolf|safe\nfoo',
    'dartsgolf|', 'dartsgolf|__proto__', 'dartsgolf|constructor', 'Dartsgolf|safe', `dartsgolf|${'a'.repeat(100)}`, null, 42,
  ]) {
    assert.equal(parseTitle(bad), null, String(bad));
  }
});

test('isGameTitle only matches the game prefix', () => {
  assert.ok(isGameTitle('dartsgolf|whatever'));
  assert.ok(!isGameTitle('Bug: dartsgolf|safe'));
  assert.ok(!isGameTitle('Hello'));
});

test('odds tables sum to 1000 and have similar expected scores', () => {
  for (const [style, table] of Object.entries(ODDS)) {
    const total = Object.values(table).reduce((a, b) => a + b, 0);
    assert.equal(total, 1000, style);
    const ev = Object.entries(table).reduce((a, [r, w]) => a + (RESULTS[r].score * w) / 1000, 0);
    assert.ok(ev > 2.7 && ev < 3.1, `${style} EV ${ev}`);
  }
});

test('playRound produces 3 holes with deterministic rng', () => {
  // rng calls: target, result, target, result, ...
  const round = playRound('safe', fixedRng([0, 0, 19, 999, 4, 200]));
  assert.equal(round.holes.length, 3);
  assert.deepEqual(round.holes.map((h) => h.target), [1, 20, 5]);
  assert.deepEqual(round.holes.map((h) => h.result), ['bull', 'miss', 'single']);
  assert.equal(round.total, 0 + 5 + 3);
  assert.throws(() => playRound('__proto__'));
});

test('cooldown and daily cap are enforced', () => {
  const now = new Date('2026-10-29T10:00:00Z');
  const round = { style: 'safe', total: 9 };
  let s = recordRound(emptyState(), 'alice', round, now);
  assert.equal(checkLimits(s, 'alice', new Date(now.getTime() + 1000)).reason, 'cooldown');
  assert.ok(checkLimits(s, 'alice', new Date(now.getTime() + COOLDOWN_MS)).ok);
  assert.ok(checkLimits(s, 'bob', now).ok);

  s = { ...s, roundsToday: DAILY_CAP };
  assert.equal(checkLimits(s, 'bob', now).reason, 'daily-cap');
  assert.ok(checkLimits(s, 'bob', new Date('2026-10-30T00:00:01Z')).ok, 'cap resets next UTC day');
});

test('leaderboard keeps best score, ranks lowest first, and is bounded', () => {
  let s = emptyState();
  const t = (h) => new Date(Date.UTC(2026, 0, 1, h));
  s = recordRound(s, 'alice', { style: 'safe', total: 8 }, t(0));
  s = recordRound(s, 'bob', { style: 'yolo', total: 4 }, t(1));
  s = recordRound(s, 'alice', { style: 'safe', total: 10 }, t(30));
  assert.deepEqual(leaderboard(s).map((p) => [p.login, p.best, p.rounds]), [['bob', 4, 1], ['alice', 8, 2]]);
  assert.equal(s.recent[0].login, 'alice');
  assert.ok(!('bob' in s.lastPlayed), 'stale cooldowns pruned');

  for (let i = 0; i < MAX_PLAYERS + 20; i++) s = recordRound(s, `p${i}`, { style: 'safe', total: 15 }, t(40));
  assert.equal(Object.keys(s.players).length, MAX_PLAYERS);
  assert.ok(s.players.bob && s.players.alice, 'best players kept');
  assert.equal(s.recent.length, 5);
});

test('sanitizeState drops malicious or malformed entries', () => {
  const s = sanitizeState({
    roundsToday: -5,
    lastPlayed: { '<img src=x>': '2026-01-01T00:00:00Z', ok: 'not a date' },
    players: { 'evil](javascript:alert(1))': { best: 0, bestAt: '2026-01-01T00:00:00Z', rounds: 1 }, good: { best: 5, bestAt: '2026-01-01T00:00:00Z', rounds: 1, extra: 'x' } },
    recent: [{ login: 'x', style: 'hax', total: 1, at: '2026-01-01T00:00:00Z' }],
  });
  assert.equal(s.roundsToday, 0);
  assert.deepEqual(s.lastPlayed, {});
  assert.deepEqual(Object.keys(s.players), ['good']);
  assert.deepEqual(s.players.good, { best: 5, bestAt: '2026-01-01T00:00:00Z', rounds: 1, wins: 0 });
  assert.deepEqual(s.recent, []);
});

test('README section replacement only touches the marked region', () => {
  const readme = `# Hi\n${START}\nold\n${END}\nfooter\n`;
  const updated = replaceSection(readme, 'new board');
  assert.equal(updated, `# Hi\n${START}\nnew board\n${END}\nfooter\n`);
  assertOnlySectionChanged(readme, updated);
  assert.throws(() => assertOnlySectionChanged(readme, updated.replace('# Hi', '# Hacked')));
  assert.throws(() => replaceSection(readme, `x ${END} y`));
  assert.throws(() => replaceSection('no markers', 'x'));
  assert.throws(() => replaceSection(`${START}${END}${START}${END}`, 'x'));
});

test('renderers produce markdown without raw HTML from inputs', () => {
  let s = recordRound(emptyState(), 'alice', { style: 'yolo', total: 3 }, new Date('2026-10-29T10:00:00Z'), 7);
  const section = renderReadmeSection(s);
  assert.match(section, /\[@alice\]\(https:\/\/github\.com\/alice\)/);
  assert.match(section, /Players 1 – 0 Luan/);
  assert.match(section, /beat Luan/);
  assert.ok(!section.includes(START) && !section.includes(END));
  const card = renderScorecard('alice', playRound('safe', fixedRng([0])), playRound('safe', fixedRng([0, 999])), () => 0);
  assert.match(card, /@alice\]\(https:\/\/github\.com\/alice\) 🆚 Luan/);
  assert.match(card, /You beat Luan/);
});

test('versus: outcome, tally and per-player wins are tracked', () => {
  const t = (h) => new Date(Date.UTC(2026, 0, 1, h));
  assert.equal(outcomeOf(5, 9), 'win');
  assert.equal(outcomeOf(9, 5), 'loss');
  assert.equal(outcomeOf(7, 7), 'draw');
  let s = recordRound(emptyState(), 'alice', { style: 'safe', total: 5 }, t(0), 9);
  s = recordRound(s, 'bob', { style: 'safe', total: 9 }, t(1), 5);
  s = recordRound(s, 'carol', { style: 'safe', total: 7 }, t(2), 7);
  s = recordRound(s, 'alice', { style: 'safe', total: 4 }, t(30), 8);
  assert.deepEqual(s.versus, { player: 2, luan: 1, draw: 1 });
  assert.equal(s.players.alice.wins, 2);
  assert.equal(s.players.bob.wins, 0);
  assert.deepEqual([s.recent[0].luan, s.recent[0].outcome], [8, 'win']);
});

test('sanitizeState migrates legacy state without versus data', () => {
  const s = sanitizeState({
    players: { old: { best: 7, bestAt: '2026-10-29T08:49:57.079Z', rounds: 1 } },
    recent: [{ login: 'old', style: 'safe', total: 7, at: '2026-10-29T08:49:57.079Z' }],
    versus: { player: 'x', luan: 2 },
  });
  assert.deepEqual(s.versus, { player: 0, luan: 2, draw: 0 });
  assert.equal(s.players.old.wins, 0);
  assert.ok(!('outcome' in s.recent[0]));
  assert.match(renderReadmeSection(s), /@old\]\(https:\/\/github\.com\/old\) shot \*\*7\*\* \(-2\) on/);
});

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'dartsgolf-'));
  mkdirSync(join(dir, 'game'));
  copyFileSync(join(repoRoot, 'README.md'), join(dir, 'README.md'));
  writeFileSync(join(dir, 'game', 'state.json'), JSON.stringify(emptyState()));
  return dir;
}

test('run: plays a round and updates only the game section', () => {
  const root = sandbox();
  const before = readFileSync(join(root, 'README.md'), 'utf8');
  const now = new Date('2026-10-29T10:00:00Z');
  const res = run({ title: 'dartsgolf|aggressive', login: 'octocat', userType: 'User', root, now });
  assert.equal(res.action, 'play');
  const after = readFileSync(join(root, 'README.md'), 'utf8');
  assertOnlySectionChanged(before, after);
  assert.match(after, /@octocat/);
  const state = JSON.parse(readFileSync(join(root, 'game', 'state.json'), 'utf8'));
  assert.equal(state.totalRounds, 1);

  const again = run({ title: 'dartsgolf|safe', login: 'octocat', userType: 'User', root, now });
  assert.equal(again.action, 'reject');
  assert.match(again.comment, /already played/);
});

test('run: ignores non-game issues and bots, rejects tampered titles', () => {
  const root = sandbox();
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  assert.equal(run({ title: 'Question about your work', login: 'a', userType: 'User', root }).action, 'ignore');
  assert.equal(run({ title: 'dartsgolf|safe', login: 'dependabot[bot]', userType: 'Bot', root }).action, 'ignore');
  assert.equal(run({ title: 'dartsgolf|safe', login: 'bad login', userType: 'User', root }).action, 'ignore');
  const r = run({ title: 'dartsgolf|safe`whoami`', login: 'mallory', userType: 'User', root });
  assert.equal(r.action, 'reject');
  assert.equal(readFileSync(join(root, 'README.md'), 'utf8'), readme);
});

test('run: refuses to write when README markers are missing', () => {
  const root = sandbox();
  writeFileSync(join(root, 'README.md'), '# no markers here\n');
  assert.throws(() => run({ title: 'dartsgolf|safe', login: 'octocat', userType: 'User', root }));
  const state = JSON.parse(readFileSync(join(root, 'game', 'state.json'), 'utf8'));
  assert.equal(state.totalRounds, 0, 'state untouched');
});
