/**
 * Rough token size of a text. Persian ≈ 2.2 chars/token. Used for routing, chunk sizes and the file quota —
 * never for billing: the ledger only stores the provider's real usage metadata.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2.2);
}
