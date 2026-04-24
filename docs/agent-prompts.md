# CanopyTrace — Agent Prompt Templates

Use these templates for every story. Fill in the bracketed sections before running.

---

## Build prompt

```
You are implementing a production-grade task for the CanopyTrace MVP.

Constraints:
- Follow existing architecture and file structure exactly.
- TypeScript strict mode must pass.
- ESLint and Prettier must pass.
- Security is mandatory: validate inputs, avoid insecure defaults, never hardcode secrets, and minimize attack surface.
- Write or update tests for all changed behavior.
- Prefer small, composable modules.
- Do not add dead code, placeholders, fake implementations, or bypasses.
- Preserve self-host-first design and PostgreSQL as source of truth.
- Do not change unrelated files.
- At the end, provide:
  1. summary of changes
  2. files changed
  3. commands to run
  4. known risks / follow-ups

Task:
[PASTE STORY HERE]

Acceptance criteria:
[PASTE ACCEPTANCE CRITERIA HERE]
```

---

## Troubleshooting prompt

```
You are debugging a failing CanopyTrace MVP implementation.

Rules:
- Do not guess.
- Identify the likely root cause from code, logs, and tests.
- Prefer the smallest safe fix.
- Do not disable linting, type checks, security checks, or tests.
- Preserve current architecture and coding standards.
- Explain whether the issue is code, configuration, migration, test fixture, or environment related.
- If multiple causes are possible, rank them.

Problem:
[PASTE ERROR / FAILURE]

Relevant files:
[PASTE FILES / SNIPPETS]

Output format:
1. Root cause
2. Minimal fix
3. Code changes required
4. Regression tests to add/update
5. Commands to verify
```

---

## Test-writing prompt

```
Write production-quality tests for the described CanopyTrace behavior.

Requirements:
- Cover happy path, validation failures, authorization failures, and edge cases.
- Avoid brittle snapshots unless strongly justified.
- Keep fixtures minimal and readable.
- Ensure tests are deterministic and parallel-safe.
- Use realistic domain data for cannabis compliance workflows.

Behavior under test:
[PASTE BEHAVIOR]

Return:
- test file(s)
- any fixture/helpers added
- short explanation of coverage
```
