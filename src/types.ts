// ── Input config ────────────────────────────────────────────────────────────
export interface ActionConfig {
  githubToken: string;
  llmBaseUrl: string;
  llmApiKey: string;
  model: string;
  focus: 'safety' | 'maintainability' | 'all';
  includePrompts: boolean;
  maxTokens: number;
  maxDiffLines: number;
}

// ── GitHub context ───────────────────────────────────────────────────────────
export interface PRContext {
  owner: string;
  repo: string;
  prNumber: number;
  prTitle: string;
  prBody: string;
  commitMessages: string[];
  diff: string;
}

// ── LLM Review Result ────────────────────────────────────────────────────────
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
export type FocusArea = 'security' | 'maintainability' | 'correctness' | 'performance';

export interface ReviewIssue {
  severity: Severity;
  focus: FocusArea;
  title: string;
  description: string;
  riskImpact: string;
  goalRelation: string;
  codeLocation: string;
  codeSnippet: string;
  fixPrompt?: string;
}

export interface ReviewScore {
  security: number;
  maintainability: number;
  correctness: number;
}

export interface ReviewResult {
  inferredGoal: string;
  heroSummary?: string;        // ← new: one punchy sentence for the hero block
  score: ReviewScore;
  top3Risks: string[];
  issues: ReviewIssue[];
  rawJson?: string;
}

// ── Hardcoded pattern match ──────────────────────────────────────────────────
export interface PatternMatch {
  severity: Severity;
  focus: FocusArea;
  title: string;
  description: string;
  pattern: RegExp;
}
