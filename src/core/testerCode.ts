/**
 * A tester's pseudonymous code for session replays (docs/test-data.md §Clarity): the same person gets the same code on every
 * device and every visit, so their replays can be watched in order and matched with the server's record and an interview;
 * Clarity never receives the account id, the name or the invite link. Only the owner, who already knows who is who, sees the
 * code beside the name (in «افراد آزمون»).
 *
 * A non-cryptographic hash is enough here: account ids are random, so the code cannot be turned back into one, and it only
 * has to tell about ten people apart (a clash among ten in 2^32 is about one in 10^8).
 */
export function testerCode(accountId: string): string {
  let h = 0x811c9dc5;
  for (const ch of `mabda-tester:${accountId}`) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `t${h.toString(36).padStart(7, '0')}`;
}
