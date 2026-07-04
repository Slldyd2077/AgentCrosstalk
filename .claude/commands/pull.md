---
description: Pull a file from a peer machine to this one
argument-hint: <host> <remote-file>
---
Use the `act_pull` MCP tool to pull a file from a peer machine.

Parse `$ARGUMENTS`:
- **host** = the first word
- **file** = the second word (the file's path on the peer)

Call `act_pull` with { host, file } (destination defaults to the current directory). Tell me where the file landed and its size.
