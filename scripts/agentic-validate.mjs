#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const errors = [];
const warnings = [];
const modeArg = process.argv.find((arg) => arg.startsWith("--mode="));
const mode = modeArg ? modeArg.slice("--mode=".length) : "validate";

function rel(filePath) {
  return path.relative(root, filePath) || ".";
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function addIssue(list, code, message) {
  list.push({ code, message });
}

function extractFrontmatter(content) {
  const normalized = content.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
  return match ? match[1] : null;
}

function findMarkdownLinks(content) {
  const links = [];
  const regex = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const match of content.matchAll(regex)) {
    links.push(match[1]);
  }
  return links;
}

async function main() {
  const policyPath = path.join(root, "agentic.policy.json");
  if (!(await exists(policyPath))) {
    console.error("Missing required policy file: agentic.policy.json");
    process.exit(1);
  }

  const policyRaw = await readFile(policyPath, "utf8");
  let policy;
  try {
    policy = JSON.parse(policyRaw);
  } catch (error) {
    console.error(`Invalid JSON in agentic.policy.json: ${error.message}`);
    process.exit(1);
  }

  for (const file of policy.required_files || []) {
    const fullPath = path.join(root, file);
    if (!(await exists(fullPath))) {
      addIssue(errors, "MISSING_FILE", `Missing required file: ${file}`);
    }
  }

  for (const [file, sections] of Object.entries(policy.required_sections || {})) {
    const fullPath = path.join(root, file);
    if (!(await exists(fullPath))) {
      continue;
    }
    const content = await readFile(fullPath, "utf8");
    for (const section of sections) {
      if (!content.includes(section)) {
        addIssue(errors, "MISSING_SECTION", `${file} missing required section: ${section}`);
      }
    }
  }

  for (const rule of policy.forbidden_patterns || []) {
    let regex;
    try {
      regex = new RegExp(rule.pattern, "i");
    } catch (error) {
      addIssue(
        errors,
        "INVALID_PATTERN",
        `Invalid forbidden pattern "${rule.id || "unknown"}": ${error.message}`
      );
      continue;
    }
    for (const file of rule.scope || []) {
      const fullPath = path.join(root, file);
      if (!(await exists(fullPath))) {
        continue;
      }
      const content = await readFile(fullPath, "utf8");
      if (regex.test(content)) {
        const issue = `${file} violates forbidden pattern "${rule.id}"`;
        if ((rule.severity || "error") === "warning") {
          addIssue(warnings, "FORBIDDEN_PATTERN", issue);
        } else {
          addIssue(errors, "FORBIDDEN_PATTERN", issue);
        }
      }
    }
  }

  const shimRules = policy.shim_consistency_rules || {};
  for (const file of shimRules.shim_files || []) {
    const fullPath = path.join(root, file);
    if (!(await exists(fullPath))) {
      continue;
    }
    const content = await readFile(fullPath, "utf8");
    const lineCount = content.endsWith("\n")
      ? content.slice(0, -1).split("\n").length
      : content.split("\n").length;

    if (
      typeof shimRules.required_reference === "string" &&
      shimRules.required_reference.length > 0 &&
      !content.includes(shimRules.required_reference)
    ) {
      addIssue(
        errors,
        "SHIM_REFERENCE",
        `${file} must reference ${shimRules.required_reference}`
      );
    }

    if (typeof shimRules.max_lines === "number" && lineCount > shimRules.max_lines) {
      addIssue(errors, "SHIM_LENGTH", `${file} exceeds ${shimRules.max_lines} line limit`);
    }

    for (const heading of shimRules.disallow_headings || []) {
      const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const headingRegex = new RegExp(`^${escaped}\\s*$`, "m");
      if (headingRegex.test(content)) {
        addIssue(
          errors,
          "SHIM_NORMATIVE_CONTENT",
          `${file} contains normative heading that belongs in ${shimRules.canonical_file}: ${heading}`
        );
      }
    }
  }

  const skillsIndexPath = path.join(root, "SKILLS.md");
  if (await exists(skillsIndexPath)) {
    const skillsIndex = await readFile(skillsIndexPath, "utf8");
    const links = findMarkdownLinks(skillsIndex).filter((link) =>
      /^skills\/.+\/SKILL\.md$/.test(link)
    );

    if (links.length === 0) {
      addIssue(errors, "SKILLS_INDEX_EMPTY", "SKILLS.md must reference at least one skill file");
    }

    for (const link of links) {
      const skillPath = path.join(root, link);
      if (!(await exists(skillPath))) {
        addIssue(errors, "MISSING_SKILL_FILE", `Missing referenced skill file: ${link}`);
        continue;
      }
      const skillContent = await readFile(skillPath, "utf8");
      const frontmatter = extractFrontmatter(skillContent);
      if (!frontmatter) {
        addIssue(errors, "SKILL_FRONTMATTER", `${link} missing YAML frontmatter`);
        continue;
      }
      for (const field of policy.skill_frontmatter_required || []) {
        const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const fieldRegex = new RegExp(`^${escaped}:\\s*.+$`, "m");
        if (!fieldRegex.test(frontmatter)) {
          addIssue(errors, "SKILL_FIELD", `${link} missing frontmatter field: ${field}`);
        }
      }
    }
  }

  if (warnings.length > 0) {
    console.warn("Warnings:");
    for (const warning of warnings) {
      console.warn(`- [${warning.code}] ${warning.message}`);
    }
  }

  if (errors.length > 0) {
    console.error("Validation failed:");
    for (const error of errors) {
      console.error(`- [${error.code}] ${error.message}`);
    }
    process.exit(1);
  }

  const modeLabel = mode === "drift" ? "drift check" : "validation";
  console.log(`Agentic policy ${modeLabel} passed (${rel(policyPath)}).`);
}

main().catch((error) => {
  console.error(`Validation execution error: ${error.message}`);
  process.exit(1);
});
