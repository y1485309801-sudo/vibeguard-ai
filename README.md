<div align="center">

# 🛡️ VibeGuard AI

**Vibe coding 代码反思守护者 | Goal-Oriented Code Reflection for Vibe Coders**

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)
[![GitHub Action](https://img.shields.io/badge/GitHub-Action-blue?logo=github)](https://github.com/marketplace/actions/vibeguard-ai)
[![Local LLM First](https://img.shields.io/badge/Local%20LLM-First-green?logo=ollama)](https://ollama.ai)

*不替你写代码，而是做你的私人代码导师。*
*Not a code rewriter — your personal code mentor.*

</div>

---

## 🌟 是什么 | What is it?

VibeGuard AI 是一个开源 GitHub Action，专为使用 Cursor、Claude、ChatGPT 等工具"vibe coding"的开发者设计。

每次你提交 PR 时，它会自动：
1. **推断你的目标** — 从 PR 标题、描述、commit 信息推断你想实现什么
2. **分析代码风险** — 检测安全漏洞、质量问题，并与你的目标关联
3. **生成修复 Prompt** — 提供可直接复制到 Claude/Cursor 的教学型修复提示

**2026 年数据：AI 生成代码的安全漏洞发生率高达 45%，逻辑错误高达 75%。** VibeGuard 帮你在上线前发现这些问题。

---

VibeGuard AI is an open-source GitHub Action built for developers who use Cursor, Claude, or ChatGPT to generate code quickly — and want a safety net before shipping.

On every PR it automatically:
1. **Infers your goal** from PR title, description, and commits
2. **Analyzes the diff** for security vulnerabilities and quality issues, anchored to your goal
3. **Generates fix prompts** — copy-paste ready prompts to fix issues in Claude/Cursor

---

## ⚡ 5 分钟快速配置 | 5-Minute Quick Setup

### Step 1 — 添加 workflow 文件 | Add the workflow file

在你的仓库中创建 `.github/workflows/vibeguard.yml`：
Create `.github/workflows/vibeguard.yml` in your repo:

```yaml
name: VibeGuard AI Code Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  vibeguard-review:
    runs-on: ubuntu-latest
    steps:
      - uses: vibeguard-ai/vibeguard-ai@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          llm_base_url: 'https://api.openai.com/v1'
          llm_api_key: ${{ secrets.OPENAI_API_KEY }}
          model: 'gpt-4o'
```

### Step 2 — 配置密钥 | Add secrets

进入 GitHub 仓库 → Settings → Secrets → Actions，添加你的 API key。
Go to your repo → Settings → Secrets → Actions, and add your API key.

### Step 3 — 提交 PR，坐等结果 | Open a PR and watch it work

---

## 🏠 本地 Ollama 配置（零成本、完全私密）| Local Ollama Setup (Free & Private)

```yaml
- uses: vibeguard-ai/vibeguard-ai@v1
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    llm_base_url: 'http://localhost:11434/v1'
    llm_api_key: 'ollama'
    model: 'llama3.2'   # or qwen2.5-coder, deepseek-r1, etc.
```

> ⚠️ 需要自托管 runner 才能访问本地 Ollama。
> Requires a self-hosted runner with access to local Ollama.

---

## 📋 配置项 | Configuration Options

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `model` | `llama3.2` | LLM 模型 (ollama/llama3.2, gpt-4o, deepseek-chat) |
| `focus` | `all` | 检查重点: `safety` \| `maintainability` \| `all` |
| `include_prompts` | `true` | 是否包含修复 Prompt |
| `max_tokens` | `4096` | LLM 最大 token 数 |
| `max_diff_lines` | `500` | diff 最大分析行数 |

---

## 📊 示例输出 | Example Output

当你提交一个包含 SQL 注入漏洞的 PR 时，VibeGuard 会自动在 PR 评论中生成：

```
## 🛡️ VibeGuard AI — Code Reflection Report

### 🎯 Inferred User Goal
实现安全的用户邮箱+密码登录功能。

### 📊 Overall Quality Score
| Dimension    | Score  | Status |
|--------------|--------|--------|
| 🔒 Security  | 35/100 | ❌     |
| 🔧 Maintain. | 70/100 | ⚠️     |
| ✓ Correct.   | 75/100 | ⚠️     |

### 🔴 Critical Issue 1: SQL Injection Risk
📍 Location: `auth.py:45-52`

**What's happening:** SQL queries are built by concatenating user input
directly into the query string...

🔧 Copy-Paste Fix Prompt for Claude/Cursor:
[complete educational fix prompt...]
```

---

## 🆚 与竞品对比 | vs. Competitors

| 功能 | VibeGuard AI | CodeRabbit | Bito AI |
|------|-------------|------------|---------|
| 本地 LLM 支持 | ✅ Ollama 优先 | ❌ | ❌ |
| 目标导向分析 | ✅ | ❌ | ❌ |
| 教学型修复 Prompt | ✅ | ❌ | 部分 |
| 面向 vibe coders | ✅ 专注 | ❌ 偏专业 | ❌ 偏专业 |
| 隐私保护 | ✅ 可完全本地 | ❌ 云端 | ❌ 云端 |
| 开源 | ✅ MIT | ❌ | ❌ |
| 免费 | ✅ (本地) | 有限 | 有限 |

---

## 🔒 安全设计 | Security Design

- **只读 diff**：只读取 PR 变更内容，不存储任何代码
- **最小权限**：仅需 `contents: read` + `pull-requests: write`
- **本地优先**：默认支持 Ollama，代码无需离开你的服务器
- 输出注明"辅助参考，最终由用户判断"

---

## 📄 License

MIT © VibeGuard AI contributors
