export const START = '<!-- DARTSGOLF:START -->';
export const END = '<!-- DARTSGOLF:END -->';

function locate(readme) {
  const s = readme.indexOf(START);
  const e = readme.indexOf(END);
  if (s === -1 || e === -1 || e < s) throw new Error('README markers missing or out of order');
  if (readme.indexOf(START, s + 1) !== -1 || readme.indexOf(END, e + 1) !== -1) {
    throw new Error('README markers must appear exactly once');
  }
  return { before: readme.slice(0, s + START.length), after: readme.slice(e) };
}

export function replaceSection(readme, content) {
  if (content.includes(START) || content.includes(END)) throw new Error('Content must not contain markers');
  const { before, after } = locate(readme);
  return `${before}\n${content}\n${after}`;
}

// Guard: everything outside the markers must be byte-identical.
export function assertOnlySectionChanged(original, updated) {
  const a = locate(original);
  const b = locate(updated);
  if (a.before !== b.before || a.after !== b.after) {
    throw new Error('README content outside the game section changed');
  }
}
