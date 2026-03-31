import * as core from '@actions/core';
import { ActionConfig } from './types';
import { getPRContext, postReviewComment } from './github';
import { callLLM } from './llm';
import { buildSystemPrompt, buildUserMessage } from './prompt';
import { renderMarkdown } from './markdown';

async function run(): Promise<void> {
  try {
    // ── 1. Load configuration from action inputs ───────────────────────────
    const config: ActionConfig = {
      githubToken: core.getInput('github_token', { required: true }),
      llmBaseUrl: core.getInput('llm_base_url') || 'http://localhost:11434/v1',
      llmApiKey: core.getInput('llm_api_key') || 'ollama',
      model: core.getInput('model') || 'llama3.2',
      focus: (core.getInput('focus') || 'all') as ActionConfig['focus'],
      includePrompts: core.getInput('include_prompts') !== 'false',
      maxTokens: parseInt(core.getInput('max_tokens') || '4096', 10),
      maxDiffLines: parseInt(core.getInput('max_diff_lines') || '500', 10),
    };

    core.info('🛡️ VibeGuard AI starting...');
    core.info(`Model: ${config.model} | Focus: ${config.focus} | Include prompts: ${config.includePrompts}`);

    // ── 2. Fetch PR context from GitHub ────────────────────────────────────
    core.info('📥 Fetching PR context and diff...');
    const prContext = await getPRContext(config.githubToken, config.maxDiffLines);

    core.info(`PR #${prContext.prNumber}: "${prContext.prTitle}"`);
    core.info(`Diff size: ${prContext.diff.split('\n').length} lines`);

    // ── 3. Build prompts ───────────────────────────────────────────────────
    const systemPrompt = buildSystemPrompt(config);
    const userMessage = buildUserMessage(prContext);

    // ── 4. Call LLM ────────────────────────────────────────────────────────
    core.info('🤖 Calling LLM for code reflection...');
    const startTime = Date.now();
    const reviewResult = await callLLM(config, systemPrompt, userMessage, prContext.diff);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    core.info(`✅ Review completed in ${elapsed}s`);
    core.info(`Inferred goal: ${reviewResult.inferredGoal}`);
    core.info(`Issues found: ${reviewResult.issues.length}`);
    core.info(
      `Scores — Security: ${reviewResult.score.security}, ` +
      `Maintainability: ${reviewResult.score.maintainability}, ` +
      `Correctness: ${reviewResult.score.correctness}`
    );

    // ── 5. Render Markdown ─────────────────────────────────────────────────
    const markdown = renderMarkdown(reviewResult, config.includePrompts);

    // ── 6. Post PR comment ─────────────────────────────────────────────────
    core.info('💬 Posting review comment to PR...');
    const commentUrl = await postReviewComment(
      config.githubToken,
      prContext.owner,
      prContext.repo,
      prContext.prNumber,
      markdown
    );

    core.setOutput('comment_url', commentUrl);
    core.info(`🎉 VibeGuard AI review posted: ${commentUrl}`);

  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`VibeGuard AI failed: ${error.message}`);
      core.debug(error.stack ?? '');
    } else {
      core.setFailed('VibeGuard AI failed with an unknown error');
    }
  }
}

run();
