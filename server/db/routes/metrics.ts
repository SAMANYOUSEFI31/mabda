/**
 * Metrics and measurements (recorded results, never Context objects) and the note extraction that was registered next to them.
 * Registered on the shared router by routes.ts in the original order (Express matches in order).
 */
import type { RouteContext } from './context.ts';
import type { Scope } from '../repo.ts';
import { RepoError, newId } from '../repo.ts';
import { ledgerEntryFromUsage } from '../../../src/core/ledger.ts';
import { userOf as aiUserOf } from '../../ai/routes.ts';

export function registerMetricsRoutes(ctx: RouteContext): void {
  const { repo, ai, router, scopeOf, body, metaOf, wrap } = ctx;
  const metricsState = (s: Scope) => ({ metrics: repo.listMetrics(s), measurements: repo.listMeasurements(s) });
  router.get('/workspaces/:wid/metrics', wrap((req, res) => { res.json(metricsState(scopeOf(req))); }));
  router.post('/workspaces/:wid/metrics', wrap((req, res) => { const s = scopeOf(req); const b = body(req); const metric = repo.createMetric(s, b, metaOf(b)); res.json({ metric, ...metricsState(s) }); }));
  router.put('/workspaces/:wid/metrics/:id', wrap((req, res) => { const s = scopeOf(req); const b = body(req); const metric = repo.updateMetric(s, req.params.id, b, metaOf(b)); res.json({ metric, ...metricsState(s) }); }));
  router.post('/workspaces/:wid/metrics/:id/archive', wrap((req, res) => { const s = scopeOf(req); const metric = repo.archiveMetric(s, req.params.id, metaOf(body(req))); res.json({ metric, ...metricsState(s) }); }));
  router.post('/workspaces/:wid/measurements', wrap((req, res) => {
    const s = scopeOf(req); const b = body(req);
    // Measurements submitted through the browser are manual regardless of request data.
    const measurement = repo.addMeasurement(s, { metricId: String(b.metricId ?? ''), value: b.value, at: typeof b.at === 'string' ? b.at : undefined, note: b.note, source: 'manual', decisionId: typeof b.decisionId === 'string' ? b.decisionId : undefined }, metaOf(b));
    res.json({ measurement, ...metricsState(s) });
  }));
  // the weekly quick entry: several fields at once; an empty field is simply not sent
  router.post('/workspaces/:wid/measurements/batch', wrap((req, res) => {
    const s = scopeOf(req); const b = body(req);
    const at = typeof b.at === 'string' ? b.at : undefined;
    const entries = (Array.isArray(b.entries) ? b.entries : []).slice(0, 100) as Array<{ metricId?: unknown; value?: unknown; note?: unknown }>;
    const added = repo.transaction(() => entries.map((e) => repo.addMeasurement(s, { metricId: String(e.metricId ?? ''), value: e.value, at, note: e.note, source: 'manual' }, metaOf(b))));
    res.json({ added, ...metricsState(s) });
  }));
  router.post('/workspaces/:wid/measurements/csv', wrap((req, res) => {
    const s = scopeOf(req); const b = body(req);
    const r = repo.addMeasurementsCsv(s, typeof b.text === 'string' ? b.text.slice(0, 200_000) : '', metaOf(b));
    res.json({ added: r.added.length, errors: r.errors, ...metricsState(s) });
  }));
  router.post('/workspaces/:wid/measurements/:id/confirm', wrap((req, res) => { const s = scopeOf(req); const measurement = repo.confirmMeasurement(s, req.params.id, metaOf(body(req))); res.json({ measurement, ...metricsState(s) }); }));
  router.delete('/workspaces/:wid/measurements/:id', wrap((req, res) => { const s = scopeOf(req); repo.removeMeasurement(s, req.params.id, metaOf(body(req))); res.json(metricsState(s)); }));
  router.post('/workspaces/:wid/notes/:id/extract', wrap(async (req, res) => {
    const s = scopeOf(req);
    const note = repo.getNote(s, req.params.id);
    if (!note) throw new RepoError('not_found', 'یادداشت پیدا نشد.');
    if (!note.content.trim()) throw new RepoError('invalid', 'یادداشت خالی است.');
    const aiUser = aiUserOf(req);
    const ctl = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ctl.abort('client'); });
    const r = await ai.extract(aiUser, { kind: 'note', text: note.content, nodeId: note.nodeId, nodes: repo.listNodes(s).map((n) => ({ id: n.id, label: n.label })) }, ctl.signal);
    const created = r.objects.slice(0, repo.objectSlots(s)).map((o) => repo.createObject(s, { type: o.type, status: 'Proposed', provenance: 'AI Suggested', title: o.title, content: o.content, nodeId: o.nodeId, source: { kind: 'note', at: new Date().toISOString() } }));
    const ledger = repo.addLedger(s, ledgerEntryFromUsage({ workspaceId: s.workspaceId, action: 'استخراج از یادداشت', mode: 'note_extract', creditCost: 0, usage: r.usage, id: newId('led') }));
    res.json({ created, ledger, usage: r.usage });
  }));
}
