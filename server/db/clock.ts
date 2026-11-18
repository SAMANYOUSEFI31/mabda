/**
 * The «current moment» of the data layer. Normally it is the real clock. The sample builder (server/db/lifeSample) runs every
 * step of a made-up long use through the product's own routes, each inside `runAt(moment, …)`, so versions, history and
 * timestamps carry the moment of that step. Nothing outside such a scope ever sees a moment other than the real one
 * (AsyncLocalStorage: a request in flight elsewhere is not touched).
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const scope = new AsyncLocalStorage<Date>();

export const runAt = <T>(at: Date, fn: () => T): T => scope.run(at, fn);
export const currentDate = (): Date => scope.getStore() ?? new Date();
export const nowIso = (): string => currentDate().toISOString();
