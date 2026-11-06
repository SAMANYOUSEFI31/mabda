import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { decommissionLegacyByok } from './decommission.ts';

test('legacy BYOK decommission removes only vault files and is idempotent', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mabda-decommission-'));
  try {
    writeFileSync(path.join(dir, 'byok.json'), '{"legacy":"encrypted"}');
    writeFileSync(path.join(dir, 'secret.key'), 'legacy-secret');
    writeFileSync(path.join(dir, 'keep.json'), '{"keep":true}');
    assert.equal(decommissionLegacyByok(dir), 2);
    assert.equal(existsSync(path.join(dir, 'byok.json')), false);
    assert.equal(existsSync(path.join(dir, 'secret.key')), false);
    assert.equal(readFileSync(path.join(dir, 'keep.json'), 'utf8'), '{"keep":true}');
    assert.equal(decommissionLegacyByok(dir), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
