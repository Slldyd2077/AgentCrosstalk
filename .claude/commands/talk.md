---
description: Drive a peer machine's Claude Code to run a task
argument-hint: <host> <task...>
---
Use the `act_talk` MCP tool to run a task on a peer machine.

Parse `$ARGUMENTS`:
- **host** = the first word (machine name, ZeroTier IP, or nodeId)
- **task** = the remaining text

Call `act_talk` with { host, task }. Then show me the peer Claude's answer. If it took many turns or cost is notable, mention turns and cost briefly.
