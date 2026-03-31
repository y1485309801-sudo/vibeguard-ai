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
  description: string;          // Plain language, non-technical
  riskImpact: string;           // Business / security impact
  goalRelation: string;         // How this affects the user's inferred goal
  codeLocation: string;         // e.g. "auth.py:45-52"
  codeSnippet: string;          // Problematic snippet
  fixPrompt?: string;           // Copy-paste prompt to fix with Claude/Cursor
}

export interface ReviewScore {
  security: number;             // 0-100
  maintainability: number;      // 0-100
  correctness: number;          // 0-100
}

export interface ReviewResult {
  inferredGoal: string;
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
