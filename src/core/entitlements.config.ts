/**
 * THE ONE PLACE for what each plan includes and costs. Every number is an ASSUMPTION [فرض] until the Alpha
 * calibrates it (PRD: «وزن اعتبار، پلن‌ها و سقف‌ها: پایان Alpha»). Change values here only — code, UI and tests read them.
 *
 * Model (decisions v3.1): the subscription pays for STRUCTURE and ENGINES (tree, versions, impact, files, Gap/Coach
 * judgements on OUR cheap key). Generating outputs runs on the user's own key (BYOK); managed AI + credits is a
 * separate feature-flagged layer (MABDA_MANAGED_AI) and lives in creditEngine.ts.
 * Prices are USD (the PRD's economic basis); local-currency prices come from the payment gateway, never from code.
 */
export interface PlanEntitlements {
  /** list price per month, USD */
  priceMonthlyUsd: number;
  /** workspaces (PRD P5: never «unlimited») */
  workspaces: number;
  /** active Context objects (Archived/Superseded do not count). Generous: PRD P6 says saving Context is free — this is an abuse guard */
  maxObjects: number;
  /** monthly free file-processing quota, tokens of extracted text */
  fileTokensPerMonth: number;
  engines: {
    /** stale assets + «این تغییر روی N دارایی اثر دارد» */
    changeImpact: boolean;
    /** AI-judged contradictions between Context objects (rule-based contradiction check is in every plan) */
    semanticContradiction: boolean;
  };
  /** MCP server access to the workspace's Context */
  mcp: boolean;
  /** exportable «Context pack» */
  contextPack: boolean;
  /** bring-your-own key */
  byok: boolean;
  /** decision-layer judgements per day that WE pay for (Gap ambiguity, …) */
  decisionJudgmentsPerDay: number;
  /** Context Coach sessions per day that WE pay for */
  coachPerDay: number;
  /** create / edit custom workstream specs */
  customSpecs: boolean;
}

export type PlanKey = 'starter' | 'pro' | 'max';

export const ENTITLEMENTS_CONFIG: {
  /** warn in the manager ledger when our real cost exceeds this share of the plan price (PRD target is ≈17–18%) */
  costWarnRatio: number;
  plans: Record<PlanKey, PlanEntitlements>;
} = {
  costWarnRatio: 0.2,
  plans: {
    starter: {
      priceMonthlyUsd: 9, workspaces: 1, maxObjects: 400, fileTokensPerMonth: 150_000,
      engines: { changeImpact: true, semanticContradiction: false }, mcp: false, contextPack: true, byok: true,
      decisionJudgmentsPerDay: 40, coachPerDay: 5, customSpecs: false,
    },
    pro: {
      priceMonthlyUsd: 24, workspaces: 3, maxObjects: 2_000, fileTokensPerMonth: 500_000,
      engines: { changeImpact: true, semanticContradiction: true }, mcp: true, contextPack: true, byok: true,
      decisionJudgmentsPerDay: 150, coachPerDay: 15, customSpecs: true,
    },
    max: {
      priceMonthlyUsd: 49, workspaces: 10, maxObjects: 8_000, fileTokensPerMonth: 1_500_000,
      engines: { changeImpact: true, semanticContradiction: true }, mcp: true, contextPack: true, byok: true,
      decisionJudgmentsPerDay: 400, coachPerDay: 40, customSpecs: true,
    },
  },
};
