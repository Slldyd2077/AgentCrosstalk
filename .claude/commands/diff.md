---
description: Diff a project directory between this machine and a peer
argument-hint: <host> [local-path]
---
Use the `act_diff` MCP tool to compare a project directory between this machine and a peer.

Parse `$ARGUMENTS`:
- **host** = the first word
- **path** = optional second word; the local project dir (default: current project root)

Call `act_diff` with { host, path }. Then summarize: which files are modified, only-local, only-on-peer.
