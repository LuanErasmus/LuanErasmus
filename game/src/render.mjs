import { HOLES, RESULTS, STYLES, relativeToPar } from './engine.mjs';
import { isValidLogin, leaderboard } from './state.mjs';

const profileLink = (login) => (isValidLogin(login) ? `[@${login}](https://github.com/${login})` : 'someone');

const verdict = (total, par) => {
  if (total <= par - 4) return '🏆 Legendary round!';
  if (total < par) return '🔥 Under par, nice throwing!';
  if (total === par) return '👌 Right on par.';
  return '😅 The bar tab was bigger than the score... try again tomorrow!';
};

export function renderScorecard(login, round) {
  const s = STYLES[round.style];
  const rows = round.holes
    .map((h) => `| ${h.hole} | ${h.target} | ${RESULTS[h.result].emoji} ${RESULTS[h.result].name} | ${h.score} |`)
    .join('\n');
  return [
    `## 🎯⛳ Darts Golf scorecard for ${profileLink(login)}`,
    '',
    `Style: ${s.emoji} **${s.label}**`,
    '',
    '| Hole | Target | Result | Strokes |',
    '|:---:|:---:|:---|:---:|',
    rows,
    `| **Total** | | Par ${round.par} | **${round.total} (${relativeToPar(round.total, round.par)})** |`,
    '',
    verdict(round.total, round.par),
    '',
    'Your round is on the [profile leaderboard](https://github.com/LuanErasmus). You can play again in 24 hours. Thanks for playing! 🙌',
  ].join('\n');
}

export function renderRejection(reason, nextAt) {
  switch (reason) {
    case 'cooldown':
      return `⏳ You've already played your round today. Come back after **${nextAt}** (UTC) for another go!`;
    case 'daily-cap':
      return '🍺 The darts bar is closed for today (daily round limit reached). Please try again tomorrow!';
    case 'invalid-title':
      return '🤔 I could not read that move. Use one of the **Play** links on the [profile README](https://github.com/LuanErasmus) without changing the issue title.';
    default:
      return '🙈 This round could not be played.';
  }
}

export function renderReadmeSection(state) {
  const top = leaderboard(state, 10);
  const medals = ['🥇', '🥈', '🥉'];
  const board = top.length
    ? [
        '| # | Player | Best | vs Par | Rounds |',
        '|:---:|:---|:---:|:---:|:---:|',
        ...top.map(
          (p, i) => `| ${medals[i] ?? i + 1} | ${profileLink(p.login)} | ${p.best} | ${relativeToPar(p.best)} | ${p.rounds} |`,
        ),
      ].join('\n')
    : '_No rounds yet. Be the first on the board!_';
  const recent = state.recent.length
    ? state.recent
        .map((r) => `- ${STYLES[r.style].emoji} ${profileLink(r.login)} shot **${r.total}** (${relativeToPar(r.total)}) on ${r.at.slice(0, 10)}`)
        .join('\n')
    : '_Nothing yet._';
  return [
    `**🏆 Leaderboard** (best ${HOLES}-hole round, lowest wins)`,
    '',
    board,
    '',
    '**🕹️ Latest rounds**',
    '',
    recent,
    '',
    `<sub>${state.totalRounds} round(s) played so far.</sub>`,
  ].join('\n');
}
