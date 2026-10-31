import type { BlockProposal, ContentBlock } from '../../src/types/ai.ts';
import { AiError } from './errors.ts';
import { BLOCK_KINDS, NODE_IDS, PROPOSAL_TYPES } from './schemas.ts';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validate + normalise one raw block. Returns null when it is unusable (empty markdown, wrong shape). */
export function normalizeBlock(raw: unknown, index: number, used: Set<string>): ContentBlock | null {
  if (!isObj(raw)) return null;
  const markdown = typeof raw.markdown === 'string' ? raw.markdown.trim() : '';
  if (!markdown) return null;
  const kind = (BLOCK_KINDS as readonly string[]).includes(raw.kind as string) ? (raw.kind as ContentBlock['kind']) : 'paragraph';
  let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `b${index + 1}`;
  while (used.has(id)) id = `${id}_${index + 1}`;
  used.add(id);
  const block: ContentBlock = { id, kind, markdown };
  const p = raw.proposal;
  if (isObj(p) && (PROPOSAL_TYPES as readonly string[]).includes(p.type as string) && typeof p.title === 'string' && typeof p.content === 'string' && p.title.trim() && p.content.trim()) {
    const proposal: BlockProposal = {
      type: p.type as BlockProposal['type'],
      title: p.title.trim(),
      content: p.content.trim(),
      nodeId: (NODE_IDS as readonly string[]).includes(p.nodeId as string) ? (p.nodeId as string) : 'business',
    };
    if (typeof p.reason === 'string' && p.reason.trim()) proposal.reason = p.reason.trim();
    block.proposal = proposal;
  }
  return block;
}

/** Parse the full structured answer. Throws bad_output when there is not a single usable block. */
export function parseBlocks(value: unknown): ContentBlock[] {
  const arr = isObj(value) && Array.isArray(value.blocks) ? value.blocks : null;
  if (!arr) throw new AiError('bad_output', { detail: 'missing blocks array' });
  const used = new Set<string>();
  const blocks = arr.map((b, i) => normalizeBlock(b, i, used)).filter((b): b is ContentBlock => b !== null);
  if (blocks.length === 0) throw new AiError('bad_output', { detail: 'no usable blocks' });
  return blocks;
}

export const blocksToMarkdown = (blocks: ContentBlock[]): string => blocks.map((b) => b.markdown.trim()).join('\n\n');

/**
 * Incremental extractor for `{"blocks":[ {...}, {...} ]}` streamed as JSON text.
 * push() returns the raw objects completed by the new chunk (strings/escapes are respected).
 */
export class BlockStreamParser {
  private buf = '';
  private pos = 0;
  private inArray = false;
  private depth = 0;
  private inString = false;
  private escape = false;
  private objStart = -1;
  private finished = false;

  push(chunk: string): unknown[] {
    this.buf += chunk;
    const out: unknown[] = [];
    if (this.finished) return out;
    if (!this.inArray) {
      const m = /"blocks"\s*:\s*\[/.exec(this.buf);
      if (!m) return out;
      this.inArray = true;
      this.pos = m.index + m[0].length;
    }
    for (; this.pos < this.buf.length; this.pos++) {
      const ch = this.buf[this.pos];
      if (this.inString) {
        if (this.escape) this.escape = false;
        else if (ch === '\\') this.escape = true;
        else if (ch === '"') this.inString = false;
        continue;
      }
      if (ch === '"') { this.inString = true; continue; }
      if (ch === '{') { if (this.depth === 0) this.objStart = this.pos; this.depth++; }
      else if (ch === '}') {
        this.depth--;
        if (this.depth === 0 && this.objStart >= 0) {
          try { out.push(JSON.parse(this.buf.slice(this.objStart, this.pos + 1))); } catch { /* malformed block: skipped, final parse decides */ }
          this.objStart = -1;
        }
      } else if (ch === ']' && this.depth === 0) { this.inArray = false; this.finished = true; break; }
    }
    return out;
  }
}
