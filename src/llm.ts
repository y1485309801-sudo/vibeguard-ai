import * as core from '@actions/core';
import OpenAI from 'openai';
import { ActionConfig, ReviewResult, ReviewIssue, PatternMatch } from './types';

// ── Hardcoded pattern-based pre-checks (lowers hallucination rate) ───────────
const HARDCODED_PATTERNS: PatternMatch[] = [
  {
    severity: 'Critical',
    focus: 'security',
    title: 'Hardcoded Secret or API Key',
    description: 'A secret, password, or API key appears to be hardcoded directly in the source code.',
    pattern: /(?:api[_-]?key|secret|password|token|passwd|auth)\s*[:=]\s*["'][A-Za-z0-9_\-\.]{8,}/gi,
  },
  {
    severity: 'Critical',
    focus: 'security',
    title: 'SQL String Concatenation (Possible Injection)',
    description: 'SQL query appears to be built by concatenating user input, which can allow attackers to manipulate the database.',
    pattern: /(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE).*?\+.*?(?:req\.|request\.|params\.|body\.|query\.)/gi,
  },
  {
    severity: 'High',
    focus: 'security',
    title: 'innerHTML Assignment (XSS Risk)',
    description: 'Assigning to innerHTML with dynamic content can allow attackers to inject malicious scripts.',
    pattern: /\.innerHTML\s*=\s*(?!["'`]<)/g,
  },
  {
    severity: 'High',
    focus: 'security',
    title: 'eval() Usage',
    description: 'Using eval() executes arbitrary code and is a serious security risk.',
    pattern: /\beval\s*\(/g,
  },
  {
    severity: 'High',
    focus: 'security',
    title: 'Missing Authorization Check',
    description: 'A route or endpoint appears to lack authentication or authorization checks.',
    pattern: /(?:app\.|router\.)(?:get|post|put|patch|delete)\s*\(["'`][^"'`]+["'`]\s*,\s*(?:async\s*)?\([^)]*\)\s*=>/g,
  },
];

/**
 * Run pattern-based checks on the diff independently from LLM.
 * These are merged with LLM results to reduce hallucinations.
 */
function runPatternChecks(diff: string): Partial<ReviewIssue>[] {
  const findings: Partial<ReviewIssue>[] = [];

  for (const pattern of HARDCODED_PATTERNS) {
    const addedLines = diff
      .split('\n')
      .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
      .join('\n');

    if (pattern.pattern.test(addedLines)) {
      findings.push({
        severity: pattern.severity,
        focus: pattern.focus,
        title: `[Pattern] ${pattern.title}`,
        description: pattern.description,
        riskImpact: 'Detected by static pattern matching — verify with LLM analysis.',
        goalRelation: 'Could undermine the security goals of this change.',
        codeLocation: 'See diff',
        codeSnippet: '(see diff for details)',
      });
    }

    // Reset regex lastIndex for global patterns
    pattern.pattern.lastIndex = 0;
  }

  return findings;
}

/**
 * Call the LLM and parse the structured JSON response.
 */
export async function callLLM(
  config: ActionConfig,
  systemPrompt: string,
  userMessage: string,
  diff: string
): Promise<ReviewResult> {
  const client = new OpenAI({
    baseURL: config.llmBaseUrl,
    apiKey: config.llmApiKey || 'ollama',
    timeout: 90_000, // 90s timeout for local models
  });

  core.info(`Calling LLM at ${config.llmBaseUrl} with model: ${config.model}`);

  let rawResponse = '';

  try {
    const response = await client.chat.completions.create({
      model: config.model,
      max_tokens: config.maxTokens,
      temperature: 0.1, // Low temperature for consistent structured output
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });

    rawResponse = response.choices[0]?.message?.content ?? '';
    core.debug(`Raw LLM response: ${rawResponse.substring(0, 500)}...`);

  } catch (err) {
    core.warning(`LLM call failed: ${err}. Falling back to pattern-only analysis.`);
    return buildFallbackResult(diff);
  }

  // Parse JSON — strip markdown fences if the model added them
  const parsed = parseJSON(rawResponse);

  if (!parsed) {
    core.warning('LLM returned non-JSON response. Falling back to pattern-only analysis.');
    return buildFallbackResult(diff);
  }

  // Merge in pattern-based findings that LLM might have missed
  const patternIssues = runPatternChecks(diff);
  const llmIssuesTitles = new Set((parsed.issues ?? []).map((i: ReviewIssue) => i.title));

  for (const p of patternIssues) {
    if (!llmIssuesTitles.has(p.title ?? '')) {
      parsed.issues = [p, ...(parsed.issues ?? [])];
    }
  }

  return {
    inferredGoal: parsed.inferredGoal ?? 'Unable to infer goal',
    score: {
      security: clamp(parsed.score?.security ?? 50),
      maintainability: clamp(parsed.score?.maintainability ?? 50),
      correctness: clamp(parsed.score?.correctness ?? 50),
    },
    top3Risks: parsed.top3Risks ?? [],
    issues: parsed.issues ?? [],
    rawJson: rawResponse,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJSON(text: string): any | null {
  // Remove markdown code fences if present
  const cleaned = text
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();

  // Find the first { ... } block
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;

  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function buildFallbackResult(diff: string): ReviewResult {
  const patternIssues = runPatternChecks(diff);
  return {
    inferredGoal: 'Could not be determined (LLM unavailable)',
    score: { security: 0, maintainability: 0, correctness: 0 },
    top3Risks: ['LLM analysis unavailable — pattern scan results shown below'],
    issues: patternIssues as ReviewIssue[],
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
