# AGENTS.md

This repository is governed by MAESTRO. Read this file before you plan, write
or review any code here.

The regions between the `maestro:begin` and `maestro:end` comments are written by
`maestro init` and rewritten every time it runs. Everything outside them is
yours to keep, and the entries you fill in inside them are carried over.

<!-- maestro:begin skills v1 -->
## Required reading

Before anything else, read every `SKILL.md` under these directories:

- `~/.maestro/skills/knowledge/` -- what this product is and how it is built
- `~/.maestro/skills/harness/` -- how you are allowed to work
- `~/.maestro/skills/assurance/` -- what has to be true before you submit
- `~/.maestro/skills/performance/` -- what the work is measured by

On Windows the same directories live under `%USERPROFILE%\.maestro\skills\`.

These files are the standards this repository is held to. They are not
background reading: where they disagree with a habit, a framework default or
something you inferred from the surrounding code, they win.

They are published by the MAESTRO control plane and materialised by
`maestro sync`. Do not edit them in place. The next cycle overwrites the edit
and files a copy under `~/.maestro/cache/local-edits/`, so the change is lost
to everyone but you. Propose it through the platform instead.

While you work, record what you do as the `harness/registro-minimo` skill
describes: one line in `~/.maestro/telemetry/pending.csv` for each decision you
make, each test run, the cost and the end of each execution unit, and
`maestro question` when a person has to decide, followed by
`maestro answers --wait` to receive the answer. That record is how the
platform sees the work; without it the work did not happen as far as anyone
else can tell.

<!-- maestro:end skills -->

<!-- maestro:begin spec v1 -->
## Work item

- Work item: cmv8fk9ei001iqn01ecjk6qj2
- Spec: https://184.192.83.105/work/cmv8fk9ei001iqn01ecjk6qj2

Work that no item asks for does not get done here. If the reference above is
still unfilled, or if what you are about to do falls outside it, stop and ask
rather than deciding the scope yourself.

<!-- maestro:end spec -->

<!-- maestro:begin gates v1 -->
## Gates

These have to pass before anything is submitted.

- Tests: `pytest` (ou `cd backend && pytest`) · `cd frontend && npx vitest run` (frontend ainda não existe)
- Lint: `ruff check .` (ou `cd backend && ruff check .`) · `cd frontend && npx eslint . && npx prettier --check .` (frontend ainda não existe)
- Build: `cd frontend && npx vite build` (frontend ainda não existe)

Backend: `python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt`, depois os comandos acima com `.venv/bin/` no `PATH`.

Run them before you change anything and write down what already fails. Run
them again afterwards and compare. A failure that was already there is not a
result of your work, and one you introduced is not a caveat to mention in
passing.

A gate you did not run is a gate that did not pass. Report which ones you ran
and what they returned, never that the work "should" pass them.

<!-- maestro:end gates -->
