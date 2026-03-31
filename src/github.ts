import * as core from '@actions/core';
import * as github from '@actions/github';
import { PRContext } from './types';

/**
 * Collect all the information we need about the current PR.
 * Reads only contents + pull-requests (write for posting comments).
 */
export async function getPRContext(token: string, maxDiffLines: number): Promise<PRContext> {
  const octokit = github.getOctokit(token);
  const ctx = github.context;

  if (!ctx.payload.pull_request) {
    throw new Error('VibeGuard AI must be triggered on a pull_request event.');
  }

  const { owner, repo } = ctx.repo;
  const prNumber = ctx.payload.pull_request.number;
  const prTitle: string = ctx.payload.pull_request.title ?? '';
  const prBody: string = ctx.payload.pull_request.body ?? '';

  // Fetch commit messages for goal inference
  const commitsResp = await octokit.rest.pulls.listCommits({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 20,
  });
  const commitMessages = commitsResp.data.map((c) => c.commit.message.split('\n')[0]);

  // Fetch the diff (only changed lines)
  const diffResp = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: { format: 'diff' },
  });

  // @ts-expect-error octokit returns string for diff media type
  let diff: string = diffResp.data as string;

  // Chunk large diffs to stay within token limits
  const lines = diff.split('\n');
  if (lines.length > maxDiffLines) {
    core.warning(
      `Diff is ${lines.length} lines — truncating to first ${maxDiffLines} lines to stay within token limits.`
    );
    diff = lines.slice(0, maxDiffLines).join('\n') + '\n\n[...diff truncated for token safety...]';
  }

  return { owner, repo, prNumber, prTitle, prBody, commitMessages, diff };
}

/**
 * Post or update a PR comment with the review markdown.
 * Looks for an existing VibeGuard comment and updates it (avoids spam).
 */
export async function postReviewComment(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  body: string
): Promise<string> {
  const octokit = github.getOctokit(token);
  const MARKER = '<!-- vibeguard-ai-review -->';

  // Look for existing comment from this bot
  const comments = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const existing = comments.data.find((c) => c.body?.includes(MARKER));
  const fullBody = `${MARKER}\n${body}`;

  if (existing) {
    const updated = await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body: fullBody,
    });
    core.info(`Updated existing review comment: ${updated.data.html_url}`);
    return updated.data.html_url;
  } else {
    const created = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: fullBody,
    });
    core.info(`Created review comment: ${created.data.html_url}`);
    return created.data.html_url;
  }
}
