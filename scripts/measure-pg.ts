/**
 * Postgres measurement: how many round trips does a typical request make, and how long does it take?
 * The Postgres adapter is synchronous (server/db/sql/postgres.ts): each round trip costs the network distance between the app and
 * the database while the process waits. So the database must sit next to the app (same data centre / private network).
 * Run: DATABASE_URL=postgres://… npx tsx scripts/measure-pg.ts   (uses a fresh schema, removed at the end)
 */
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.ts';
import { migrate } from '../server/db/migrations.ts';
import { PostgresDatabase, postgresRoundTrips } from '../server/db/sql/postgres.ts';

const url = process.env.DATABASE_URL ?? process.env.MABDA_TEST_DATABASE_URL;
if (!url) { console.error('set DATABASE_URL'); process.exit(1); }
const schema = `measure_${crypto.randomBytes(4).toString('hex')}`;
const db = new PostgresDatabase(url, { schema });
migrate(db);
const { app } = createApp(db);
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
const j = async (m: string, p: string, b?: unknown) => (await fetch(base + p, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })).json() as any;

const rows: Array<[string, number, number]> = [];
async function step(label: string, fn: () => Promise<unknown>) {
  const q0 = postgresRoundTrips(), t0 = performance.now();
  const out = await fn();
  rows.push([label, postgresRoundTrips() - q0, performance.now() - t0]);
  return out;
}
const boot = await step('bootstrap (first open, sample workspace)', () => j('POST', '/bootstrap', {})) as any;
const ws = boot.workspaces[0].id;
await step('load a workspace (state)', () => j('GET', `/workspaces/${ws}/state`));
const state = await j('GET', `/workspaces/${ws}/state`);
const nodeId = state.nodes[0].id;
await step('add one knowledge item', () => j('POST', `/workspaces/${ws}/objects`, { type: 'Fact', provenance: 'User Input', title: 'آزمون', content: 'متن', nodeId }));
await step('load the workspace again', () => j('GET', `/workspaces/${ws}/state`));

console.log('request | round trips | ms here');
for (const [l, q, ms] of rows) console.log(`${l} | ${q} | ${ms.toFixed(0)}`);
for (const rtt of [0.5, 2, 30]) console.log(`at ${rtt} ms per round trip, loading a workspace adds ≈ ${(rows[1][1] * rtt).toFixed(0)} ms`);
server.close();
db.query(`DROP SCHEMA "${schema}" CASCADE`);
db.close();
