# Security Policy

## Vulnerability remediation expectations

| Severity | Response time | Release impact |
|----------|--------------|----------------|
| **CRITICAL** | Patch within 24 hours | Blocks all releases |
| **HIGH** | Patch within 2 weeks | Blocks the current release unless explicitly accepted |
| **MEDIUM** | Patch within the next sprint | Non-blocking; tracked via Dependabot PR |
| **LOW / INFORMATIONAL** | Best-effort | Non-blocking |

These expectations apply to both npm dependency vulnerabilities (`pnpm audit`) and container image CVEs (Trivy scan).

---

## CI enforcement

The `scan-images` job in `.github/workflows/ci.yml` fails on **CRITICAL** and **HIGH** container CVEs (`exit-code: 1`). A failing scan blocks merge.

The `audit-deps` job runs `pnpm audit --prod --audit-level moderate` and fails on MODERATE or higher npm advisories.

---

## Accepting a known vulnerability

If a vulnerability cannot be patched immediately (e.g., no fix available upstream):

1. Open a tracking issue with the CVE ID, affected package, and reason no fix exists.
2. Add a `.trivyignore` entry with the CVE ID and an expiry date no more than 30 days out.
3. Get a second reviewer to approve the exception.

Remove the ignore entry as soon as a patched version is available.

---

## Automated updates

[Dependabot](../.github/dependabot.yml) opens weekly PRs for outdated npm packages, GitHub Actions, and Docker base images. Dependency update PRs run the full CI suite before merge.

---

## Reporting a security issue

Do not open a public GitHub issue for security vulnerabilities. Email **security@canopytrace.com** with a description and reproduction steps. We will acknowledge within 48 hours.
