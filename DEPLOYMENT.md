# Relay Deployment Guide

This guide explains how to deploy Relay using GitHub Actions and various hosting platforms.

## Table of Contents
1. [GitHub Actions Workflows](#github-actions-workflows)
2. [Environment Setup](#environment-setup)
3. [Deployment Platforms](#deployment-platforms)
4. [Local Docker Deployment](#local-docker-deployment)
5. [Production Environment Variables](#production-environment-variables)

---

## GitHub Actions Workflows

### 1. CI Workflow (`ci.yml`)
Runs on every push to `main` and `develop` branches, and on pull requests.

**What it does:**
- Sets up PostgreSQL service
- Installs dependencies
- Generates Prisma client
- Runs database migrations
- Seeds the database
- Runs test suite
- Builds all packages
- Uploads coverage to Codecov

**How to enable:**
- Workflow runs automatically on push/PR
- Optional: Set up Codecov by adding `CODECOV_TOKEN` secret

### 2. Docker Build Workflow (`docker-build.yml`)
Builds and pushes Docker images for each service to GitHub Container Registry (GHCR).

**Services built:**
- `api` - Express API server
- `worker` - Job processing worker
- `web` - React dashboard

**How to enable:**
- Workflow runs automatically on push to `main` branch
- No additional secrets required (uses `GITHUB_TOKEN`)
- Images are pushed to `ghcr.io/<owner>/<repo>-<service>`

**Example image tags:**
```
ghcr.io/prateek-crypto/relay-working-mvp-submission-api:main
ghcr.io/prateek-crypto/relay-working-mvp-submission-api:v1.0.0
ghcr.io/prateek-crypto/relay-working-mvp-submission-api:sha-abc123
```

### 3. Deploy Workflow (`deploy.yml`)
Handles deployment to various hosting platforms.

**Deployment options (select one):**
- **Railway** (recommended for simplicity)
- **Render** 
- **Fly.io**
- **Heroku**

**How to use:**
1. Uncomment your chosen platform in `deploy.yml`
2. Add required secrets (see platform-specific sections)
3. Push to `main` or manually trigger via GitHub Actions UI

---

## Environment Setup

### Step 1: Add GitHub Secrets
Go to your repository Settings → Secrets and variables → Actions

**For CI/CD:**
```
CODECOV_TOKEN          # Optional: For coverage uploads
```

**For Docker Registry (auto-included):**
- Uses `GITHUB_TOKEN` automatically

**For deployment (choose based on platform):**

#### Railway
```
RAILWAY_TOKEN          # From Railway CLI: railway login
```

#### Render
```
RENDER_API_KEY         # From Render dashboard
RENDER_SERVICE_ID      # From Render service settings
```

#### Fly.io
```
FLY_API_TOKEN          # From flyctl: flyctl auth login
```

#### Heroku
```
HEROKU_API_KEY         # From Heroku account settings
HEROKU_EMAIL           # Your Heroku email
HEROKU_APP_NAME        # Your Heroku app name
```

### Step 2: Create Environment Secrets
For production deployments, create environment-specific secrets:

**Repository Settings → Environments → Production**

Add these secrets:
```
DATABASE_URL           # PostgreSQL connection string
JWT_SECRET            # Secure random JWT secret
JWT_EXPIRES_IN        # e.g., "7d"
POSTGRES_PASSWORD     # Database password
```

---

## Deployment Platforms

### Option 1: Railway (Recommended)

**Advantages:**
- Simple deployment
- Built-in PostgreSQL
- Good free tier
- Easy environment management

**Setup:**
1. Create Railway account: https://railway.app
2. Create new project
3. Add PostgreSQL service
4. Get Railway token:
   ```bash
   railway login
   railway token
   ```
5. Add `RAILWAY_TOKEN` to GitHub secrets
6. Uncomment Railway section in `deploy.yml`
7. Push to `main` or manually trigger deployment

**Railway-specific files:**
- No additional files needed (uses `docker-compose.prod.yml`)

---

### Option 2: Render

**Advantages:**
- Free tier available
- Native Node.js support
- PostgreSQL included
- Good dashboard

**Setup:**
1. Create Render account: https://render.com
2. Create PostgreSQL database
3. Create three Web Services:
   - API
   - Worker  
   - Web (frontend)
4. Get API key and service IDs from dashboard
5. Add secrets to GitHub
6. Uncomment Render section in `deploy.yml`
7. Push to `main`

---

### Option 3: Fly.io

**Advantages:**
- Global deployment
- Good performance
- Competitive pricing
- Built-in PostgreSQL

**Setup:**
1. Install flyctl: https://fly.io/docs/getting-started/
2. Create app:
   ```bash
   fly launch --generator-only
   ```
3. Get token:
   ```bash
   flyctl auth login
   flyctl auth token
   ```
4. Add `FLY_API_TOKEN` to GitHub secrets
5. Create `fly.toml` in repository:
   ```toml
   app = "relay-mvp"
   primary_region = "iad"
   
   [build]
     builder = "docker"
   
   [env]
     DATABASE_URL = "postgresql://..."
     JWT_SECRET = "..."
   ```
6. Uncomment Fly.io section in `deploy.yml`
7. Push to `main`

---

### Option 4: Heroku

**Advantages:**
- Simple deployment
- Good documentation
- Easy scaling

**Setup:**
1. Create Heroku app:
   ```bash
   heroku create relay-mvp
   ```
2. Add PostgreSQL:
   ```bash
   heroku addons:create heroku-postgresql:hobby-dev
   ```
3. Get credentials:
   ```bash
   heroku auth:token
   ```
4. Add secrets to GitHub
5. Uncomment Heroku section in `deploy.yml`
6. Push to `main`

---

## Local Docker Deployment

Deploy locally using Docker Compose:

```bash
# Set environment variables
export DATABASE_URL="postgresql://postgres:postgres@postgres:5432/relay"
export JWT_SECRET="your-secret-here"
export POSTGRES_PASSWORD="postgres"
export POSTGRES_USER="postgres"
export POSTGRES_DB="relay"

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Stop services
docker-compose -f docker-compose.prod.yml down
```

**Services will be available at:**
- API: http://localhost:4000
- Web: http://localhost:5173
- Database: localhost:5432

---

## Production Environment Variables

### Required Variables

**Database:**
```bash
DATABASE_URL="postgresql://user:password@host:5432/relay?schema=public"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="secure-password"
POSTGRES_DB="relay"
```

**JWT:**
```bash
JWT_SECRET="generate-a-secure-random-string-here"
JWT_EXPIRES_IN="7d"
```

**Server:**
```bash
NODE_ENV="production"
API_PORT="4000"
```

**Worker:**
```bash
WORKER_NAME="worker-1"
WORKER_POLL_INTERVAL_MS="3000"
WORKER_HEARTBEAT_INTERVAL_MS="8000"
WORKER_CLAIM_BATCH_SIZE="5"
WORKER_LEASE_SECONDS="30"
```

**Frontend:**
```bash
VITE_API_BASE_URL="https://api.your-domain.com/api/v1"
```

### Generate Secure JWT Secret

```bash
# On macOS/Linux
openssl rand -base64 32

# On Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object {[byte](Get-Random -Maximum 256)}))
```

---

## Monitoring & Logs

### GitHub Actions
- Dashboard: GitHub → Actions tab
- Workflow runs: Shows build status, logs, artifacts
- Deployment status: Shows environment history

### Container Logs

**Docker Compose:**
```bash
docker-compose -f docker-compose.prod.yml logs -f api
docker-compose -f docker-compose.prod.yml logs -f worker
docker-compose -f docker-compose.prod.yml logs -f web
```

**Platform-specific:**
- Railway: `railway logs -s api`
- Render: Dashboard → Service → Logs
- Fly.io: `flyctl logs`
- Heroku: `heroku logs --tail`

---

## Troubleshooting

### Database connection fails
- Check `DATABASE_URL` format
- Verify database is running: `psql <DATABASE_URL>`
- Check environment variables are set

### Docker build fails
- Ensure `Dockerfile.api`, `Dockerfile.worker`, `Dockerfile.web` exist
- Check Node.js version (must be ≥18)
- Verify all dependencies in `package.json` are correct

### Deployment fails
- Check GitHub Actions logs for error details
- Verify all required secrets are set
- Ensure platform credentials are valid
- Check service quotas/limits on deployment platform

### Worker not processing jobs
- Verify worker container is running
- Check PostgreSQL connection
- Review worker logs for errors
- Ensure WORKER_NAME is unique

---

## CI/CD Pipeline Overview

```
Push to GitHub
    ↓
CI Workflow (test, build)
    ↓
Docker Build Workflow (build images)
    ↓
Deploy Workflow (deploy to platform)
    ↓
Production
```

---

## Next Steps

1. Choose a deployment platform (start with Railway if unsure)
2. Follow the platform-specific setup
3. Add required secrets to GitHub
4. Enable the appropriate workflow
5. Push to `main` branch
6. Monitor deployment in GitHub Actions tab

For more information:
- Railway docs: https://docs.railway.app
- Render docs: https://render.com/docs
- Fly.io docs: https://fly.io/docs
- Heroku docs: https://devcenter.heroku.com
