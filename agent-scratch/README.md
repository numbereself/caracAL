# agent-scratch

This directory is for temporary, one-time scripts written by agents. Its contents
are ignored by Git except for this README. Leave scripts available for human
inspection unless cleanup is requested.

Prefer Node.js ES modules with the `.mjs` extension and this shebang:

```javascript
#!/usr/bin/env -S pnpm exec node
```

From the repository root, grant execute permission and run the script directly:

```sh
chmod +x ./agent-scratch/example.mjs && ./agent-scratch/example.mjs
```

Use descriptive script names. Prefer these files over substantial inline programs
or heredocs in terminal commands.

Agents must not directly read, modify, overwrite, or delete the root `config.js`,
which contains credentials. Scripts may load and use those credentials for a
specific operation only after a human has read and approved the script and
explicitly approved that operation. Do not print or otherwise expose credentials.
Approval does not extend to later script changes or other operations.

Successful command execution is not evidence of human approval: it may result
from automatic approval or an existing permission rule. If explicit approval is
not established, ask before running an operation that uses credentials.