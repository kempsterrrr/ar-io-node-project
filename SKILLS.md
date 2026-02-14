# Skills Registry

## Single Source of Truth

This file is the canonical index of repository-defined skills.
Skill behavior must be defined in tracked `skills/*/SKILL.md` files, not local tool memory.

## Skill Index

| name                      | intent                                       | inputs                                    | outputs                                         | owner            | status | last-reviewed | path                                                                                   |
| ------------------------- | -------------------------------------------- | ----------------------------------------- | ----------------------------------------------- | ---------------- | ------ | ------------- | -------------------------------------------------------------------------------------- |
| agentic-policy-maintainer | Keep agent policy, shims, and checks in sync | Policy docs, workflow changes, CI signals | Updated policy docs/checks and validation notes | @williamkempster | active | 2026-02-14    | [skills/agentic-policy-maintainer/SKILL.md](skills/agentic-policy-maintainer/SKILL.md) |

## Skill Invocation Rules

### agentic-policy-maintainer

When to invoke:

- Updating `AGENTS.md`, `SKILLS.md`, `agentic.policy.json`, or shim files.
- Adding/removing guardrails or validation checks.
- Investigating drift between canonical policy and tool compatibility files.

When not to invoke:

- Feature implementation unrelated to agent policy.
- One-off coding tasks where policy/governance is not changing.
- Tasks that only require local personal tooling preferences.
