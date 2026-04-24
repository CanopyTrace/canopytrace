# Secret Handling

## Rules

1. **Never commit a real secret.** `.env` files are in `.gitignore` and must stay there.
2. **Placeholder text.** All `.env.example` files use `change_me_never_commit` for any value that would be a secret in production. Empty strings (`KEY=`) indicate optional credentials (e.g. Metrc sandbox keys).
3. **No hardcoded fallbacks.** Application code must not fall back to insecure hardcoded strings when env vars are missing. Fail loudly at startup instead.

---

## Local development

The compose stack (`infra/docker-compose.yml`) reads from `infra/.env`.

```bash
cp infra/.env.example infra/.env
# edit infra/.env — fill in real passwords for local postgres/minio
docker compose -f infra/docker-compose.yml up
```

Each app also has its own `.env.example` documenting the runtime variables it
expects. When running an app directly (outside compose) copy the relevant file
to `.env.local`:

```bash
cp apps/ct-api/.env.example apps/ct-api/.env.local
# edit apps/ct-api/.env.local
```

**Generate secrets locally:**

```bash
# JWT secret (64 hex chars)
openssl rand -hex 64

# NextAuth secret (32 hex chars)
openssl rand -hex 32
```

---

## CI / GitHub Actions

Secrets are stored as [GitHub Actions secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions) and injected as environment variables at runtime. No secret is baked into a Docker image or committed to the repository.

Required repository secrets:

| Secret | Used by |
|--------|---------|
| `DATABASE_URL` | ct-api, ct-worker |
| `JWT_SECRET` | ct-api |
| `METRC_API_KEY` | ct-api, ct-worker |
| `METRC_SOFTWARE_API_KEY` | ct-api, ct-worker |
| `MINIO_ACCESS_KEY` | ct-api, ct-worker |
| `MINIO_SECRET_KEY` | ct-api, ct-worker |
| `GITLEAKS_LICENSE` | scan-secrets CI job |

---

## Secret scanning

**Scan git history (runs in CI and locally):**

```bash
pnpm scan:secrets
# equivalent: gitleaks detect --source .
```

This scans all commits reachable from HEAD. Gitignored files (including
`infra/.env`) are not scanned.

**Scan staged changes before committing:**

```bash
gitleaks protect --staged --source .
```

Consider adding this as a pre-commit hook.

**CI:** The `scan-secrets` job in `.github/workflows/ci.yml` runs on every push
and pull request using `gitleaks/gitleaks-action@v2`, which requires
`GITLEAKS_LICENSE` in repository secrets for team use.

---

## Gitleaks configuration

`.gitleaks.toml` extends the default ruleset and adds two domain-specific rules:

- **metrc-api-key** — catches Metrc credentials accidentally included inline
- **jwt-secret-inline** — catches JWT secrets assigned directly in code

The `[allowlist]` section exempts all `*.env.example` files (which contain only
placeholders) and suppresses matches for the literal string `change_me_never_commit`.

---

## What belongs where

| Location | What goes there |
|----------|----------------|
| `infra/.env` | Local docker-compose secrets (gitignored) |
| `apps/*/.env.local` | Local per-app overrides (gitignored) |
| `infra/.env.example` | Documented placeholders for the compose stack |
| `apps/*/.env.example` | Documented placeholders for each app's runtime env |
| GitHub Actions secrets | CI/CD and production credentials |
| Secrets manager (future) | Production secrets at runtime (HashiCorp Vault, AWS Secrets Manager) |
