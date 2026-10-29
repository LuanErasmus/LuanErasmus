// Entrypoint for the Darts Golf workflow. All event data arrives via environment variables.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isGameTitle, parseTitle, playRound } from './engine.mjs';
import { renderReadmeSection, renderRejection, renderScorecard } from './render.mjs';
import { assertOnlySectionChanged, replaceSection } from './readme.mjs';
import { checkLimits, isValidLogin, recordRound, sanitizeState } from './state.mjs';

export function run({ title, login, userType, root, now = new Date(), rng }) {
  if (!isGameTitle(title) || userType === 'Bot' || !isValidLogin(login)) return { action: 'ignore' };

  const style = parseTitle(title);
  if (!style) return { action: 'reject', comment: renderRejection('invalid-title') };

  const statePath = join(root, 'game', 'state.json');
  const readmePath = join(root, 'README.md');
  const state = sanitizeState(JSON.parse(readFileSync(statePath, 'utf8')));

  const limit = checkLimits(state, login, now);
  if (!limit.ok) return { action: 'reject', comment: renderRejection(limit.reason, limit.nextAt) };

  const round = playRound(style, rng);
  const luanRound = playRound(style, rng);
  const next = recordRound(state, login, round, now, luanRound.total);

  const readme = readFileSync(readmePath, 'utf8');
  const updated = replaceSection(readme, renderReadmeSection(next));
  assertOnlySectionChanged(readme, updated);

  writeFileSync(statePath, `${JSON.stringify(next, null, 2)}\n`);
  writeFileSync(readmePath, updated);
  return { action: 'play', comment: renderScorecard(login, round, luanRound, rng), round, luanRound };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env;
  const result = run({
    title: env.ISSUE_TITLE ?? '',
    login: env.PLAYER_LOGIN ?? '',
    userType: env.PLAYER_TYPE ?? '',
    root: env.REPO_ROOT ?? process.cwd(),
  });
  if (result.comment && env.COMMENT_FILE) writeFileSync(env.COMMENT_FILE, result.comment);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `action=${result.action}\n`);
  console.log(`Darts Golf: ${result.action}${result.round ? ` (player ${result.round.total} vs Luan ${result.luanRound.total})` : ''}`);
}
