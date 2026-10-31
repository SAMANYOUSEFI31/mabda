import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * BYOK key vault. Keys are encrypted with AES-256-GCM (key derived with scrypt from MABDA_SECRET, or from a
 * random secret generated once into server/data/secret.key). Plain keys never touch disk or logs.
 * NOTE: there are no server-side accounts yet — a "user" is the opaque id the browser generated. When real
 * auth lands, key the vault by the authenticated account instead.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = path.resolve(here, '..', 'data');

interface Record_ { iv: string; tag: string; data: string; last4: string; savedAt: string }
type Vault = Record<string, Record_>;

export class ByokVault {
  private readonly file: string;
  private readonly secretFile: string;
  private cachedKey?: Buffer;

  constructor(readonly dir = DEFAULT_DIR, private readonly secretEnv = process.env.MABDA_SECRET) {
    this.file = path.join(dir, 'byok.json');
    this.secretFile = path.join(dir, 'secret.key');
  }

  private masterKey(): Buffer {
    if (this.cachedKey) return this.cachedKey;
    let secret = this.secretEnv;
    if (!secret) {
      mkdirSync(this.dir, { recursive: true });
      if (existsSync(this.secretFile)) secret = readFileSync(this.secretFile, 'utf8').trim();
      else {
        secret = randomBytes(32).toString('hex');
        writeFileSync(this.secretFile, secret, { mode: 0o600 });
        try { chmodSync(this.secretFile, 0o600); } catch { /* best effort */ }
      }
    }
    this.cachedKey = scryptSync(secret, 'mabda-byok-v1', 32);
    return this.cachedKey;
  }

  private read(): Vault {
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as Vault;
    } catch {
      return {};
    }
  }

  private write(v: Vault) {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.file, JSON.stringify(v, null, 2), { mode: 0o600 });
  }

  set(userId: string, apiKey: string): { last4: string } {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.masterKey(), iv);
    const data = Buffer.concat([c.update(apiKey, 'utf8'), c.final()]);
    const rec: Record_ = { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64'), last4: apiKey.slice(-4), savedAt: new Date().toISOString() };
    const v = this.read();
    v[userId] = rec;
    this.write(v);
    return { last4: rec.last4 };
  }

  get(userId: string): string | null {
    const rec = this.read()[userId];
    if (!rec) return null;
    try {
      const d = createDecipheriv('aes-256-gcm', this.masterKey(), Buffer.from(rec.iv, 'base64'));
      d.setAuthTag(Buffer.from(rec.tag, 'base64'));
      return Buffer.concat([d.update(Buffer.from(rec.data, 'base64')), d.final()]).toString('utf8');
    } catch {
      return null; // wrong secret / tampered file: treated as "not configured"
    }
  }

  last4(userId: string): string | null {
    return this.read()[userId]?.last4 ?? null;
  }

  delete(userId: string): void {
    const v = this.read();
    delete v[userId];
    this.write(v);
  }
}
