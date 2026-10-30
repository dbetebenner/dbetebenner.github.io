// Local source roots, keyed by the label recorded in catalog entries (source.root).
// Override with TALKS_SOURCE_ROOT when the archive lives elsewhere.

import path from 'node:path';

export const ROOTS = {
  'Conferences-Presentations': process.env.TALKS_SOURCE_ROOT || '/Users/conet/Research/Conferences-Presentations',
};

export function sourcePath(talk, rel) {
  if (!rel) return null;
  const root = ROOTS[talk.source?.root];
  if (!root) throw new Error(`unknown source root for ${talk.id}: ${talk.source?.root}`);
  return path.join(root, rel);
}
