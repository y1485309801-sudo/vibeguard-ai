import * as core from '@actions/core';
import * as github from '@actions/github';
import { PRContext } from './types';

export async function getPRContext(token: string, maxDiffLines: number): Promise<PRContext> {
  const octokit = github.getOctokit(token);
  const ctx = github.context;

  let owner: string;
  let repo: string;
  let prNumber: number;
  let prTitle: string;
  let prBody: string;
  let commitMessages: string[];
  let diff: string;

  owner = ctx.repo.owner;
  repo = ctx.repo.repo;

  // ── Pull Request event ───────────────────────────────────────────────────
  if (ctx.payload.pull_request) {
    prNumber = ctx.payload.pull_request.number;
    prTitle = ctx.payload.pull_request.title ?? '';
    prBody = ctx.payload.pull_request.body ?? '';

    const commitsResp = await octokit.rest.pulls.listCommits({
      owner, repo,
      pull_number: prNumber,
      per_page: 20,
    });
    commitMessages = commitsResp.data.map((c) => c.commit.message.split('\n')[0]);

    const diffResp = await octokit.rest.pulls.get({
      owner, repo,
      pull_number: prNumber,
      mediaType: { format: 'diff' },
    });
    // @ts-expect-error octokit returns string for diff media type
    diff = diffResp.data as string;

  // ── Push event ───────────────────────────────────────────────────────────
  } else if (ctx.payload.commits) {
    prNumber = 0;
    prTitle = ctx.payload.head_commit?.message ?? 'Push event';
    prBody = '';

    commitMessages = (ctx.payload.commits as Array<{ message: string }>)
      .map((c) => c.message.split('\n')[0]);

    // Build a diff from the push by comparing head to its parent
    const headSha = ctx.sha;
    const compareResp = await octokit.rest.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${headSha}^...${headSha}`,
    });

    // Build a simple diff from the file list
    const files = compareResp.data.files ?? [];
    diff = files
      .map((f) => {
        const header = `diff --git a/${f.filename} b/${f.filename}\n--- a/${f.filename}\n+++ b/${f.filename}`;
        return `${header}\n${f.patch ?? '(binary or no patch)'}`;
      })
      .join('\n\n');

  } else {
    throw new Error('VibeGuard AI must be triggered on a pull_request or push event.');
  }

  // Chunk large diffs
  const lines = diff.split('\n');
  if (lines.length > maxDiffLines) {
    core.warning(
      `Diff is ${lines.length} lines — truncating to first ${maxDiffLines} lines.`
    );
    diff = lines.slice(0, maxDiffLines).join('\n') + '\n\n[...diff truncated...]';
  }

  return { owner, repo, prNumber, prTitle, prBody, commitMessages, diff };
}

export async function postReviewComment(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  body: string
): Promise<string> {
  const octokit = github.getOctokit(token);
  const ctx = github.context;
  const MARKER = '<!-- vibeguard-ai-review -->';
  const fullBody = `${MARKER}\n${body}`;

  // For push events (no PR), post as a commit comment
  if (prNumber === 0) {
    const commitSha = ctx.sha;
    const created = await octokit.rest.repos.createCommitComment({
      owner,
      repo,
      commit_sha: commitSha,
      body: fullBody,
    });
    core.info(`Created commit comment: ${created.data.html_url}`);
    return created.data.html_url;
  }

  // For PR events, update or create PR comment
  const comments = await octokit.rest.issues.listComments({
    owner, repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const existing = comments.data.find((c) => c.body?.includes(MARKER));

  if (existing) {
    const updated = await octokit.rest.issues.updateComment({
      owner, repo,
      comment_id: existing.id,
      body: fullBody,
    });
    core.info(`Updated existing review comment: ${updated.data.html_url}`);
    return updated.data.html_url;
  } else {
    const created = await octokit.rest.issues.createComment({
      owner, repo,
      issue_number: prNumber,
      body: fullBody,
    });
    core.info(`Created review comment: ${created.data.html_url}`);
    return created.data.html_url;
  }
}
