import type Database from 'better-sqlite3';
import { workspacesMethods } from './workspaces.ts';
import { nodesMethods } from './nodes.ts';
import { objectsMethods } from './objects.ts';
import { changesMethods } from './changes.ts';
import { canvasMethods } from './canvas.ts';
import { relationsMethods } from './relations.ts';
import { thoughtsMethods } from './thoughts.ts';
import { notesMethods } from './notes.ts';
import { deliverablesMethods } from './deliverables.ts';
import { ledgerMethods } from './ledger.ts';
import { sessionsMethods } from './sessions.ts';
import { specsMethods } from './specs.ts';
import { filesMethods } from './files.ts';
import { judgmentsMethods } from './judgments.ts';
import { packsMethods } from './packs.ts';
import { templatesMethods } from './templates.ts';
import { metricsMethods } from './metrics.ts';
import { usageMethods } from './usage.ts';
import { stateMethods } from './state.ts';

export * from './shared.ts';

/**
 * The one entrance to the data. The domains live in their own files (one per concern, see docs/architecture.md → نقشهٔ پوشه‌ها) and are
 * mixed into this class, so `repo.createObject(...)`, `repo.transaction(...)` and every cross-domain call are unchanged.
 */
export class Repo {
  constructor(readonly db: Database.Database) {}

  /** run several writes as one unit (all or none) */
  transaction<T>(fn: () => T): T { return this.db.transaction(fn)(); }
}

type Methods = typeof workspacesMethods &
  typeof nodesMethods &
  typeof objectsMethods &
  typeof changesMethods &
  typeof canvasMethods &
  typeof relationsMethods &
  typeof thoughtsMethods &
  typeof notesMethods &
  typeof deliverablesMethods &
  typeof ledgerMethods &
  typeof sessionsMethods &
  typeof specsMethods &
  typeof filesMethods &
  typeof judgmentsMethods &
  typeof packsMethods &
  typeof templatesMethods &
  typeof metricsMethods &
  typeof usageMethods &
  typeof stateMethods;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Repo extends Methods {}

Object.assign(Repo.prototype, workspacesMethods, nodesMethods, objectsMethods, changesMethods, canvasMethods, relationsMethods, thoughtsMethods, notesMethods, deliverablesMethods, ledgerMethods, sessionsMethods, specsMethods, filesMethods, judgmentsMethods, packsMethods, templatesMethods, metricsMethods, usageMethods, stateMethods);
