---
allowed-tools: Bash(git checkout --branch:*), Bash(git checkout -b:*), Bash(git add:*), Bash(git status:*), Bash(git push:*), Bash(git commit:*), Bash(gh pr create:*)
description: Commit, push, and open a PR
---

## Context

- Current git status: !`git status`
- Current git diff (staged and unstaged changes): !`git diff HEAD`
- Assume any staged changes are also to be committed.
- Current branch: !`git branch --show-current`

## Defra Standards

- Branch: `PAE-<NUMBER>-<kebab-case-description>` (enforced via CI)
- Commit: Imperative mood, max 50 chars, capitalized, no period
- PR title: `$1: <description>` (e.g., "PAE-280: Add Renovate dependency
  management ADR")
- PR description: Explain what changed and why (not how)

## Your task

1. Check current branch name:
   - If branch matches `$1-<description>`, stay on it
   - Otherwise, create a new branch starting with "$1-" followed by a short
     kebab-case description
2. If there are uncommitted changes, create a commit with an imperative message
   (e.g., "Add feature" not "Added feature"). Max 50 chars, capitalized, no
   period.
3. Push the branch to origin
4. Create a pull request using `gh pr create` with title `$1: <description>` and
   body explaining what changed and why
5. You have the capability to call multiple tools in a single response. You MUST
   do all of the above in a single message. Do not use any other tools or do
   anything else. Do not send any other text or messages besides these tool
   calls, except in the case of an error.
