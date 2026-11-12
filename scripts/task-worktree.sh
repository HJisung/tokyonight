#!/bin/sh
# Create an isolated worktree and branch for one task, based on origin/develop.
# Usage: scripts/task-worktree.sh T-003-scaffold
# Prints the worktree path on the last line.
set -eu

[ $# -eq 1 ] || { echo "usage: $0 <T-xxx-slug>" >&2; exit 2; }
slug=$1
root=$(git rev-parse --show-toplevel)
main_checkout=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
dest="$(dirname "$main_checkout")/$(basename "$main_checkout")-worktrees/$slug"
branch="task/$slug"

git -C "$root" fetch --quiet origin develop
git -C "$root" worktree add --quiet -b "$branch" "$dest" origin/develop

# Locally installed design skills are gitignored, so link them into the worktree.
mkdir -p "$dest/.claude/skills" "$dest/.claude/agents"
for name in impeccable hallmark; do
  if [ -d "$main_checkout/.claude/skills/$name" ] && [ ! -e "$dest/.claude/skills/$name" ]; then
    ln -s "$main_checkout/.claude/skills/$name" "$dest/.claude/skills/$name"
  fi
done
for agent in "$main_checkout"/.claude/agents/impeccable-*.md; do
  [ -e "$agent" ] || continue
  [ -e "$dest/.claude/agents/$(basename "$agent")" ] || ln -s "$agent" "$dest/.claude/agents/$(basename "$agent")"
done

echo "$dest"
