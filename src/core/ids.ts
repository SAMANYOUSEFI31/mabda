/**
 * Ids made in the browser for rows whose id is a global primary key (a workspace, an output, a ledger line). A time stamp alone
 * is not unique across people: two testers saving in the same millisecond would get the same id (the server then refuses the
 * second, server/db/repo/shared.ts → claimId). So: the time, for order when read by a person, plus 64 random bits.
 */
export function clientId(prefix: string, now: number = Date.now()): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}_${now.toString(36)}${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}
