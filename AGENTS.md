# Agent guidance

## Human review and commit ownership

- A human must review and understand every change before it is committed,
  including code, tests, documentation, and configuration. The human submitting
  the change is responsible for its correctness and suitability.
- Humans alone select and stage changes, write commit messages, and create
  commits. Agents must not stage changes, write or propose commit messages,
  create commits, or amend existing commits, even when asked.
- Agents may edit working-tree files, run appropriate checks, and explain changes
  for human review. Preserve unrelated human changes.

## Credentials and approval

- Never directly read, modify, overwrite, or delete the root
  [config.js](config.js). It contains credentials. Do not expose its contents
  through searches, diffs, logs, diagnostics, or other indirect access.
- Scripts may load and use credentials for a specific operation only after a
  human has read and approved the script and explicitly approved that operation.
  Do not print or otherwise expose credentials. Approval does not extend to
  later script changes or other operations.
- Successful command execution does not establish human approval: it may result
  from automatic approval or an existing permission rule. Ask if explicit
  approval is not established before running a credential-using operation.
- Starting the application can authenticate to the live game and start
  characters; it is not an offline validation step. Imports and subprocesses
  that load credentials require the same approval as direct script execution.

## Scratch scripts and terminal commands

- Keep terminal commands short and readable. Put substantial one-time programs
  in descriptively named files under agent-scratch/ using normal file-editing
  tools, not large heredocs or runtime command-line arguments.
- Prefer Node.js ES modules with the `.mjs` extension and the shebang
  `#!/usr/bin/env -S pnpm exec node`. Use another language when there is a clear
  practical reason.
- From the repository root, execute through the shebang:
  `chmod +x ./agent-scratch/example.mjs && ./agent-scratch/example.mjs`, replacing
  the example name with the actual script name.
- Follow [the scratch-script guidance](agent-scratch/README.md), including
  leaving scripts available for human inspection unless cleanup is requested.
- Git-ignored files are not automatically off-limits. The credential and
  user-data restrictions apply regardless of Git tracking status.

## Changes and project clarity

- Game files may be edited. Prefer clearly named copies of downloaded game
  files over modifying the originals.
- Do not delete or overwrite user-stored data unless the task explicitly
  requires it.
- Prefer clear names and intuitive file placement so responsibilities are
  apparent from the code and structure. Avoid unrelated restructuring.
- No formal project-wide coding conventions are established yet; follow nearby
  code where practical rather than inventing new rules.
- Consult [README.md](README.md) for project usage rather than duplicating its
  documentation here.

## Validation and reporting

- Discover relevant validation scripts in [package.json](package.json). Its
  current test script is a placeholder, not a meaningful automated test suite.
- Choose checks relevant to the change and consistent with the approval rules.
  Do not present static checks as equivalent to tests.
- Report changes, checks actually performed, and anything not verified. Never
  claim a check passed unless it was run successfully.
