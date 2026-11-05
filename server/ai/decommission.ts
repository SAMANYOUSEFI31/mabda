import { unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Removes only the files used by the retired personal-key vault. */
export function decommissionLegacyByok(dataDir = path.resolve(here, '..', 'data')): number {
  let removed = 0;
  for (const name of ['byok.json', 'secret.key']) {
    try {
      unlinkSync(path.join(dataDir, name));
      removed++;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return removed;
}
