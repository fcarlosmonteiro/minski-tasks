# CLAUDE.md

@AGENTS.md

<!-- maestro:begin claude v4 -->
## Claude Code

The `@AGENTS.md` line at the top of this file is an import, and it is what
carries this repository's MAESTRO context into the session. Claude Code reads `CLAUDE.md`
and does not read `AGENTS.md` on its own, so deleting that line leaves every
instruction in `AGENTS.md` unread while the file is still sitting in the
repository, which is the failure that looks most like everything working.

Run `/context` at the start of a session and confirm `CLAUDE.md` appears under
Memory files. A file that exists and a file that was read are different things.

Instructions that only apply to Claude Code belong in this section. Anything
every agent needs belongs in `AGENTS.md`, so that the other agents get it too.

<!-- maestro:end claude -->
