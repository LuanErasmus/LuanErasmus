import { HOLES, RESULTS, STYLES, defaultRng, relativeToPar } from './engine.mjs';
import { isValidLogin, leaderboard, outcomeOf } from './state.mjs';

const profileLink = (login) => (isValidLogin(login) ? `[@${login}](https://github.com/${login})` : 'someone');
const hit = (h) => `${RESULTS[h.result].emoji} ${h.score}`;

const VERDICTS = {
  win: ['🏆 **You beat Luan!** Drinks are on him. 🍻', '🏆 **Victory!** Luan is already asking for a rematch.'],
  loss: ['😎 **Luan wins this one.** Come back tomorrow for revenge!', '😎 **Luan takes it.** The house always wins... usually.'],
  draw: ['🤝 **It\'s a draw!** Honours even. Rematch tomorrow?'],
};

const OUTCOME_BADGE = { win: '🏆 beat Luan', loss: '😎 lost to Luan', draw: '🤝 drew with Luan' };

export function renderScorecard(login, round, luanRound, pick = defaultRng) {
  const s = STYLES[round.style];
  const outcome = outcomeOf(round.total, luanRound.total);
  const lines = VERDICTS[outcome];
  const rows = round.holes
    .map((h, i) => {
      const l = luanRound.holes[i];
      return `| ${h.hole} | ${h.target} | ${hit(h)} | ${l.target} | ${hit(l)} |`;
    })
    .join('\n');
  return [
    `## 🎯 ${profileLink(login)} 🆚 Luan: Final score ⛳`,
    '',
    `Style: ${s.emoji} **${s.label}** (both players threw the same style)`,
    '',
    `| Hole | Your target | You | Luan's target | Luan |`,
    '|:---:|:---:|:---:|:---:|:---:|',
    rows,
    `| **Total** | | **${round.total} (${relativeToPar(round.total, round.par)})** | | **${luanRound.total} (${relativeToPar(luanRound.total, luanRound.par)})** |`,
    '',
    `### ${lines[pick(lines.length)]}`,
    '',
    `<sub>🎯 Bull 0 · 🦅 Treble 1 · 🐦 Double 2 · ⛳ Single 3 · 💨 Miss 5. Lowest total wins.</sub>`,
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
  const { player, luan, draw } = state.versus;
  const board = top.length
    ? [
        '| # | Player | Best | vs Par | Rounds | Wins vs Luan |',
        '|:---:|:---|:---:|:---:|:---:|:---:|',
        ...top.map(
          (p, i) =>
            `| ${medals[i] ?? i + 1} | ${profileLink(p.login)} | ${p.best} | ${relativeToPar(p.best)} | ${p.rounds} | ${p.wins ?? 0} |`,
        ),
      ].join('\n')
    : '_No rounds yet. Be the first on the board!_';
  const recent = state.recent.length
    ? state.recent
        .map((r) => {
          const vs = r.outcome ? ` vs Luan's **${r.luan}**: ${OUTCOME_BADGE[r.outcome]}` : '';
          return `- ${STYLES[r.style].emoji} ${profileLink(r.login)} shot **${r.total}** (${relativeToPar(r.total)})${vs} on ${r.at.slice(0, 10)}`;
        })
        .join('\n')
    : '_Nothing yet._';
  return [
    `**⚔️ Players ${player} – ${luan} Luan** (${draw} draw${draw === 1 ? '' : 's'})`,
    '',
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
