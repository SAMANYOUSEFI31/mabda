/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ContextType = 'Fact' | 'Decision' | 'Constraint' | 'Asset';
export type ContextStatus = 'Confirmed' | 'Proposed' | 'Needs Review' | 'Superseded' | 'Archived';
export type ContextProvenance = 'Onboarding' | 'User Input' | 'AI Suggested' | 'Asset Derived' | 'Imported';

export interface ContextObject {
  id: string;
  workspaceId: string;
  type: ContextType;
  status: ContextStatus;
  provenance: ContextProvenance;
  title: string;
  content: string;
  nodeId: string; // 'business' | 'brand' | 'product' | 'offer' | 'content'
  supersededById?: string;
  createdAt: string;
  updatedAt: string;
}

export type RelationshipType = 'belongs_to' | 'depends_on' | 'supersedes' | 'derived_from';

export interface ContextRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationshipType;
  createdAt: string;
}

export interface TreeNode {
  id: string;
  label: string;
  parentId?: string;
  description: string;
}

export interface WorkstreamSpec {
  id: string;
  title: string;
  target: string;
  description: string;
  requiredContext: Array<{
    key: string;
    label: string;
    description: string;
    nodeId: string;
    dependsOn?: string[];
  }>;
  suggestedContext: Array<{
    key: string;
    label: string;
    description: string;
    nodeId: string;
  }>;
  optionalContext: Array<{
    key: string;
    label: string;
    description: string;
    nodeId: string;
  }>;
  deliverables: Array<DeliverableSpec>;
}

export interface DeliverableSpec {
  id: string;
  title: string;
  type: 'Asset' | 'Deliverable';
  description: string;
  order: number;
  baseCreditCost: {
    fast: number;
    auto: number;
    critique: number;
    sensitive: number;
  };
  acceptanceCriteria: string[];
}

export interface GapItem {
  key: string;
  label: string;
  importance: 'required' | 'suggested' | 'optional';
  nodeId: string;
  status: 'missing' | 'ambiguous' | 'confirmed';
  question: string;
  suggestedAnswers: string[];
  dependsOn?: string[];
}

export interface ReadinessResult {
  score: number; // 0 to 100
  status: 'ready' | 'needs_work' | 'blocked';
  confirmedCount: number;
  totalRequired: number;
  gaps: GapItem[];
  summary: string;
}

export interface Contradiction {
  id: string;
  itemA: ContextObject;
  itemB: ContextObject;
  reason: string;
  suggestedResolution: string;
}

export type ExecutionMode = 'fast' | 'auto' | 'critique' | 'sensitive';

export interface GeneratedDeliverable {
  id: string;
  workspaceId: string;
  workstreamId: string;
  deliverableId: string;
  title: string;
  content: string;
  executionMode: ExecutionMode;
  creditCost: number;
  usedContextIds: string[]; // for Context Replay
  critiqueFeedback?: {
    score: number;
    strengths: string[];
    improvementsMade: string[];
    checklistPassed: string[];
  };
  rebuildCount: number;
  createdAt: string;
}

export interface ContextSuggestion {
  id: string;
  type: ContextType;
  nodeId: string;
  title: string;
  content: string;
  reason: string;
}

export type ChatMode = 'discovery' | 'audit' | 'advisor';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  executionMode: 'auto' | 'deep';
  creditCost: number;
  suggestions?: ContextSuggestion[];
  groundedNodeIds?: string[];
  groundedCount?: number;
  reasoningNotes?: string;
}

export interface ChatSession {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  chatMode: ChatMode;
  selectedNodeIds: string[]; // specific nodes selected for grounding, or empty for all
  messages: ChatMessage[];
}

export type PlanId = 'starter' | 'pro' | 'max';

export interface WorkspacePlan {
  id: PlanId;
  title: string;
  priceMonthlyUsd: number;
  priceMonthlyToman: number;
  creditsMonthly: number;
  workspaceLimit: number;
  dailyChatLimit: number;
  allowedModes: ExecutionMode[];
}

export interface LedgerEntry {
  id: string;
  timestamp: string;
  workspaceId: string;
  action: string;
  mode: ExecutionMode | 'chat_auto' | 'chat_deep';
  creditCost: number;
  inputTokens: number;
  outputTokens: number;
  estimatedAiCostUsd: number;
  status: 'completed' | 'refunded';
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string;
  planId: PlanId;
  creditsRemaining: number;
  todayChatCount: number;
  createdAt: string;
}
export * from './ai';
