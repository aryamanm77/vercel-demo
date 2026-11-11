# QBank Vercel Demo (Isolated Cloud Preview Wrapper)

Separate deployment wrapper allowing **QBank (`qbank-standalone`)** to run cleanly on **Vercel Container Functions (`Dockerfile.vercel`)** backed by a managed **Vercel Marketplace Postgres** database, without modifying or coupling cloud deployment artifacts into the offline-LAN codebase (`../exam-bank-system`).

---

## Architecture Choice

`qbank-vercel-demo` packages the pre-built `app/qbank-standalone-1.0.0.jar` alongside a zero-dependency Java 17 [`VercelLauncher`](src/VercelLauncher.java) entrypoint inside a 2-stage `eclipse-temurin:17` Alpine OCI image (`Dockerfile.vercel`):

- **Fast, reproducible remote Vercel builds**: Vercel builds the Docker image directly without needing access to private Maven repositories or running multi-module Maven builds on every preview deploy.
- **Native Vercel Postgres translation**: `VercelLauncher` automatically translates standard `DATABASE_URL` / `POSTGRES_URL` (`postgres://` or `postgresql://`) environment variables injected by Vercel Marketplace Postgres providers (**Neon**, **Supabase**, **Prisma Postgres**) into PgJDBC URLs with SSL enforced and credentials kept out of JVM command-line arguments.
- **Stateless container defaults**: Sets `PORT=${PORT:-80}`, `server.ssl.enabled=false` (TLS handled by Vercel edge), `qbank.storage-dir=/tmp/qbank-storage`, and `qbank.backup.enabled=false` (since Vercel containers scale to zero and retain no container disk state).

---

## Deploying to Vercel

### 1. Generate Two 256-Bit Keys

Run either command locally and save the two distinct Base64 strings cleanly:

- **PowerShell**:
  ```powershell
  1..2 | ForEach-Object { $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b) }
  ```
- **Bash / OpenSSL**:
  ```bash
  openssl rand -base64 32
  openssl rand -base64 32
  ```

### 2. Provision Vercel Project & Marketplace Postgres

From `qbank-vercel-demo/` (using Git integration or Vercel CLI):

```bash
# Link project (creates .vercel/)
vercel link

# Add a managed Postgres database from Vercel Marketplace (Neon recommended)
vercel integration add neon --no-claim

# Pull environment variables locally if testing
vercel env pull --yes
```

Configure the remaining environment variables in **Vercel Project Settings -> Environment Variables** (or `vercel env add`):
- `QBANK_ENCRYPTION_KEY`: first 32-byte Base64 string
- `QBANK_SIGNING_KEY`: second 32-byte Base64 string
- *(Optional)* `QBANK_ENGINE_TOKEN`: random token if calling `/qbank/api/v1/engine/**`

*(Never remove/rotate `QBANK_ENCRYPTION_KEY` once questions or frozen papers exist in Postgres, or existing AES-GCM ciphertexts cannot decrypt.)*

### 3. Deploy

Push this standalone folder as its own Git repository connected to Vercel (Vercel automatically detects `Dockerfile.vercel` and `vercel.json`), or run:

```bash
vercel deploy --prod
```

Open `https://<your-project>.vercel.app/` (redirects `/` -> `/qbank/index.html`) to run the first-run **ADMIN** setup wizard, and `/qbank/student.html` for candidate sign-in.

---

## Local Verification (Java 17 Only, Zero Docker Required)

Run the included launcher & live boot smoke check (`VercelLauncherTest`):

```powershell
mkdir out
javac --release 17 -d out src\VercelLauncher.java test\VercelLauncherTest.java
java -cp out VercelLauncherTest
```

To test locally against an ephemeral `/tmp` H2 database:

```powershell
$env:PORT="8085"
$env:QBANK_ENCRYPTION_KEY="<base64-key-1>"
$env:QBANK_SIGNING_KEY="<base64-key-2>"
$env:QBANK_VERCEL_DEMO_EPHEMERAL_H2="true"
java -cp out VercelLauncher
```

Refresh `app/qbank-standalone-1.0.0.jar` after updating `../exam-bank-system` by running `scripts\sync-jar.bat` (or `./scripts/sync-jar.sh`).

---

## Demo Constraints to Know

- **Scale-to-zero cold starts**: Preview containers scale to zero after 30s idle (5 min in production); the first wake request incurs JVM + Flyway + Spring startup latency (~10–25s).
- **Request body limit (4.5 MB)**: Vercel Functions cap HTTP request/response bodies at 4.5 MB, so keep demo Excel uploads well below 4.5 MB.
- **No container-disk persistence**: Stored user accounts, question banks, exams, and audit logs persist in your external Marketplace Postgres database; in-memory staff login rate-limiting counters are per warm container instance and local `.qbank.enc` scheduled snapshots are disabled (`qbank.backup.enabled=false`).
- **Strictly for demo/evaluation**: Use `../exam-bank-system` on an isolated LAN per its `RUNBOOK.md` for actual high-stakes exams.
