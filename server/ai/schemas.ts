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
              nodeId: { type: 'string', enum: [...NODE_IDS] },
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

export const VALIDATION_SCHEMA = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    score: { type: 'number' },
    passedCriteria: { type: 'array', items: { type: 'string' } },
    failedCriteria: { type: 'array', items: { type: 'string' } },
    guardrailViolations: { type: 'array', items: { type: 'string' } },
    strengths: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['passed', 'score', 'passedCriteria', 'failedCriteria', 'guardrailViolations', 'strengths'],
} as const;

export const CRITIQUE_SCHEMA = {
  type: 'object',
  properties: {
    issues: { type: 'array', items: { type: 'string' } },
    strengths: { type: 'array', items: { type: 'string' } },
  },
  required: ['issues', 'strengths'],
} as const;

export function decisionSchema(ids: string[], optionsById: Record<string, string[]>) {
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
          },
          required: ['id', 'choice', 'probability'],
        },
      },
    },
    required: ['answers'],
  };
}
