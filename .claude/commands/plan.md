---
name: plan
description: Plan a new feature or sidecar before implementation
allowed-tools: Read, Glob, Grep, Bash(find:*), Bash(tree:*), WebSearch, WebFetch, mcp__serena__*, AskUserQuestion
---

# Feature Planning

You are helping plan: $ARGUMENTS

## Planning Process

### Step 1: Clarify Requirements

First, understand what the user wants to build. Ask clarifying questions if needed:

- What is the goal of this feature/sidecar?
- Who will use it?
- What are the inputs and outputs?
- Are there any constraints or dependencies?

### Step 2: Explore Existing Code

Check the codebase for relevant patterns:

- Look at `packages/x402-bundler-sidecar/` for sidecar structure
- Check CLAUDE.md for conventions
- Find any related existing code

### Step 3: Research (if needed)

If the feature requires external knowledge:

- Look up relevant APIs or libraries
- Check AR.IO documentation
- Research best practices

### Step 4: Design Architecture

Create the technical design:

- Package/file structure
- Key components and their responsibilities
- API contracts (if applicable)
- Database schema (if applicable)
- Docker/network requirements

### Step 5: Create Implementation Plan

Break down into ordered tasks:

```markdown
## Implementation Plan: [Feature Name]

### Overview

[1-2 sentence summary]

### Architecture

[Component diagram or description]

### Tasks

1. **[Task Name]** (complexity: simple/medium/complex)
   - Files: [files to create/modify]
   - What: [description]
   - Dependencies: [prerequisite tasks]

2. ...

### Open Questions

[Decisions needing user input]

### Next Steps

Ready to implement with `/implement [feature name]`
```

## Context Files

@CLAUDE.md
