# Agentic Operating Standard

## Single Source of Truth

This file is the canonical policy for agentic coding in this repository.
If any tool-specific file conflicts with this document, this document wins.

## Mission

Use AI agents to accelerate delivery while preserving code quality, safety, and reproducibility.
Optimize for reliability per unit complexity.

## Safety & Guardrails

- Do not push directly to `main`; use pull requests.
- Do not execute destructive commands (recursive deletes, hard resets, force-kill patterns) unless explicitly requested.
- Never commit secrets, tokens, private keys, or environment values.
- Treat any local-only memory/tool cache as non-authoritative.
- Prefer minimal, targeted changes over broad rewrites.

## Code Change Workflow

1. Read this file and relevant project docs before editing.
2. Implement minimal scoped changes.
3. Validate locally (`bun run format:check`, `bun run build`, plus task-specific tests).
4. Open a PR with clear change summary and risks.
5. Address CI and review feedback before merge.

## Testing & Verification

- Run formatting and build checks for all code changes.
- Run targeted tests for touched areas.
- For infra/config updates, include a concrete verification checklist in the PR.
- Do not merge while validation is failing.
- Optional local hook: run `bun run agentic:validate` before push.

## Review Standard

Review priority order:

1. Correctness and regressions.
2. Security and secret handling.
3. Operability and rollback safety.
4. Maintainability and clarity.

Every review should include explicit file references and actionable fixes.

## Tooling Policy

- AGENTS-first policy: all tools must align to this file.
- Tool-specific files (`CLAUDE.md`, `.cursorrules`) are compatibility shims only.
- Keep shims short and non-normative; avoid duplicate policy logic.
- Keep automated checks deterministic and low-overhead.

## MCP Policy

Default MCP posture is `minimal-readonly`.

- Read-only context servers are allowed by default.
- Write/exec-capable MCP tools require explicit task-level justification.
- Serena is optional, not mandatory.
- Use Serena for symbol-heavy refactors or memory recall workflows.
- Do not store canonical project policy solely in Serena memory.
- Promote durable Serena learnings into tracked docs/skills through PRs.

## Escalation Rules

- If requirements conflict, escalate before implementation.
- If a change has production or security impact, require explicit reviewer sign-off.
- If uncertainty is high, choose the safer reversible path and document assumptions.
