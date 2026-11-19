/**
 * Metrics and measurements (not Context objects, never facts).
 * Part of the Repo (server/db/repo/index.ts): the methods are mixed into `Repo`, so `this` is the whole Repo and every
 * call and every transaction behaves exactly as when it was one class. See docs/architecture.md → «نقشهٔ پوشه‌ها».
 */
import { tehranDay } from '../../../src/core/tehranDate.ts';
import type { Repo } from './index.ts';
import { ChangeMeta, RepoError, Scope, newId, now } from './shared.ts';
import { isIsoDate, parseMeasurementCsv } from '../../../src/core/metrics.ts';
import type { Measurement, MeasurementSource, Metric, MetricCadence, MetricDirection } from '../../../src/types/index.ts';

export const metricsMethods = {
  //    a legacy externally-suggested number is `Proposed` and invisible to charts, counts and packs until the user confirms it ──
  rowToMetric(this: Repo, r: Record<string, unknown>): Metric {
    return { id: r.id as string, workspaceId: r.workspace_id as string, name: r.name as string, unit: (r.unit as string) ?? '', direction: r.direction as MetricDirection, ...(r.target !== null && r.target !== undefined ? { target: r.target as number } : {}), ...(r.archived ? { archived: true } : {}), ...(r.object_id ? { objectId: r.object_id as string } : {}), ...(r.cadence === 'week' || r.cadence === 'month' ? { cadence: r.cadence as MetricCadence } : {}), createdAt: r.created_at as string, updatedAt: r.updated_at as string };
  },

  rowToMeasurement(this: Repo, r: Record<string, unknown>): Measurement {
    return { id: r.id as string, workspaceId: r.workspace_id as string, metricId: r.metric_id as string, value: r.value as number, at: r.at as string, ...(r.note ? { note: r.note as string } : {}), source: r.source as MeasurementSource, status: r.status as Measurement['status'], ...(r.decision_id ? { decisionId: r.decision_id as string } : {}), createdAt: r.created_at as string };
  },

  listMetrics(this: Repo, s: Scope): Metric[] {
    return (this.db.prepare('SELECT * FROM metrics WHERE workspace_id = ? AND user_id = ? ORDER BY created_at, id').all(s.workspaceId, s.userId) as Array<Record<string, unknown>>).map((r) => this.rowToMetric(r));
  },

  getMetric(this: Repo, s: Scope, id: string): Metric | undefined {
    const r = this.db.prepare('SELECT * FROM metrics WHERE id = ? AND workspace_id = ? AND user_id = ?').get(id, s.workspaceId, s.userId) as Record<string, unknown> | undefined;
    return r ? this.rowToMetric(r) : undefined;
  },

  cleanMetricFields(this: Repo, s: Scope, i: { name?: unknown; unit?: unknown; direction?: unknown; target?: unknown; objectId?: unknown; cadence?: unknown }, cur?: Metric) {
    // «پایش» lives on a truth: the object must be this workspace's own, and one truth carries at most one live monitor
    const objectId = i.objectId === undefined ? cur?.objectId : i.objectId === null || i.objectId === '' ? undefined : typeof i.objectId === 'string' ? i.objectId : (() => { throw new RepoError('invalid', 'حقیقت معتبر نیست.'); })();
    const object = objectId ? this.getObject(s, objectId) : undefined;
    if (objectId && !object) throw new RepoError('not_found', 'حقیقتی که پایش روی آن است پیدا نشد.');
    if (objectId && objectId !== cur?.objectId && this.listMetrics(s).some((m) => !m.archived && m.id !== cur?.id && m.objectId === objectId)) throw new RepoError('invalid', 'این حقیقت همین حالا پایش دارد.');
    const rawName = i.name === undefined ? cur?.name ?? object?.title : i.name;
    const name = typeof rawName === 'string' ? rawName.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
    if (!name) throw new RepoError('invalid', 'نام عدد لازم است.');
    const direction = i.direction === undefined ? cur?.direction : i.direction;
    if (direction !== 'up' && direction !== 'down') throw new RepoError('invalid', 'مشخص کن بالاتر بهتر است یا پایین‌تر.');
    const unit = i.unit === undefined ? cur?.unit ?? '' : typeof i.unit === 'string' ? i.unit.trim().slice(0, 20) : '';
    const target = i.target === undefined ? cur?.target : i.target === null || i.target === '' ? undefined : typeof i.target === 'number' && Number.isFinite(i.target) ? i.target : (() => { throw new RepoError('invalid', 'هدف باید عدد باشد.'); })();
    const cadence = i.cadence === undefined ? cur?.cadence : i.cadence === null || i.cadence === '' ? undefined : i.cadence === 'week' || i.cadence === 'month' ? i.cadence as MetricCadence : (() => { throw new RepoError('invalid', 'آهنگ تازه شدن هفتگی یا ماهانه است.'); })();
    return { name, unit, direction: direction as MetricDirection, target, objectId, cadence };
  },

  createMetric(this: Repo, s: Scope, i: { id?: string; name?: unknown; unit?: unknown; direction?: unknown; target?: unknown; objectId?: unknown; cadence?: unknown; at?: string }, meta?: ChangeMeta): Metric {
    this.assertWorkspace(s);
    const f = this.cleanMetricFields(s, i);
    // a monitor is known by its truth; only a number on its own (made before monitoring moved onto truths) is known by its name
    if (!f.objectId && this.listMetrics(s).some((m) => !m.archived && !m.objectId && m.name.toLowerCase() === f.name.toLowerCase())) throw new RepoError('invalid', 'عددی با این نام هست.');
    const id = i.id ?? newId('met'); const t = i.at ?? now();
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO metrics (id, user_id, workspace_id, name, unit, direction, target, archived, object_id, cadence, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id, s.userId, s.workspaceId, f.name, f.unit, f.direction, f.target ?? null, null, f.objectId ?? null, f.cadence ?? null, t, t);
      this.recordChange(s, { objectId: `metric:${id}`, fromVersion: 0, toVersion: 1, kind: 'metric_created', meta: { actor: 'user', ...meta }, after: { name: f.name, unit: f.unit, direction: f.direction, ...(f.target !== undefined ? { target: f.target } : {}), ...(f.objectId ? { monitors: f.objectId } : {}), ...(f.cadence ? { cadence: f.cadence } : {}) }, at: t });
    })();
    return this.getMetric(s, id)!;
  },

  updateMetric(this: Repo, s: Scope, id: string, patch: { name?: unknown; unit?: unknown; direction?: unknown; target?: unknown; objectId?: unknown; cadence?: unknown }, meta?: ChangeMeta): Metric {
    const cur = this.getMetric(s, id);
    if (!cur) throw new RepoError('not_found', 'عدد پیدا نشد.');
    if (cur.archived) throw new RepoError('invalid', 'این پایش بایگانی شده است.');
    const f = this.cleanMetricFields(s, patch, cur);
    const before: Record<string, unknown> = {}; const after: Record<string, unknown> = {};
    for (const k of ['name', 'unit', 'direction', 'target', 'objectId', 'cadence'] as const) if ((cur[k] ?? null) !== (f[k] ?? null)) { before[k] = cur[k] ?? null; after[k] = f[k] ?? null; }
    if (!Object.keys(after).length) return cur;
    const diff = { before, after };
    this.db.transaction(() => {
      this.db.prepare('UPDATE metrics SET name=?, unit=?, direction=?, target=?, object_id=?, cadence=?, updated_at=? WHERE id=? AND workspace_id=? AND user_id=?').run(f.name, f.unit, f.direction, f.target ?? null, f.objectId ?? null, f.cadence ?? null, now(), id, s.workspaceId, s.userId);
      this.recordChange(s, { objectId: `metric:${id}`, fromVersion: 1, toVersion: 1, kind: 'metric_edited', meta: { actor: 'user', ...meta }, before: diff.before, after: diff.after });
    })();
    return this.getMetric(s, id)!;
  },

  /**
   * «جایگزین کن» (or «این را نگه دار» in a contradiction): the number is part of the truth, so its live monitor moves to the truth
   * that replaces it, with every number and its cadence (audit, PR #91). Runs inside the caller's transaction. When the new truth
   * cannot carry a monitor (not a Fact, an assumption, or it has its own already), the monitor is left unlinked: it shows up in
   * «منتظر تو» as «وصل کردن», never lost and never moved onto the wrong truth.
   */
  carryMonitor(this: Repo, s: Scope, fromId: string, toId: string): void {
    const m = this.listMetrics(s).find((x) => !x.archived && x.objectId === fromId);
    if (!m) return;
    const to = this.getObject(s, toId);
    const fits = !!to && to.type === 'Fact' && !to.assumption && !this.listMetrics(s).some((x) => !x.archived && x.objectId === toId);
    const next = fits ? toId : null;
    this.db.prepare('UPDATE metrics SET object_id=?, name=?, updated_at=? WHERE id=? AND workspace_id=? AND user_id=?').run(next, fits ? to!.title : m.name, now(), m.id, s.workspaceId, s.userId);
    this.recordChange(s, { objectId: `metric:${m.id}`, fromVersion: 1, toVersion: 1, kind: 'metric_edited', meta: { actor: 'system', reason: fits ? 'حقیقتش جایگزین شد؛ پایش همراهش آمد' : 'حقیقتش جایگزین شد؛ تا وصل کنی بی‌حقیقت می‌ماند' }, before: { objectId: fromId }, after: { objectId: next } });
  },

  /** archived, never deleted: its numbers and the decisions that pointed at it stay readable */
  archiveMetric(this: Repo, s: Scope, id: string, meta?: ChangeMeta): Metric {
    const cur = this.getMetric(s, id);
    if (!cur) throw new RepoError('not_found', 'عدد پیدا نشد.');
    if (cur.archived) return cur;
    this.db.transaction(() => {
      this.db.prepare('UPDATE metrics SET archived = 1, updated_at = ? WHERE id = ? AND workspace_id = ? AND user_id = ?').run(now(), id, s.workspaceId, s.userId);
      this.recordChange(s, { objectId: `metric:${id}`, fromVersion: 1, toVersion: 1, kind: 'metric_archived', meta: { actor: 'user', ...meta } });
    })();
    return this.getMetric(s, id)!;
  },

  listMeasurements(this: Repo, s: Scope, f: { metricId?: string; status?: Measurement['status'] } = {}): Measurement[] {
    const where = ['workspace_id = ?', 'user_id = ?']; const args: unknown[] = [s.workspaceId, s.userId];
    if (f.metricId) { where.push('metric_id = ?'); args.push(f.metricId); }
    if (f.status) { where.push('status = ?'); args.push(f.status); }
    return (this.db.prepare(`SELECT * FROM measurements WHERE ${where.join(' AND ')} ORDER BY at, created_at, id`).all(...args) as Array<Record<string, unknown>>).map((r) => this.rowToMeasurement(r));
  },

  getMeasurement(this: Repo, s: Scope, id: string): Measurement | undefined {
    const r = this.db.prepare('SELECT * FROM measurements WHERE id = ? AND workspace_id = ? AND user_id = ?').get(id, s.workspaceId, s.userId) as Record<string, unknown> | undefined;
    return r ? this.rowToMeasurement(r) : undefined;
  },

  /** One number; historical MCP measurements are read-only and can only enter through legacy data import. */
  addMeasurement(this: Repo, s: Scope, i: { id?: string; metricId: string; value: unknown; at?: string; note?: unknown; source?: Exclude<MeasurementSource, 'mcp'>; decisionId?: string; createdAt?: string }, meta?: ChangeMeta): Measurement {
    const metric = this.getMetric(s, i.metricId);
    if (!metric) throw new RepoError('not_found', 'عدد پیدا نشد.');
    if (metric.archived) throw new RepoError('invalid', 'این پایش بایگانی شده است.');
    if (typeof i.value !== 'number' || !Number.isFinite(i.value)) throw new RepoError('invalid', 'مقدار باید عدد باشد.');
    const source: MeasurementSource = i.source ?? 'manual';
    if ((source as string) === 'mcp') throw new RepoError('invalid', 'این نوع منشأ فقط برای خواندن داده‌های تاریخی پشتیبانی می‌شود.');
    const at = i.at ?? tehranDay();
    if (!isIsoDate(at)) throw new RepoError('invalid', 'تاریخ معتبر نیست.');
    const status: Measurement['status'] = 'Confirmed';
    const note = typeof i.note === 'string' && i.note.trim() ? i.note.trim().slice(0, 300) : undefined;
    const id = i.id ?? newId('msr'); const created = i.createdAt ?? now();
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO measurements (id, user_id, workspace_id, metric_id, value, at, note, source, status, decision_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id, s.userId, s.workspaceId, i.metricId, i.value, at, note ?? null, source, status, i.decisionId ?? null, created);
      this.recordChange(s, { objectId: `metric:${i.metricId}`, fromVersion: 1, toVersion: 1, kind: 'measurement_added', meta: { actor: 'user', ...meta }, after: { measurementId: id, value: i.value, at, source, ...(i.decisionId ? { decisionId: i.decisionId } : {}) }, at: created });
    })();
    return this.getMeasurement(s, id)!;
  },

  /** pasted CSV → numbers in one transaction; lines that cannot be read are returned, never guessed */
  addMeasurementsCsv(this: Repo, s: Scope, text: string, meta?: ChangeMeta): { added: Measurement[]; errors: ReturnType<typeof parseMeasurementCsv>['errors'] } {
    const parsed = parseMeasurementCsv(text, this.listMetrics(s), tehranDay());
    const added = this.db.transaction(() => parsed.rows.map((r) => this.addMeasurement(s, { metricId: r.metricId, value: r.value, at: r.at, note: r.note, source: 'csv' }, meta)))();
    return { added, errors: parsed.errors };
  },

  /** «تأیید عدد»: a Proposed number becomes the user's own */
  confirmMeasurement(this: Repo, s: Scope, id: string, meta?: ChangeMeta): Measurement {
    const m = this.getMeasurement(s, id);
    if (!m) throw new RepoError('not_found', 'عدد پیدا نشد.');
    if (m.status === 'Confirmed') return m;
    this.db.transaction(() => {
      this.db.prepare("UPDATE measurements SET status = 'Confirmed' WHERE id = ? AND workspace_id = ? AND user_id = ?").run(id, s.workspaceId, s.userId);
      this.recordChange(s, { objectId: `metric:${m.metricId}`, fromVersion: 1, toVersion: 1, kind: 'measurement_added', meta: { actor: 'user', ...meta }, after: { measurementId: id, value: m.value, at: m.at, source: m.source, confirmed: true } });
    })();
    return this.getMeasurement(s, id)!;
  },

  removeMeasurement(this: Repo, s: Scope, id: string, meta?: ChangeMeta) {
    const m = this.getMeasurement(s, id);
    if (!m) throw new RepoError('not_found', 'عدد پیدا نشد.');
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM measurements WHERE id = ? AND workspace_id = ? AND user_id = ?').run(id, s.workspaceId, s.userId);
      this.recordChange(s, { objectId: `metric:${m.metricId}`, fromVersion: 1, toVersion: 1, kind: 'measurement_removed', meta: { actor: 'user', ...meta }, before: { measurementId: id, value: m.value, at: m.at, status: m.status } });
    })();
  },
};
