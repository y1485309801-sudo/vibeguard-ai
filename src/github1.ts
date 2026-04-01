import * as core from '@actions/core';
import * as github from '@actions/github';
import { PRContext } from './types';

const MAX_FILE_SIZE = 100 * 1024;
const MAX_FILES = 10;

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
  let headSha: string;

  owner = ctx.repo.owner;
  repo = ctx.repo.repo;

  // ── Pull Request event ───────────────────────────────────────────────────
  if (ctx.payload.pull_request) {
    prNumber = ctx.payload.pull_request.number;
    prTitle = ctx.payload.pull_request.title ?? '';
    prBody = ctx.payload.pull_request.body ?? '';
    headSha = ctx.payload.pull_request.head.sha;

    const commitsResp = await octokit.rest.pulls.listCommits({
      owner, repo,
      pull_number: prNumber,
      per_page: 20,
    });
    commitMessages = commitsResp.data.map((c) => c.commit.message.split('\n')[0]);

    const filesResp = await octokit.rest.pulls.listFiles({
      owner, repo,
      pull_number: prNumber,
      per_page: 100,
    });

    diff = await buildDiffFromFiles(octokit, owner, repo, filesResp.data, maxDiffLines, headSha);

  // ── Push event ───────────────────────────────────────────────────────────
  } else if (ctx.payload.commits) {
    prNumber = 0;
    prTitle = ctx.payload.head_commit?.message ?? 'Push event';
    prBody = '';
    headSha = ctx.sha;

    commitMessages = (ctx.payload.commits as Array<{ message: string }>)
      .map((c) => c.message.split('\n')[0]);

    const compareResp = await octokit.rest.repos.compareCommitsWithBasehead({
      owner, repo,
      basehead: `${headSha}^...${headSha}`,
    });

    diff = await buildDiffFromFiles(octokit, owner, repo, compareResp.data.files ?? [], maxDiffLines, headSha);

  } else {
    throw new Error('VibeGuard AI must be triggered on a pull_request or push event.');
  }

  return { owner, repo, prNumber, prTitle, prBody, commitMessages, diff };
}

async function buildDiffFromFiles(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  octokit: any,
  owner: string,
  repo: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  files: any[],
  maxDiffLines: number,
  headSha: string  // ← use the commit sha, not the blob sha
): Promise<string> {
  const parts: string[] = [];
  let totalLines = 0;
  let fileCount = 0;

  const relevantFiles = files.filter(
    (f) => f.status !== 'removed' && !isBinary(f.filename)
  );

  for (const file of relevantFiles) {
    if (fileCount >= MAX_FILES) {
      parts.push(`\n[...${files.length - fileCount} more files not shown — limit reached...]`);
      break;
    }

    const header = `diff --git a/${file.filename} b/${file.filename}\n--- a/${file.filename}\n+++ b/${file.filename}`;

    if (file.patch && file.patch.length < MAX_FILE_SIZE) {
      // Normal case: patch available and not too large
      const fileLines = file.patch.split('\n');
      totalLines += fileLines.length;
      parts.push(`${header}\n${file.patch}`);
      fileCount++;

    } else if (!file.patch) {
      // File too large for GitHub diff API — fetch content using commit sha (not blob sha!)
      core.info(`File ${file.filename} has no patch (too large) — fetching via commit ref ${headSha.slice(0,7)}...`);
      try {
        const contentResp = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: file.filename,
          ref: headSha,  // ← correct: use commit sha
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = contentResp.data as any;
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        const lines = content.split('\n');

        const truncated = lines.length > maxDiffLines
          ? lines.slice(0, maxDiffLines).join('\n') + `\n\n[...file truncated at ${maxDiffLines} lines...]`
          : content;

        const addedLines = truncated.split('\n').map((l: string) => `+${l}`).join('\n');
        totalLines += truncated.split('\n').length;
        parts.push(`${header}\n@@ -0,0 +1,${lines.length} @@\n${addedLines}`);
        fileCount++;
        core.info(`✅ Fetched ${lines.length} lines from ${file.filename}`);

      } catch (err) {
        core.warning(`Could not fetch content for ${file.filename}: ${err}`);
        parts.push(`${header}\n[Content could not be retrieved: ${err}]`);
        fileCount++;
      }

    } else {
      // Patch exists but very large — truncate it
      core.warning(`File ${file.filename} patch is very large — truncating.`);
      const truncatedPatch = file.patch.split('\n').slice(0, maxDiffLines).join('\n');
      parts.push(`${header}\n${truncatedPatch}\n[...truncated...]`);
      totalLines += maxDiffLines;
      fileCount++;
    }

    if (totalLines >= maxDiffLines) {
      parts.push(`\n[...remaining files not shown — line limit ${maxDiffLines} reached...]`);
      break;
    }
  }

  return parts.join('\n\n');
}

function isBinary(filename: string): boolean {
  const binaryExts = [
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
    '.pdf', '.zip', '.tar', '.gz', '.exe', '.dll', '.so',
    '.ttf', '.woff', '.woff2', '.eot', '.mp4', '.mp3', '.wav',
  ];
  return binaryExts.some((ext) => filename.toLowerCase().endsWith(ext));
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

  if (prNumber === 0) {
    const commitSha = ctx.sha;
    const created = await octokit.rest.repos.createCommitComment({
      owner, repo,
      commit_sha: commitSha,
      body: fullBody,
    });
    core.info(`Created commit comment: ${created.data.html_url}`);
    return created.data.html_url;
  }

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
