---
name: agentic-policy-maintainer
description: Maintains canonical agent policy, compatibility shims, and enforcement checks with minimal complexity.
inputs:
  - Proposed policy changes
  - Tool compatibility requirements
  - CI and review signals
outputs:
  - Updated AGENTS.md and SKILLS.md guidance
  - Updated validation rules and CI checks
  - Drift and contradiction findings with file references
triggers:
  - Changes to AGENTS.md, SKILLS.md, CLAUDE.md, .cursorrules, agentic.policy.json
  - Repeated policy violations in CI
  - Review feedback indicating agent workflow confusion
version: 1.0.0
owner: @williamkempster
---

# Skill: Agentic Policy Maintainer

## Objective

Keep agent governance clear, enforceable, and low-overhead across supported tools.

## Workflow

1. Validate current policy with `bun run agentic:validate`.
2. Confirm canonical policy remains in `AGENTS.md`.
3. Ensure shims remain compatibility-only and reference canonical policy.
4. Update validator rules only when policy intent changes.
5. Document tradeoffs and risks in PR notes.

## Constraints

- Do not create parallel policy sources.
- Do not require optional tools (including Serena) for baseline operation.
- Keep enforcement deterministic and reviewable.
