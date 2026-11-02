import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContextObject, GeneratedDeliverable, TreeNode, WorkstreamSpec } from '../../src/types/index.ts';
import { calculateReadinessAndGaps } from '../../src/core/contextEngine.ts';
import { ancestorIds, subtreeIds } from '../../src/core/nodeTree.ts';
import { bm25Rank } from '../../src/core/retrieval.ts';
import { lockOf, lockReason } from '../../src/core/specGraph.ts';
import { WORKSTREAM_SPECS } from '../../src/core/specs.ts';
import { can, entitlementsOf, objectsRemaining } from '../../src/core/entitlements.ts';
import { newId, RepoError } from '../db/repo.ts';
import type { Repo, Scope } from '../db/repo.ts';

/**
 * The instructions every MCP client shows its model. They encode Mabda's rules: Gap first, read Context from Mabda,
 * never write facts directly, always record lineage.
 */
export const MCP_INSTRUCTIONS = `Mabda (مبدأ) منبع حقیقت کسب‌وکار کاربر است. تو از طریق این ابزارها از همین منبع کار می‌کنی.
Mabda is the user's business source of truth. Work from it with these rules:
۱. شروع: get_workspace_overview را صدا بزن تا درخت دانش، specها و وضعیت را ببینی.
۲. پیش از ساخت هر خروجی: get_gaps (یا get_readiness) را برای spec/خروجی بگیر. شکاف‌های الزامی را اول از کاربر بپرس؛ اگر کاربر ادامه داد، صریح بگو کدام بخش‌ها فرض‌اند.
۳. Context را از Mabda بخوان (get_context). فقط موارد Confirmed «واقعیت»اند؛ موارد Proposed/Needs Review تأییدنشده‌اند و نباید به‌عنوان واقعیت استفاده شوند. چیزی از خودت به‌عنوان واقعیت کسب‌وکار اختراع نکن.
۴. هر تصمیم، واقعیت یا محدودیت تازه‌ای که از کاربر شنیدی را فقط با propose_context_updates پیشنهاد بده؛ اگر پیشنهاد یکی از شکاف‌های get_gaps را پر می‌کند، slotKey را برابر key همان شکاف بگذار. این ابزار هرگز مستقیم Confirmed نمی‌سازد؛ کاربر در صندوق پیشنهادهای Mabda تأیید می‌کند.
۵. وقتی خروجی ساختی، با save_asset ذخیره‌اش کن و در usedContext دقیقاً شناسه و نسخهٔ Contextهایی را بده که خواندی (اصالت و تشخیص «قدیمی‌شدن» به همین بسته است).
۶. وقتی کاربر Context را تغییر داد، check_impact را بزن و بگو کدام دارایی‌ها قدیمی شده‌اند.
۷. get_changes (فقط‌خواندنی): ببین از فلان زمان چه کسی چه چیزی را عوض کرده؛ دلیل‌های ثبت‌شده برای کاربر است و در خروجی نمی‌آید.
گاردریل‌ها (Constraintهای Confirmed و گاردریل‌های spec) را رعایت کن.`;

type Json = Record<string, unknown>;
const reply = (md: string, data: Json) => ({ content: [{ type: 'text' as const, text: md }], structuredContent: data });
const fail = (message: string) => ({ isError: true as const, content: [{ type: 'text' as const, text: message }] });

export interface McpContext { repo: Repo; scope: Scope; /** token label = «which AI» */ label: string }

const specsOf = (c: McpContext): WorkstreamSpec[] => [...c.repo.listSpecs(c.scope), ...WORKSTREAM_SPECS];
const pathOf = (nodes: TreeNode[], id: string) => ancestorIds(nodes, id).reverse().map((n) => nodes.find((x) => x.id === n)?.label ?? n).join(' ‹ ');

const view = (nodes: TreeNode[], o: ContextObject) => ({
  id: o.id, version: o.version, type: o.type, status: o.status, nodeId: o.nodeId, nodePath: pathOf(nodes, o.nodeId), title: o.title, content: o.content,
  ...(o.source ? { source: o.source } : {}), ...(o.slotKey ? { slotKey: o.slotKey } : {}),
});
const mdLine = (v: ReturnType<typeof view>) => `- **[${v.type}] ${v.title}** (\`${v.id}@v${v.version}\`, ${v.nodePath}): ${v.content.replace(/\n+/g, ' ')}`;

export function buildMcpServer(c: McpContext): McpServer {
  const { repo, scope } = c;
  const server = new McpServer({ name: 'mabda', version: '1.0.0' }, { instructions: MCP_INSTRUCTIONS });
  const plan = () => repo.getWorkspace(scope.userId, scope.workspaceId)!.planId;

  // ── overview ──────────────────────────────────────────────────────────
  server.registerTool('get_workspace_overview', {
    title: 'نمای کلی فضای کاری',
    description: 'Start here. The knowledge tree (nodes with counts), the workstream specs and their outputs (built / locked), asset and pending-proposal counts. خلاصهٔ فضای کاری، درخت دانش و specها.',
    inputSchema: {},
  }, async () => {
    const ws = repo.getWorkspace(scope.userId, scope.workspaceId)!;
    const nodes = repo.listNodes(scope);
    const objects = repo.listObjects(scope);
    const dels = repo.listDeliverables(scope);
    const built = new Set(dels.map((d) => d.deliverableId));
    const active = objects.filter((o) => o.status !== 'Archived' && o.status !== 'Superseded');
    const tree = nodes.map((n) => ({ id: n.id, label: n.label, parentId: n.parentId ?? null, path: pathOf(nodes, n.id), isSystem: !!n.isSystem, confirmed: active.filter((o) => o.nodeId === n.id && o.status === 'Confirmed').length, unconfirmed: active.filter((o) => o.nodeId === n.id && o.status !== 'Confirmed').length }));
    const specs = specsOf(c).map((s) => ({
      id: s.id, title: s.title, target: s.target, guardrails: s.guardrails ?? [],
      deliverables: s.deliverables.map((d) => ({ id: d.id, title: d.title, dependsOn: d.dependsOn ?? [], built: built.has(d.id), locked: lockOf(d, s.deliverables, built).locked })),
    }));
    const stale = can(plan(), 'changeImpact') ? repo.computeStale(scope, dels).length : 0;
    const data = {
      workspace: { id: ws.id, name: ws.name, plan: ws.planId }, tree, specs,
      counts: { confirmed: active.filter((o) => o.status === 'Confirmed').length, unconfirmed: active.filter((o) => o.status !== 'Confirmed').length, assets: dels.length, staleAssets: stale, pendingProposals: active.filter((o) => o.status === 'Proposed').length },
      limits: { objectsRemaining: objectsRemaining(plan(), active.length) },
    };
    const md = [
      `# ${ws.name}`,
      `- دانش تأییدشده: ${data.counts.confirmed} · تأییدنشده: ${data.counts.unconfirmed} · دارایی: ${data.counts.assets} · قدیمی: ${stale} · پیشنهاد منتظر تأیید: ${data.counts.pendingProposals}`,
      '## درخت دانش', ...tree.map((t) => `- ${t.path} (\`${t.id}\`): ${t.confirmed} تأییدشده، ${t.unconfirmed} تأییدنشده`),
      '## جریان‌های کار', ...specs.map((s) => `- **${s.title}** (\`${s.id}\`): ${s.deliverables.map((d) => `${d.title} (\`${d.id}\`${d.built ? ' ✓' : d.locked ? ' قفل' : ''})`).join('، ')}`),
    ].join('\n');
    return reply(md, data);
  });

  // ── context ───────────────────────────────────────────────────────────
  server.registerTool('get_context', {
    title: 'خواندن Context',
    description: 'Read knowledge. Only status Confirmed is fact; Proposed / Needs Review are returned separately under `unconfirmed` and must NOT be treated as fact. Filter by node (with sub-tree), type, status and free-text query. Pass the returned id+version to save_asset.',
    inputSchema: {
      nodeId: z.string().optional().describe('node id from get_workspace_overview'),
      includeSubtree: z.boolean().optional().describe('default true'),
      types: z.array(z.enum(['Fact', 'Decision', 'Constraint'])).optional(),
      statuses: z.array(z.enum(['Confirmed', 'Proposed', 'Needs Review'])).optional().describe('default: all three'),
      query: z.string().optional().describe('keyword search (BM25) in title and content'),
      limit: z.number().int().min(1).max(200).optional(),
    },
  }, async (a) => {
    const nodes = repo.listNodes(scope);
    if (a.nodeId && !nodes.some((n) => n.id === a.nodeId)) return fail(`گرهٔ «${a.nodeId}» وجود ندارد.`);
    const inNodes = a.nodeId ? new Set(a.includeSubtree === false ? [a.nodeId] : subtreeIds(nodes, a.nodeId)) : null;
    const statuses = new Set(a.statuses ?? ['Confirmed', 'Proposed', 'Needs Review']);
    let list = repo.listObjects(scope).filter((o) => statuses.has(o.status as never) && (!inNodes || inNodes.has(o.nodeId)) && (!a.types || a.types.includes(o.type as never)));
    if (a.query?.trim()) list = bm25Rank(a.query, list.map((o) => ({ o, text: `${o.title}\n${o.content}` }))).map((r) => r.chunk.o);
    list = list.slice(0, a.limit ?? 50);
    const facts = list.filter((o) => o.status === 'Confirmed').map((o) => view(nodes, o));
    const unconfirmed = list.filter((o) => o.status !== 'Confirmed').map((o) => view(nodes, o));
    const md = [
      '## واقعیت‌ها (Confirmed)', facts.length ? facts.map(mdLine).join('\n') : 'موردی نیست.',
      '## تأییدنشده (Proposed / Needs Review) — واقعیت نیست', unconfirmed.length ? unconfirmed.map(mdLine).join('\n') : 'موردی نیست.',
    ].join('\n\n');
    return reply(md, { facts, unconfirmed, note: 'Only `facts` are facts. For save_asset pass usedContext: [{id, version}] of what you used.' });
  });

  // ── gaps / readiness ──────────────────────────────────────────────────
  const gapArgs = { specId: z.string().describe('spec id from get_workspace_overview'), deliverableId: z.string().optional() };
  const findSpec = (id: string) => specsOf(c).find((s) => s.id === id);
  const readinessOf = (spec: WorkstreamSpec) => calculateReadinessAndGaps(spec, repo.listObjects(scope), [], repo.listJudgments(scope));

  server.registerTool('get_gaps', {
    title: 'شکاف‌های دانش',
    description: 'Call BEFORE producing an output. Missing / ambiguous required context for a spec (and the output\'s acceptance criteria, guardrails and lock state when deliverableId is given). Ask the user about required gaps first.',
    inputSchema: gapArgs,
  }, async (a) => {
    const spec = findSpec(a.specId);
    if (!spec) return fail(`spec «${a.specId}» وجود ندارد.`);
    const r = readinessOf(spec);
    const del = a.deliverableId ? spec.deliverables.find((d) => d.id === a.deliverableId) : undefined;
    if (a.deliverableId && !del) return fail(`خروجی «${a.deliverableId}» در این spec نیست.`);
    const built = new Set(repo.listDeliverables(scope).map((d) => d.deliverableId));
    const lock = del ? lockOf(del, spec.deliverables, built) : null;
    const data = {
      specId: spec.id, gaps: r.gaps.map((g) => ({ key: g.key, label: g.label, importance: g.importance, status: g.status, nodeId: g.nodeId, question: g.question, suggestedAnswers: g.suggestedAnswers })),
      ...(del ? { deliverable: { id: del.id, title: del.title, acceptanceCriteria: del.acceptanceCriteria, dependsOn: del.dependsOn ?? [], locked: lock!.locked, lockReason: lockReason(lock!) } } : {}),
      guardrails: [...(spec.guardrails ?? []), ...repo.listObjects(scope).filter((o) => o.status === 'Confirmed' && o.type === 'Constraint').map((o) => `${o.title}: ${o.content}`)],
    };
    const md = [
      `## شکاف‌ها — ${spec.title}`, data.gaps.length ? data.gaps.map((g) => `- (${g.importance === 'required' ? 'الزامی' : 'پیشنهادی'}, ${g.status === 'missing' ? 'ثبت‌نشده' : 'مبهم'}) **${g.label}**: ${g.question}`).join('\n') : 'شکافی نیست.',
      ...(del ? [`## ${del.title}`, ...(lock!.locked ? [`قفل: ${lockReason(lock!)}`] : []), '### معیارهای پذیرش', ...del.acceptanceCriteria.map((x) => `- ${x}`)] : []),
      '## گاردریل‌ها', data.guardrails.length ? data.guardrails.map((g) => `- ${g}`).join('\n') : 'نیست.',
    ].join('\n');
    return reply(md, data);
  });

  server.registerTool('get_readiness', {
    title: 'آمادگی',
    description: 'Readiness (0–100, ready / needs_work / blocked) of a spec: how much of the required Context is confirmed. Use it to decide whether to build now or ask first.',
    inputSchema: gapArgs,
  }, async (a) => {
    const spec = findSpec(a.specId);
    if (!spec) return fail(`spec «${a.specId}» وجود ندارد.`);
    const r = readinessOf(spec);
    return reply(`## آمادگی — ${spec.title}\n${r.summary}\n- امتیاز: ${r.score} · وضعیت: ${r.status} · ${r.confirmedCount} از ${r.totalRequired} الزامی تأییدشده`, { specId: spec.id, score: r.score, status: r.status, confirmedCount: r.confirmedCount, totalRequired: r.totalRequired, summary: r.summary, gapCount: r.gaps.length });
  });

  // ── propose (never Confirmed) ─────────────────────────────────────────
  server.registerTool('propose_context_updates', {
    title: 'پیشنهاد به‌روزرسانی Context',
    description: 'Suggest new Facts / Decisions / Constraints you learned from the user. They are saved as PROPOSED only and wait in the Mabda proposals inbox for the user to confirm, edit or reject — this tool can never create confirmed knowledge.',
    inputSchema: {
      updates: z.array(z.object({
        type: z.enum(['Fact', 'Decision', 'Constraint']),
        title: z.string().min(1).max(120),
        content: z.string().min(1).max(2000),
        nodeId: z.string().optional().describe('target node id; default business'),
        reason: z.string().max(400).optional().describe('why you suggest it (shown to the user)'),
        slotKey: z.string().max(80).optional().describe('the Gap item this fills: pass the `key` of an item returned by get_gaps; without it the suggestion is just free knowledge'),
      })).min(1).max(20),
    },
  }, async (a) => {
    const nodes = repo.listNodes(scope);
    const existing = repo.listObjects(scope).filter((o) => o.status === 'Proposed');
    const results: Array<{ ok: boolean; id?: string; title: string; status?: 'Proposed'; note?: string; error?: string }> = [];
    for (const u of a.updates) {
      try {
        const dup = existing.find((o) => o.title === u.title.trim() && o.content === u.content);
        if (dup) { results.push({ ok: true, id: dup.id, title: u.title, status: 'Proposed', note: 'همین پیشنهاد از قبل در صندوق است.' }); continue; }
        const nodeId = u.nodeId && nodes.some((n) => n.id === u.nodeId) ? u.nodeId : 'business';
        const knownSlots = new Set(specsOf(c).flatMap((s) => [...s.requiredContext, ...s.suggestedContext, ...s.optionalContext].map((x) => x.key)));
        const slotKey = u.slotKey && knownSlots.has(u.slotKey) ? u.slotKey : undefined;
        // status is fixed here on purpose: nothing a client sends can make it Confirmed
        const o = repo.createObject(scope, { type: u.type, status: 'Proposed', provenance: 'AI Suggested', title: u.title, content: u.content, nodeId, slotKey, source: { kind: 'mcp', label: c.label, ...(u.reason ? { reason: u.reason } : {}), at: new Date().toISOString() } });
        results.push({ ok: true, id: o.id, title: o.title, status: 'Proposed', ...(nodeId !== u.nodeId && u.nodeId ? { note: `گرهٔ «${u.nodeId}» نبود؛ در «business» ثبت شد.` } : u.slotKey && !slotKey ? { note: `slotKey «${u.slotKey}» هیچ شکافی نیست؛ بدون اتصال ثبت شد.` } : {}) });
      } catch (e) {
        results.push({ ok: false, title: u.title, error: e instanceof RepoError ? e.message : 'ثبت نشد.' });
      }
    }
    const okCount = results.filter((r) => r.ok).length;
    return reply(`${okCount} پیشنهاد در صندوق Mabda منتظر تأیید کاربر است (وضعیت: Proposed، نه واقعیت).\n${results.map((r) => `- ${r.ok ? '✓' : '✗'} ${r.title}${r.error ? `: ${r.error}` : ''}`).join('\n')}`, { results, status: 'Proposed', awaitingApproval: okCount });
  });

  // ── assets ────────────────────────────────────────────────────────────
  server.registerTool('save_asset', {
    title: 'ذخیرهٔ دارایی',
    description: 'Save an output you produced as an asset (Markdown). usedContext = the Context objects (id, optional version) you actually used — this is the asset\'s lineage: when any of them changes the asset is flagged stale. usedContextIds is accepted as a shorthand (current versions).',
    inputSchema: {
      title: z.string().min(1).max(200),
      markdown: z.string().min(1),
      deliverableId: z.string().optional().describe('output id from a spec, if this asset is that output'),
      usedContext: z.array(z.object({ id: z.string(), version: z.number().int().min(1).optional() })).optional(),
      usedContextIds: z.array(z.string()).optional(),
    },
  }, async (a) => {
    const objects = repo.listObjects(scope);
    const byId = new Map(objects.map((o) => [o.id, o]));
    const wanted = new Map<string, number | undefined>();
    for (const id of a.usedContextIds ?? []) wanted.set(id, undefined);
    for (const u of a.usedContext ?? []) wanted.set(u.id, u.version);
    const unknown = [...wanted.keys()].filter((id) => !byId.has(id));
    if (unknown.length) return fail(`این شناسه‌های Context وجود ندارند: ${unknown.join('، ')}`);
    const usedContext = [...wanted].map(([id, version]) => ({ id, version: version ?? byId.get(id)!.version }));
    const spec = a.deliverableId ? specsOf(c).find((s) => s.deliverables.some((d) => d.id === a.deliverableId)) : undefined;
    if (a.deliverableId && !spec) return fail(`خروجی «${a.deliverableId}» در هیچ specی نیست.`);
    const now = new Date().toISOString();
    const asset: GeneratedDeliverable = {
      id: newId('del_mcp'), workspaceId: scope.workspaceId, workstreamId: spec?.id ?? 'external', deliverableId: a.deliverableId ?? `external_${newId('x')}`,
      title: a.title.trim(), content: a.markdown, executionMode: 'auto', creditCost: 0, usedContext, rebuildCount: 0, createdAt: now,
      source: { kind: 'mcp', label: c.label, at: now },
    };
    repo.saveDeliverable(scope, asset);
    return reply(`دارایی «${asset.title}» ذخیره شد (\`${asset.id}\`). اصالت: ${usedContext.length} Context. با تغییر هر کدام «قدیمی» می‌شود.`, { assetId: asset.id, title: asset.title, usedContext, workstreamId: asset.workstreamId });
  });

  const assetView = (d: GeneratedDeliverable, objects: ContextObject[]) => {
    const reasons = can(plan(), 'changeImpact') ? (repo.computeStale(scope, [d])[0]?.reasons ?? []) : [];
    return { id: d.id, title: d.title, workstreamId: d.workstreamId, deliverableId: d.deliverableId, createdAt: d.createdAt, source: d.source ?? null, stale: reasons.length > 0, staleReasons: reasons.map((r) => r.message) };
  };

  server.registerTool('list_assets', {
    title: 'فهرست دارایی‌ها',
    description: 'List saved assets (newest first) with their stale state. Filter by keyword or staleOnly.',
    inputSchema: { query: z.string().optional(), staleOnly: z.boolean().optional(), limit: z.number().int().min(1).max(100).optional() },
  }, async (a) => {
    const objects = repo.listObjects(scope);
    let list = repo.listDeliverables(scope);
    if (a.query?.trim()) list = bm25Rank(a.query, list.map((d) => ({ d, text: `${d.title}\n${d.content}` }))).map((r) => r.chunk.d);
    let items = list.map((d) => assetView(d, objects));
    if (a.staleOnly) items = items.filter((x) => x.stale);
    items = items.slice(0, a.limit ?? 30);
    return reply(items.length ? items.map((x) => `- ${x.stale ? '⚠ قدیمی · ' : ''}**${x.title}** (\`${x.id}\`)`).join('\n') : 'دارایی‌ای نیست.', { assets: items });
  });

  server.registerTool('get_asset', {
    title: 'خواندن دارایی',
    description: 'One asset: Markdown content, the Context versions it was built from (and whether they changed since) and stale reasons.',
    inputSchema: { id: z.string() },
  }, async (a) => {
    const d = repo.getDeliverable(scope, a.id);
    if (!d) return fail(`دارایی «${a.id}» پیدا نشد.`);
    const objects = repo.listObjects(scope);
    const byId = new Map(objects.map((o) => [o.id, o]));
    const lineage = (d.usedContext ?? []).map((u) => ({ id: u.id, version: u.version, title: byId.get(u.id)?.title ?? null, currentVersion: byId.get(u.id)?.version ?? null, changed: (byId.get(u.id)?.version ?? 0) !== u.version }));
    const v = assetView(d, objects);
    return reply(`# ${d.title}\n${v.stale ? `⚠ قدیمی: ${v.staleReasons.join('؛ ')}\n` : ''}\n${d.content}`, { ...v, content: d.content, usedContext: lineage });
  });

  // ── change log (read-only; reasons are for the user and are not returned) ──
  server.registerTool('get_changes', {
    title: 'تغییرها',
    description: 'Read-only. What happened to Context objects: created / edited / status changes / replaced… with who did it (user, an AI, import) and when. Filter by objectId and/or since (ISO date). The user\'s written reasons are NOT included.',
    inputSchema: { objectId: z.string().optional(), since: z.string().optional(), limit: z.number().int().min(1).max(200).optional() },
  }, async (a) => {
    const since = a.since && !Number.isNaN(Date.parse(a.since)) ? new Date(a.since).toISOString() : undefined;
    if (a.since && !since) return fail('since باید تاریخ ISO معتبر باشد.');
    const nodes = repo.listNodes(scope);
    const byId = new Map(repo.listObjects(scope).map((o) => [o.id, o]));
    const all = repo.listChanges(scope, { objectId: a.objectId, since });
    const items = all.slice(-(a.limit ?? 50)).map((ch) => {
      const o = byId.get(ch.objectId);
      return { id: ch.id, at: ch.at, kind: ch.kind, actor: ch.actor, ...(ch.actorLabel ? { actorLabel: ch.actorLabel } : {}), objectId: ch.objectId, title: o?.title ?? null, nodePath: o ? pathOf(nodes, o.nodeId) : null, fromVersion: ch.fromVersion, toVersion: ch.toVersion, hasReason: !!ch.reason, ...(ch.before ? { before: ch.before } : {}), ...(ch.after ? { after: ch.after } : {}) };
    });
    const md = items.length ? `## ${items.length} تغییر\n${items.map((i) => `- ${i.at.slice(0, 16).replace('T', ' ')} · ${i.kind} · ${i.actor}${i.actorLabel ? ` (${i.actorLabel})` : ''} · ${i.title ?? i.objectId} (v${i.fromVersion}→v${i.toVersion})`).join('\n')}` : 'تغییری ثبت نشده است.';
    return reply(md, { count: items.length, changes: items });
  });

  // ── impact ────────────────────────────────────────────────────────────
  server.registerTool('check_impact', {
    title: 'اثر تغییر',
    description: 'After the user changed Context: which assets became stale and why (e.g. «مخاطب اصلی» v1 → v2). Pass assetId to check one asset.',
    inputSchema: { assetId: z.string().optional() },
  }, async (a) => {
    if (!can(plan(), 'changeImpact')) return fail('موتور اثر تغییر در این پلن فعال نیست.');
    const dels = repo.listDeliverables(scope).filter((d) => !a.assetId || d.id === a.assetId);
    if (a.assetId && !dels.length) return fail(`دارایی «${a.assetId}» پیدا نشد.`);
    const stale = repo.computeStale(scope, dels);
    const items = stale.map((s) => ({ assetId: s.deliverableId, title: dels.find((d) => d.id === s.deliverableId)?.title ?? s.deliverableId, reasons: s.reasons.map((r) => ({ message: r.message, objectId: r.objectId, kind: r.kind, usedVersion: r.usedVersion, currentVersion: r.currentVersion ?? null })) }));
    const md = items.length ? `## ${items.length} دارایی قدیمی شده\n${items.map((i) => `- **${i.title}** (\`${i.assetId}\`): ${i.reasons.map((r) => r.message).join('؛ ')}`).join('\n')}\n\nبازسازی در Mabda یا با خواندن Context تازه و save_asset دوباره.` : 'هیچ دارایی‌ای قدیمی نشده است.';
    return reply(md, { checked: dels.length, staleCount: items.length, stale: items });
  });

  return server;
}
