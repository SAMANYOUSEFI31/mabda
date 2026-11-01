/** JSON schemas (standard JSON Schema) for structured model output. */

export const BLOCK_KINDS = ['heading', 'paragraph', 'list', 'table', 'fact', 'decision', 'constraint', 'question'] as const;
export const NODE_IDS = ['business', 'brand', 'product', 'offer', 'content'] as const;
export const PROPOSAL_TYPES = ['Fact', 'Decision', 'Constraint'] as const;

export const BLOCKS_SCHEMA = {
  type: 'object',
  properties: {
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          kind: { type: 'string', enum: [...BLOCK_KINDS] },
          markdown: { type: 'string' },
          proposal: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: [...PROPOSAL_TYPES] },
              title: { type: 'string' },
              content: { type: 'string' },
              nodeId: { type: 'string' },
              reason: { type: 'string' },
            },
            required: ['type', 'title', 'content', 'nodeId'],
          },
        },
        required: ['id', 'kind', 'markdown'],
      },
    },
  },
  required: ['blocks'],
} as const;

export const CRITIQUE_SCHEMA = {
  type: 'object',
  properties: {
    issues: { type: 'array', items: { type: 'string' } },
    strengths: { type: 'array', items: { type: 'string' } },
  },
  required: ['issues', 'strengths'],
} as const;

export function decisionSchema(ids: string[], optionsById: Record<string, string[]>, withReason = false) {
  return {
    type: 'object',
    properties: {
      answers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', enum: ids },
            choice: { type: 'string', enum: [...new Set(Object.values(optionsById).flat())] },
            probability: { type: 'number' },
            ...(withReason ? { reason: { type: 'string' } } : {}),
          },
          required: withReason ? ['id', 'choice', 'probability', 'reason'] : ['id', 'choice', 'probability'],
        },
      },
    },
    required: ['answers'],
  };
}

export const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    objects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: [...PROPOSAL_TYPES] },
          title: { type: 'string' },
          content: { type: 'string' },
          nodeId: { type: 'string' },
          quote: { type: 'string' },
        },
        required: ['type', 'title', 'content'],
      },
    },
  },
  required: ['objects'],
} as const;

export const COACH_SCHEMA = {
  type: 'object',
  properties: {
    questions: { type: 'array', items: { type: 'string' } },
    ambiguities: { type: 'array', items: { type: 'object', properties: { quote: { type: 'string' }, why: { type: 'string' } }, required: ['quote', 'why'] } },
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        properties: { type: { type: 'string', enum: [...PROPOSAL_TYPES] }, title: { type: 'string' }, content: { type: 'string' }, nodeId: { type: 'string' } },
        required: ['type', 'title', 'content'],
      },
    },
  },
  required: ['questions', 'ambiguities', 'proposals'],
} as const;

export const PARSE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['decision', 'fact', 'constraint', 'asset', 'question', 'paragraph'] },
          title: { type: 'string' },
          markdown: { type: 'string' },
        },
        required: ['kind', 'title', 'markdown'],
      },
    },
  },
  required: ['items'],
} as const;
