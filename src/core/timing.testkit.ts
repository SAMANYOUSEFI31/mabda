/**
 * Wall-clock budgets in tests. One run measures the machine as much as the code: the whole suite runs in
 * parallel, and a busy moment (GC, another test file, the disk) can push a single run past its budget.
 * So a budget is checked against the best of up to three runs; a real blow-up (an N² cost) is slow every
 * time and still fails, a passing run stops early.
 */
export const timed = <T>(run: () => T, budgetMs: number, tries = 3): { ms: number; value: T } => {
  let best = Infinity;
  let value!: T;
  for (let i = 0; i < tries && best >= budgetMs; i++) {
    const t0 = performance.now();
    const v = run();
    const ms = performance.now() - t0;
    if (ms < best) { best = ms; value = v; }
  }
  return { ms: Math.round(best), value };
};
