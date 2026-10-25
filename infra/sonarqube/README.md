# Shared SonarQube (self-hosted, optional)

The project is analyzed on **SonarQube Cloud** (see the `sonarqube` job in `.github/workflows/ci.yml`).
This stack is the self-hosted alternative, for code that must not leave your servers.

A self-hosted SonarQube (Community Build, free) with its own Postgres, meant to serve **every app**
on the machine or server, not just Semver Sage: each repo is a separate project with its own key,
dashboard and quality gate.

```sh
docker compose -f infra/sonarqube/docker-compose.yml up -d   # or: npm run sonar:up
```

Open http://localhost:9000. The first login is `admin` / `admin` and SonarQube asks for a new
password (12+ characters). Data lives in Docker volumes, so it survives restarts and upgrades.

**Linux servers** need, once (and in `/etc/sysctl.conf` to persist):

```sh
sudo sysctl -w vm.max_map_count=524288
sudo sysctl -w fs.file-max=131072
```

Set `SONAR_DB_PASSWORD` (and `SONAR_PORT` if 9000 is taken) in the environment before the first start
on a server.

## Analyzing a project

1. In SonarQube: **My Account > Security > Generate token** (type *Global Analysis Token* can
   analyze any project; a *Project Analysis Token* is limited to one).
2. Give the repo a `sonar-project.properties` with a unique `sonar.projectKey`.
3. Run the scanner. Here: put `SONAR_HOST_URL` and `SONAR_TOKEN` in `.env`, then `npm run sonar`
   (runs the tests with coverage, merges the lcov reports, runs `sonarsource/sonar-scanner-cli` in
   Docker). Other repos can reuse `tools/sonar-scan.mjs` or run the scanner image directly.

## CI

The `sonarqube` job in `.github/workflows/ci.yml` runs when the repository secrets `SONAR_HOST_URL`
and `SONAR_TOKEN` exist, and fails when the quality gate fails. GitHub-hosted runners must be able to
reach the server, so either expose it (HTTPS behind a reverse proxy) or run the job on a self-hosted
runner on the same server.

## Limits of the Community Build

- Analyzes the **main branch** of each project; branch and pull request analysis (and PR comments)
  are paid editions.
- Quality gates still apply to the main branch, and `sonar.qualitygate.wait=true` makes the scan
  fail when the gate fails.
