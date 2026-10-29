# Session-start prompt

Copy the block below into **either** agent (CommandCode or Replit Agent) at the
start of a session. Replace the three placeholders, then paste.

It is intentionally short: it makes the agent read the shared memory instead of
carrying a summary that can drift.

---

```text
You are working in a repository shared by two agents: CommandCode (Replit shell)
and Replit Agent (Replit workspace). The other agent is active right now. You
share one filesystem and one memory.

YOUR AGENT NAME: <CommandCode | Replit Agent>

STEP 1 — read, in this order, before any edit:
  1. AGENTS.md
  2. .agents/memory/decisions.md        (authoritative, append-only)
  3. .agents/memory/current-state.md    (done / in progress / blocked)
  4. .agents/memory/ownership.md        (path claims)
  5. the newest file in .agents/journal/ that is not yours

STEP 2 — state back to me, in five lines:
  - what the other agent is currently doing
  - which paths are currently claimed, and by whom
  - the last three decisions (IDs only)
  - anything blocked on me (keys, approvals, money)
  - whether you agree with the plan in .agents/memory/current-state.md

STEP 3 — before editing:
  - append a row to .agents/memory/ownership.md claiming the paths you will
    touch. If another agent has an ACTIVE, unexpired claim on them, STOP and tell
    me instead of editing.
  - if you are changing a decision, append a new entry to decisions.md and name
    the ID you are superseding. Never edit or delete an older entry.

STEP 4 — while working:
  - follow decisions.md over any older note, including your own.
  - if the code contradicts decisions.md, stop and report it. Do not silently
    "fix" it and do not revert the other agent's work.
  - no deploys, no data migrations, no destructive commands, no secrets in files
    without my explicit approval.

STEP 5 — when you stop:
  - append a Handoff block to .agents/journal/YYYY-MM-DD-<your-agent>.md using
    the format in AGENTS.md
  - update only your own block in current-state.md
  - add a RELEASED row for each of your claims in ownership.md

TASK FOR THIS SESSION:
<describe the task>

CONSTRAINTS I AM SETTING:
<e.g. "only touch docs", "do not install dependencies", "stop before deploy">
```

---

## Why it is structured this way

- **Read before write** stops the failure that already happened once: a note said
  "do not change payment providers" while the actual instruction was to switch to
  Zeno.
- **Claimed paths** stop the two agents from editing the same file in the same
  minute. The D1 port and the Zeno swap touch exactly the same files.
- **Append-only decisions** give a dated audit trail and let a decision be
  reversed without losing the reasoning.
- **Journals are per agent per day**, so neither can clobber the other's log.
- **Handoff blocks** are what makes the memory survive a session ending.

## Minimal version

If you only have one line to paste, use this:

```text
Read AGENTS.md, then .agents/memory/decisions.md, current-state.md and
ownership.md. Claim your paths before editing, append (never edit) decisions and
journal entries, and hand off with the format in AGENTS.md. Do not revert the
other agent's work. Task: <task>
```
