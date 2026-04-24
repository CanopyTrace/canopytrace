# Engineering Runbook

CanopyTrace MVP — internal reference for contributors.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20 LTS | `winget install OpenJS.NodeJS.LTS` or `nvm install 20` |
| pnpm | 9.15.0 | `corepack enable && corepack prepare pnpm@9.15.0 --activate` |
| Docker Desktop | 4.x+ | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop) |
| gitleaks | latest | `winget install zricethezav.gitleaks` (optional; CI enforces) |

Windows users: ensure Docker Desktop > Settings > Resources > WSL Integration is enabled if using WSL.

---

## Bootstrap (first time)

```bash
# 1. Clone and enter repo
git clone https://github.com/CanopyTrace/canopytrace.git
cd canopytrace

# 2. Use correct Node version
nvm use   # reads .nvmrc (Node 20)

# 3. Activate pnpm via corepack
corepack enable
corepack prepare pnpm@9.15.0 --activate

# 4. Install all workspace dependencies
pnpm install

# 5. Create local environment files
cp infra/.env.example infra/.env
cp apps/ct-api/.env.example apps/ct-api/.env
# Edit each .env — replace all change_me_never_commit placeholders with real local values.
# Never commit any .env file.

# 6. Start infrastructure
docker compose -f infra/docker-compose.yml up -d

# 7. Run database migrations
pnpm db:migrate

# 8. Verify the full gate suite passes
pnpm verify
```

After `pnpm verify` exits green, your environment is clean.

---

## Day-to-day commands

```bash
pnpm verify          # Full pre-merge gate: format:check → lint → typecheck → test → build
pnpm format          # Auto-format all files (run before committing)
pnpm lint            # ESLint across all packages
pnpm typecheck       # TypeScript noEmit across all packages
pnpm test            # Vitest (run once)
pnpm test:watch      # Vitest in watch mode (per-package: pnpm --filter @canopytrace/ct-api test:watch)
pnpm build           # Compile TypeScript across all packages
pnpm clean           # Remove dist/, .next/, node_modules/ (useful when deps get confused)
```

Run any command against a single package with `--filter`:

```bash
pnpm --filter @canopytrace/ct-api lint
pnpm --filter @canopytrace/db db:migrate
```

---

## Infrastructure

```bash
# Start local infra (Postgres 16 + MinIO)
docker compose -f infra/docker-compose.yml up -d

# Tail logs for a service
docker compose -f infra/docker-compose.yml logs -f postgres

# Stop all services
docker compose -f infra/docker-compose.yml down

# Full teardown (also removes volumes — destroys local DB data)
docker compose -f infra/docker-compose.yml down -v
```

Services and their local ports:

| Service | Port | Notes |
|---------|------|-------|
| PostgreSQL | 5432 | Database |
| MinIO API | 9000 | S3-compatible object storage |
| MinIO Console | 9001 | Web UI at http://localhost:9001 |
| ct-api | 3001 | NestJS REST API |
| ct-web | 3000 | Next.js operator UI (stub) |

---

## Database migrations

Migrations live in `packages/db/migrations/` as numbered SQL files managed by node-pg-migrate.

```bash
pnpm db:migrate        # Run all pending migrations (up)
pnpm db:status         # Show applied vs. pending migrations
pnpm db:reset          # Drop schema and re-run all migrations from scratch (destructive — local only)
```

To create a new migration:

```bash
pnpm --filter @canopytrace/db db:migrate:create -- my-migration-name
```

**Rules:**
- Never edit an already-applied migration. Write a new one.
- Every migration must be reversible — write the down path.
- Run `pnpm db:migrate` and `pnpm db:status` before opening a PR that includes schema changes.
- Migration files are append-only in `main`. Squashing is prohibited.
- Do not run `db:reset` against any shared or staging environment.

---

## Coding standards

**Language and typing**
- TypeScript strict mode is enforced. Zero use of `any` without an explicit justification comment approved in review.
- Prefer `unknown` over `any` for external data; narrow types explicitly.
- Use type imports (`import type { Foo }`) for type-only references.

**Style**
- Prettier handles formatting (run `pnpm format` before committing). Formatting is a CI gate.
- ESLint max-warnings is 0 — CI fails on any warning.
- `eqeqeq`: always use `===`, never `==`.
- No `var`. Use `const` by default; `let` when necessary.
- No floating promises. Every `async` call must be awaited or explicitly handled.

**Code structure**
- No comments unless the WHY is non-obvious (hidden constraints, workarounds, subtle invariants).
- No docstrings or multi-line comment blocks.
- Don't add error handling, fallbacks, or validation for scenarios that cannot happen.
- Don't introduce abstractions or refactors beyond what the current task requires.

**Imports**
- ESLint enforces import grouping (builtin → external → internal → parent → sibling → index) with alphabetical sort within each group.

---

## Branching and pull requests

```
main         production-ready; protected; no direct commits
develop      integration branch; where feature branches merge
feature/*    short-lived; branch from develop; merge back to develop
hotfix/*     branch from main; merge to both main and develop
```

1. Branch from `develop` for all feature work: `git checkout -b feature/short-description`.
2. Keep branches short-lived (days, not weeks).
3. Run `pnpm verify` locally before opening a PR — CI runs the same gates.
4. PRs require at least one approving review before merge.
5. Squash-merge to `develop`; the PR title becomes the commit message.
6. Never force-push to `main` or `develop`.

---

## CI gates

Every push and PR to `main` or `develop` runs all eight gates in sequence. All must pass before merge.

| Gate | Tool | Failure means |
|------|------|--------------|
| Format check | Prettier | Unformatted files — run `pnpm format` |
| Lint | ESLint | Lint error or warning — fix before pushing |
| Typecheck | tsc | Type error — fix before pushing |
| Test | Vitest | Failing test — fix or remove the test |
| Build | tsc | Compile error — fix before pushing |
| Audit deps | pnpm audit | MODERATE+ CVE in prod deps — update or justify |
| Secret scan | gitleaks | Detected credential — rotate key immediately, remove from history |
| Container scan | Trivy | CRITICAL or HIGH CVE in image — update base image or dep |

In-progress CI runs are cancelled when a newer push arrives on the same branch.

---

## Security posture

**No shortcuts.** CI blocks merges on CVEs, leaked secrets, and lint failures. Do not bypass gates.

- **Secrets:** Never commit credentials, tokens, or keys — not even in test fixtures. Use `change_me_never_commit` only in `.env.example` files. Gitleaks scans every push.
- **Dependencies:** Run `pnpm audit:deps` before adding or updating a package. MODERATE+ findings block CI.
- **Environment files:** All `.env` files are in `.gitignore`. Confirm with `git status` before committing.
- **Container images:** Trivy scans built images in CI. CRITICAL/HIGH findings block merge. See `docs/security-policy.md` for the exception process and remediation SLAs.
- **Metrc credentials:** Treat Metrc API keys as production secrets. Use sandbox keys locally (`METRC_BASE_URL=https://api-sandbox.metrc.com`).

If you discover a committed secret: rotate the key immediately, then contact a maintainer to scrub the history.

---

## Dependency management

- Add dependencies with `pnpm add <pkg> --filter <package-name>`. Do not install into the root workspace unless it is a repo-wide dev tool (e.g., Prettier, ESLint).
- Run `pnpm audit --prod` after adding any dependency.
- Dependabot opens weekly PRs for npm, Docker base images, and GitHub Actions. Review and merge promptly — they keep the audit gate green.
- Never pin a dependency to bypass a security fix.

---

## Testing expectations

- Tests live alongside source: `src/foo.test.ts` next to `src/foo.ts`.
- Every new module should have a corresponding test file.
- Use Vitest. Supertest is available in `ct-api` for HTTP integration assertions.
- Tests must pass in CI without environment credentials. Mock external services at the integration boundary.
- `pnpm test:watch` is your feedback loop during development.
- `--passWithNoTests` is set only for stub apps (`ct-worker`, `ct-web`) and must be removed when real code lands.

---

## Troubleshooting

**`pnpm install` fails with peer dependency errors**

Check `.npmrc` — `strict-peer-dependencies=false` is set. If a new peer error appears, add `auto-install-peers=true` or pin the conflicting version in the root `package.json` `overrides` field.

**`docker compose up` fails with permission errors on volume mount (Windows)**

Docker Desktop requires folder ownership to match the container user. Right-click the project folder → Properties → Security → ensure your user account has Full Control. Alternatively: Docker Desktop > Settings > Resources > Advanced > toggle WSL integration off and on.

**`DATABASE_URL` not found when running migrations**

Migrations resolve config in this order: `DATABASE_URL` env var → `infra/.env` → individual `POSTGRES_*` vars → hardcoded default. Ensure `infra/.env` exists and is populated.

**Port already in use (5432, 3001, 9000)**

Find and stop the conflicting process:

```bash
# Windows
netstat -ano | findstr :<port>
taskkill /PID <pid> /F

# Unix/WSL
lsof -i :<port>
kill -9 <pid>
```

**ESLint or TypeScript errors after a `pnpm install`**

Run `pnpm clean && pnpm install` to clear stale build artifacts, then retry.

**Gitleaks false positive blocking CI**

Add the specific rule to the `allowlist` in `.gitleaks.toml` with a code comment explaining the exception. Get maintainer approval before merging.

---

## Key file locations

| Path | Purpose |
|------|---------|
| `infra/docker-compose.yml` | Local dev services |
| `infra/.env.example` | Environment variable template |
| `packages/db/migrations/` | SQL migration files |
| `packages/config-eslint/index.js` | Shared ESLint rules |
| `packages/config-ts/` | Shared TypeScript presets |
| `.prettierrc.json` | Formatting rules |
| `.gitleaks.toml` | Secret scanning rules |
| `.github/workflows/ci.yml` | CI pipeline definition |
| `docs/security-policy.md` | CVE remediation SLAs and exception process |
| `docs/secret-handling.md` | Secret handling guidelines |
