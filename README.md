# CanopyTrace

> **Self-hostable, open-source cannabis compliance platform.**
> NY (Metrc) end-to-end compliance — inventory lifecycle, regulatory sync, audit & evidence tracking.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Repository structure](#repository-structure)
3. [Bootstrap (first-time setup)](#bootstrap-first-time-setup)
4. [Running locally](#running-locally)
5. [Available scripts](#available-scripts)
6. [Environment variables](#environment-variables)
7. [CI gates](#ci-gates)
8. [Architecture overview](#architecture-overview)
9. [Contributing](#contributing)

---

## Prerequisites

| Tool | Minimum version | Install |
|---|---|---|
| Node.js | 20 LTS | https://nodejs.org or `nvm use` |
| pnpm | 9.15.0 | `corepack enable && corepack prepare pnpm@9.15.0 --activate` |
| Docker + Compose | 24 / v2 | https://docs.docker.com/get-docker/ |
| Git | 2.40 | system package manager |

Optional (for secret scanning locally):

```sh
brew install gitleaks        # macOS
# or
go install github.com/gitleaks/gitleaks/v8@latest
```

---

## Repository structure

```
canopytrace/
├── apps/
│   ├── ct-api/          # NestJS REST API (Phase 2+)
│   ├── ct-worker/       # Background worker / outbox consumer (Phase 3+)
│   └── ct-web/          # Next.js operator UI (Phase 7+)
├── packages/
│   ├── config-eslint/   # Shared ESLint flat config
│   ├── config-ts/       # Shared tsconfig presets
│   └── shared/          # Shared domain types, constants, utilities
├── infra/
│   ├── docker-compose.yml
│   ├── .env.example
│   ├── dockerfiles/
│   │   ├── Dockerfile.api
│   │   └── Dockerfile.worker
│   └── postgres/init/   # One-time Postgres init scripts
├── docs/                # Architecture docs (see docs/)
├── .github/workflows/   # CI pipeline
├── .gitleaks.toml       # Secret scan rules
├── .prettierrc.json
├── .gitignore
├── package.json         # Root workspace scripts
└── pnpm-workspace.yaml
```

---

## Bootstrap (first-time setup)

### 1 — Clone the repo

```sh
git clone https://github.com/canopytrace/canopytrace.git
cd canopytrace
```

### 2 — Enable correct Node version

```sh
nvm use          # reads .nvmrc → Node 20
# or
node --version   # must be >= 20
```

### 3 — Enable pnpm via Corepack

```sh
corepack enable
corepack prepare pnpm@9.15.0 --activate
```

### 4 — Install all workspace dependencies

```sh
pnpm install
```

This installs dependencies for all packages in the monorepo in one pass.

### 5 — Set up environment variables

```sh
cp infra/.env.example infra/.env
# Open infra/.env and fill in values — see Environment variables section below.
```

> ⚠️ **Never commit `infra/.env`.** It is in `.gitignore`.

### 6 — Start infrastructure services

```sh
cd infra
docker compose up postgres minio -d
```

Postgres will be available at `localhost:5432`.
MinIO console will be available at `http://localhost:9001`.

### 7 — Verify the baseline

```sh
pnpm verify
```

This runs: `format:check → lint → typecheck → test → build` across all packages.
All gates must pass before any feature work begins.

---

## Running locally

### Infrastructure only (recommended during early phases)

```sh
cd infra && docker compose up postgres minio -d
```

### Full stack (once API + worker are implemented)

```sh
cd infra && docker compose up
```

### Individual services

```sh
# API dev server (after Phase 2)
pnpm --filter @canopytrace/ct-api start:dev

# Worker (after Phase 3)
pnpm --filter @canopytrace/ct-worker start

# Web UI (after Phase 7)
pnpm --filter @canopytrace/ct-web dev
```

---

## Available scripts

All scripts run from the **repo root** via `pnpm <script>`.

| Script | What it does |
|---|---|
| `pnpm install` | Install all workspace dependencies |
| `pnpm lint` | ESLint across all packages (max-warnings 0) |
| `pnpm format` | Prettier auto-format across all packages |
| `pnpm format:check` | Prettier check (fails if unformatted — used in CI) |
| `pnpm typecheck` | `tsc --noEmit` across all packages |
| `pnpm test` | Vitest across all packages |
| `pnpm build` | Compile TypeScript across all packages |
| `pnpm audit:deps` | `pnpm audit --prod` — dependency vulnerability scan |
| `pnpm scan:secrets` | gitleaks secret scan (requires gitleaks installed) |
| `pnpm verify` | Full pre-merge check: format + lint + typecheck + test + build |
| `pnpm clean` | Remove all `dist/`, `.next/`, `node_modules/` |

### Run a script in a specific package

```sh
pnpm --filter @canopytrace/ct-api test
pnpm --filter @canopytrace/shared build
```

---

## Environment variables

All environment variables are documented in `infra/.env.example`.

**Required for local dev:**

| Variable | Description |
|---|---|
| `POSTGRES_USER` | Postgres username |
| `POSTGRES_PASSWORD` | Postgres password |
| `POSTGRES_DB` | Postgres database name |
| `MINIO_ROOT_USER` | MinIO admin username |
| `MINIO_ROOT_PASSWORD` | MinIO admin password |
| `JWT_SECRET` | JWT signing secret (`openssl rand -hex 64`) |

**Required for Metrc integration (Phase 4+):**

| Variable | Description |
|---|---|
| `METRC_API_KEY` | Facility Metrc API key |
| `METRC_SOFTWARE_API_KEY` | Software integrator API key |
| `METRC_BASE_URL` | `https://api-sandbox.metrc.com` (sandbox) or production URL |

---

## CI gates

Every PR must pass all 8 CI gates before merge:

| Gate | Tool |
|---|---|
| Format check | Prettier |
| Lint | ESLint (max-warnings 0) |
| Typecheck | `tsc --noEmit` (strict mode) |
| Test | Vitest |
| Build | `tsc` |
| Dependency audit | `pnpm audit --prod` |
| Secret scan | gitleaks |
| Container image scan | Trivy (CRITICAL + HIGH) |

---

## Architecture overview

```
┌─────────────────────────────────────────────┐
│              ct-web (Next.js)               │
│           Operator UI — Phase 7             │
└────────────────────┬────────────────────────┘
                     │ HTTPS
┌────────────────────▼────────────────────────┐
│           ct-api (NestJS)                   │
│   Modular monolith · RBAC · Audit logging   │
│   Every write → DB txn + outbox_event       │
└──────────┬──────────────────────┬───────────┘
           │                      │
    ┌──────▼──────┐      ┌────────▼────────┐
    │  PostgreSQL  │      │  MinIO (S3)     │
    │  (source of  │      │  COAs, evidence │
    │   truth)     │      └─────────────────┘
    └──────┬──────┘
           │ outbox polling
┌──────────▼───────────────────────────────────┐
│            ct-worker                         │
│  Outbox dispatcher · Regulatory sync jobs    │
│  SKIP LOCKED · Idempotent · Retry+backoff    │
└──────────────────────┬───────────────────────┘
                       │
              ┌────────▼────────┐
              │  Metrc API (NY) │
              │  (Phase 4+)     │
              └─────────────────┘
```

**Critical invariants (never bypass):**

1. Every write produces an `outbox_event` — this is the backbone of regulatory sync
2. Schema stabilises before UI explosion
3. Adapters are isolated from domain logic
4. Audit + evidence are not bolted on later

---

## Contributing

1. Branch from `develop`: `git checkout -b feat/your-story-id`
2. Use the agent prompt template in `docs/agent-prompts.md`
3. Run `pnpm verify` before opening a PR
4. All 8 CI gates must be green
5. No `any` without explicit justification and isolation comment
6. No plaintext secrets anywhere in the repo, including test fixtures
7. Every new endpoint must include: request validation, authorization hook, audit logging hook, tests

See `docs/` for detailed architecture decisions and phase plans.
