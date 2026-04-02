import { ReviewResult, ReviewIssue, ReviewScore } from './types';

const SEVERITY_EMOJI: Record<string, string> = {
  Critical: '🔴',
  High: '🟠',
  Medium: '🟡',
  Low: '🔵',
};

const SCORE_EMOJI = (n: number) => (n >= 80 ? '✅' : n >= 60 ? '⚠️' : '❌');

export function renderMarkdown(result: ReviewResult, includePrompts: boolean): string {
  const lines: string[] = [];

  const criticalAndHigh = result.issues.filter(
    (i) => i.severity === 'Critical' || i.severity === 'High'
  );
  const topIssue = criticalAndHigh[0];

  // ── Hero: problem + code contrast + fix prompt ───────────────────────────
  if (topIssue) {
    const emoji = SEVERITY_EMOJI[topIssue.severity];

    lines.push(`## ${emoji} This code works — but can be exploited`);
    lines.push('');

    // Code contrast
    if (topIssue.codeSnippet && topIssue.codeSnippet !== '(see diff for details)') {
      lines.push('**🤖 AI wrote this:**');
      lines.push('```');
      lines.push(topIssue.codeSnippet);
      lines.push('```');
      lines.push('');
    }

    lines.push(`**🧠 VibeGuard noticed:** ${topIssue.riskImpact}`);
    lines.push('');

    // Fix prompt right after
    if (includePrompts && topIssue.fixPrompt) {
      lines.push('**🔥 Fix it now — copy and paste into Claude or Cursor:**');
      lines.push('');
      lines.push('```');
      lines.push(topIssue.fixPrompt);
      lines.push('```');
    }

  } else {
    lines.push('## ✅ This code looks good!');
    lines.push('');
    lines.push('> No critical or high severity issues found. Nice work! 🎉');
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  // ── Full Report (collapsed) ──────────────────────────────────────────────
  lines.push('<details>');
  lines.push('<summary>📊 <strong>Full Report — Goal, Scores & All Issues</strong></summary>');
  lines.push('');

  lines.push('### 🎯 Inferred Goal');
  lines.push(result.inferredGoal);
  lines.push('');

  lines.push('### 📊 Quality Score');
  lines.push('');
  lines.push(renderScoreTable(result.score));
  lines.push('');

  if (result.top3Risks.length > 0) {
    lines.push('### ⚡ Top Risks');
    for (const risk of result.top3Risks.slice(0, 3)) {
      lines.push(`- ${risk}`);
    }
    lines.push('');
  }

  if (result.issues.length > 0) {
    lines.push('### 🔍 All Issues');
    lines.push('');
    const order: Array<ReviewIssue['severity']> = ['Critical', 'High', 'Medium', 'Low'];
    for (const severity of order) {
      const group = result.issues.filter((i) => i.severity === severity);
      if (group.length === 0) continue;
      for (let idx = 0; idx < group.length; idx++) {
        lines.push(renderIssue(group[idx], idx + 1, includePrompts));
      }
    }
  }

  lines.push('</details>');
  lines.push('');

  // ── Footer ───────────────────────────────────────────────────────────────
  lines.push('---');
  lines.push('');
  lines.push('> 🤖 Educational review by [VibeGuard AI](https://github.com/y1485309801-sudo/vibeguard-ai) — all findings are suggestions, **you make the final call**.');

  return lines.join('\n');
}

function renderScoreTable(score: ReviewScore): string {
  return [
    '| Dimension | Score | Status |',
    '|-----------|-------|--------|',
    `| 🔒 Security | ${score.security}/100 | ${SCORE_EMOJI(score.security)} |`,
    `| 🔧 Maintainability | ${score.maintainability}/100 | ${SCORE_EMOJI(score.maintainability)} |`,
    `| ✓ Correctness | ${score.correctness}/100 | ${SCORE_EMOJI(score.correctness)} |`,
  ].join('\n');
}

function renderIssue(issue: ReviewIssue, num: number, includePrompts: boolean): string {
  const emoji = SEVERITY_EMOJI[issue.severity] ?? '⚪';
  const lines: string[] = [];

  lines.push(`#### ${emoji} ${issue.severity} Issue ${num}: ${issue.title}`);
  lines.push('');
  lines.push(`**📍 Location:** \`${issue.codeLocation}\``);
  lines.push('');
  lines.push(`**📝 What's happening:** ${issue.description}`);
  lines.push('');
  lines.push(`**💥 What could go wrong:** ${issue.riskImpact}`);
  lines.push('');
  lines.push(`**🎯 Impact on your goal:** ${issue.goalRelation}`);
  lines.push('');

  if (issue.codeSnippet && issue.codeSnippet !== '(see diff for details)') {
    lines.push('**🤖 AI wrote this → VibeGuard noticed:**');
    lines.push('```');
    lines.push(issue.codeSnippet);
    lines.push('```');
    lines.push('');
  }

  if (
    includePrompts &&
    issue.fixPrompt &&
    (issue.severity === 'Critical' || issue.severity === 'High' || issue.severity === 'Medium')
  ) {
    lines.push('<details>');
    lines.push('<summary>🔧 <strong>Fix Prompt for Claude/Cursor</strong></summary>');
    lines.push('');
    lines.push('```');
    lines.push(issue.fixPrompt);
    lines.push('```');
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}
