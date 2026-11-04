/**
 * Full MCP scenario with the SDK test client against the REAL server code (in-memory SQLite, seeded sample workspace):
 *   get Gap → read Context → build the output OUTSIDE Mabda → save_asset (lineage) → the user changes Context → check_impact.
 *   npx tsx scripts/scenario-mcp.ts            prints the transcript
 *   npx tsx scripts/scenario-mcp.ts --write    also writes docs/mcp-scenario.md
 * The «external AI» steps are scripted (this is a client script, not a model).
 */
import { writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import Database from 'better-sqlite3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../server/app.ts';
import { migrate } from '../server/db/migrations.ts';

const db = new Database(':memory:'); migrate(db);
const { app } = createApp(db);
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const api = async (method: string, path: string, body?: unknown) => (await fetch(`${base}/api${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })).json() as Promise<any>;

const log: string[] = ['# سناریوی MCP: Claude (کلاینت تستی) ← مبدأ', '', 'کلاینت تستی SDK به `/mcp` وصل می‌شود؛ مرحله‌های «AI بیرونی» اسکریپتی‌اند، نه مدل.', ''];
const say = (s = '') => { console.log(s); log.push(s); };
const step = (n: number, title: string) => say(`\n## ${n}. ${title}`);
const block = (title: string, text: string) => { say(`**${title}**`); say('```'); say(text.length > 900 ? `${text.slice(0, 900)}\n…` : text); say('```'); };

await api('POST', '/bootstrap', {});
const { token } = await api('POST', '/workspaces/ws_studio/mcp/tokens', { label: 'Claude' });
const client = new Client({ name: 'scenario-client', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await client.callTool({ name, arguments: args });
  say(`\`${name}(${JSON.stringify(args)})\``);
  return { data: (r.structuredContent ?? {}) as any, text: String((r.content as Array<{ text?: string }>)[0]?.text ?? ''), isError: Boolean(r.isError) };
};

step(0, 'اتصال و دستورالعمل سرور');
block('instructions که مدل می‌بیند', client.getInstructions() ?? '');
say(`ابزارها: ${(await client.listTools()).tools.map((t) => `\`${t.name}\``).join('، ')}`);

step(1, 'نمای کلی و Gap (پیش از ساخت خروجی)');
const ov = await call('get_workspace_overview');
block('خلاصه', ov.text.split('\n').slice(0, 6).join('\n'));
const gaps = await call('get_gaps', { specId: 'main_positioning', deliverableId: 'del_positioning_statement' });
block('Gap + معیارها + خط قرمز', gaps.text);

step(2, 'خواندن Context (فقط Confirmed واقعیت است)');
const ctx = await call('get_context', { nodeId: 'business' });
block('Context', ctx.text);
const audience = ctx.data.facts.find((f: any) => f.id === 'ctx_audience');

step(3, 'AI خروجی را بیرون از مبدأ می‌سازد و تصمیم تازه‌ای که از کاربر شنیده را فقط «پیشنهاد» می‌دهد');
const prop = await call('propose_context_updates', { updates: [{ type: 'Decision', title: 'تمرکز اول روی طراحان', content: 'اولین بخش هدف طراحان فریلنسر است.', nodeId: 'business', reason: 'کاربر در گفتگو گفت' }] });
block('نتیجه', prop.text);

step(4, 'ذخیرهٔ خروجی با اصالت');
const saved = await call('save_asset', {
  title: 'جملهٔ موقعیت‌یابی (Claude)', markdown: 'برای فریلنسرها و مشاوران مستقل که از توضیح دوبارهٔ کسب‌وکارشان خسته‌اند، مبدأ منبع حقیقتی است که هر AI از آن کار می‌کند.',
  deliverableId: 'del_positioning_statement', usedContext: [{ id: 'ctx_audience', version: audience.version }, { id: 'ctx_domain' }],
});
block('نتیجه', saved.text);
const before = await call('check_impact', { assetId: saved.data.assetId });
say(`> check_impact بلافاصله بعد از ذخیره: ${before.data.staleCount} دارایی قدیمی.`);

step(5, 'کاربر در مبدأ «مخاطب اصلی» را تغییر می‌دهد');
const edit = await api('PATCH', '/workspaces/ws_studio/objects/ctx_audience', { content: 'مدیران محصول استارتاپ‌های ایرانی.' });
say(`نسخهٔ «${edit.object.title}»: ${audience.version} ← ${edit.object.version}`);

step(6, 'check_impact');
const impact = await call('check_impact');
block('نتیجه', impact.text);
const asset = await call('get_asset', { id: saved.data.assetId });
say(`> دارایی «${asset.data.title}» قدیمی است: ${asset.data.stale}. دلیل: ${asset.data.staleReasons.join('؛ ')}`);

say('\n(پیشنهاد «تمرکز اول روی طراحان» در صندوق پیشنهادهای مبدأ با منبع «Claude» منتظر تأیید کاربر است؛ هرگز مستقیم Confirmed نمی‌شود.)');
await client.close();
server.close();
if (process.argv.includes('--write')) writeFileSync('docs/mcp-scenario.md', `${log.join('\n')}\n`);
