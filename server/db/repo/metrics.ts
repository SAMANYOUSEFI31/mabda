/**
 * Metrics and measurements (not Context objects, never facts).
 * Part of the Repo (server/db/repo/index.ts): the methods are mixed into `Repo`, so `this` is the whole Repo and every
 * call and every transaction behaves exactly as when it was one class. See docs/architecture.md → «نقشهٔ پوشه‌ها».
 */
import type { Repo } from './index.ts';
import { ChangeMeta, RepoError, Scope, newId, now } from './shared.ts';
import { can } from '../../../src/core/entitlements.ts';
import { isIsoDate, parseMeasurementCsv } from '../../../src/core/metrics.ts';
import type { Measurement, MeasurementSource, Metric, MetricDirection } from '../../../src/types/index.ts';

export const metricsMethods = {
  //    a legacy externally-suggested number is `Proposed` and invisible to charts, counts and packs until the user confirms it ──
  rowToMetric(this: Repo, r: Record<string, unknown>): Metric {
    return { id: r.id as string, workspaceId: r.workspace_id as string, name: r.name as string, unit: (r.unit as string) ?? '', direction: r.direction as MetricDirection, ...(r.target !== null && r.target !== undefined ? { target: r.target as number } : {}), ...(r.archived ? { archived: true } : {}), createdAt: r.created_at as string, updatedAt: r.updated_at as string };
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

  cleanMetricFields(this: Repo, i: { name?: unknown; unit?: unknown; direction?: unknown; target?: unknown }, cur?: Metric) {
    const name = i.name === undefined ? cur?.name : typeof i.name === 'string' ? i.name.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
    if (!name) throw new RepoError('invalid', 'نام شاخص لازم است.');
    const direction = i.direction === undefined ? cur?.direction : i.direction;
    if (direction !== 'up' && direction !== 'down') throw new RepoError('invalid', 'مشخص کن بالاتر بهتر است یا پایین‌تر.');
    const unit = i.unit === undefined ? cur?.unit ?? '' : typeof i.unit === 'string' ? i.unit.trim().slice(0, 20) : '';
    const target = i.target === undefined ? cur?.target : i.target === null || i.target === '' ? undefined : typeof i.target === 'number' && Number.isFinite(i.target) ? i.target : (() => { throw new RepoError('invalid', 'هدف باید عدد باشد.'); })();
    return { name, unit, direction: direction as MetricDirection, target };
  },

  createMetric(this: Repo, s: Scope, i: { id?: string; name?: unknown; unit?: unknown; direction?: unknown; target?: unknown; at?: string }, meta?: ChangeMeta): Metric {
    this.assertWorkspace(s);
    const f = this.cleanMetricFields(i);
    if (this.listMetrics(s).some((m) => !m.archived && m.name.toLowerCase() === f.name.toLowerCase())) throw new RepoError('invalid', 'شاخصی با این نام هست.');
    const id = i.id ?? newId('met'); const t = i.at ?? now();
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO metrics (id, user_id, workspace_id, name, unit, direction, target, archived, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, s.userId, s.workspaceId, f.name, f.unit, f.direction, f.target ?? null, null, t, t);
      this.recordChange(s, { objectId: `metric:${id}`, fromVersion: 0, toVersion: 1, kind: 'metric_created', meta: { actor: 'user', ...meta }, after: { name: f.name, unit: f.unit, direction: f.direction, ...(f.target !== undefined ? { target: f.target } : {}) }, at: t });
    })();
    return this.getMetric(s, id)!;
  },

  updateMetric(this: Repo, s: Scope, id: string, patch: { name?: unknown; unit?: unknown; direction?: unknown; target?: unknown }, meta?: ChangeMeta): Metric {
    const cur = this.getMetric(s, id);
    if (!cur) throw new RepoError('not_found', 'شاخص پیدا نشد.');
    const f = this.cleanMetricFields(patch, cur);
    const before: Record<string, unknown> = {}; const after: Record<string, unknown> = {};
    for (const k of ['name', 'unit', 'direction', 'target'] as const) if ((cur[k] ?? null) !== (f[k] ?? null)) { before[k] = cur[k] ?? null; after[k] = f[k] ?? null; }
    if (!Object.keys(after).length) return cur;
    const diff = { before, after };
    this.db.transaction(() => {
      this.db.prepare('UPDATE metrics SET name=?, unit=?, direction=?, target=?, updated_at=? WHERE id=? AND workspace_id=? AND user_id=?').run(f.name, f.unit, f.direction, f.target ?? null, now(), id, s.workspaceId, s.userId);
      this.recordChange(s, { objectId: `metric:${id}`, fromVersion: 1, toVersion: 1, kind: 'metric_edited', meta: { actor: 'user', ...meta }, before: diff.before, after: diff.after });
    })();
    return this.getMetric(s, id)!;
  },

  /** archived, never deleted: its numbers and the decisions that pointed at it stay readable */
  archiveMetric(this: Repo, s: Scope, id: string, meta?: ChangeMeta): Metric {
    const cur = this.getMetric(s, id);
    if (!cur) throw new RepoError('not_found', 'شاخص پیدا نشد.');
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
    if (!metric) throw new RepoError('not_found', 'شاخص پیدا نشد.');
    if (metric.archived) throw new RepoError('invalid', 'این شاخص بایگانی شده است.');
    if (typeof i.value !== 'number' || !Number.isFinite(i.value)) throw new RepoError('invalid', 'مقدار باید عدد باشد.');
    const source: MeasurementSource = i.source ?? 'manual';
    if ((source as string) === 'mcp') throw new RepoError('invalid', 'این نوع منشأ فقط برای خواندن داده‌های تاریخی پشتیبانی می‌شود.');
    const at = i.at ?? now().slice(0, 10);
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
    const parsed = parseMeasurementCsv(text, this.listMetrics(s), now().slice(0, 10));
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
