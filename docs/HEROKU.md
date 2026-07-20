# Heroku Deployment

This service is designed to run as a public, read-only Heroku web process backed by MongoDB Atlas.

## Prerequisites

- A Heroku account and Heroku CLI
- A MongoDB Atlas cluster
- An Atlas database user with access only to the Context API database
- Atlas network access configured for Heroku connectivity

The API is intentionally unauthenticated. Store only records that are safe to expose publicly.

## Create and configure the app

```bash
heroku create <app-name>
heroku stack:set heroku-24 -a <app-name>
```

Set required config vars:

```bash
heroku config:set \
  NODE_ENV=production \
  MONGODB_URI='mongodb+srv://<user>:<password>@<cluster>/<database>?retryWrites=true&w=majority' \
  CORS_ORIGINS='*' \
  LOG_LEVEL=info \
  RATE_LIMIT_WINDOW_MS=900000 \
  RATE_LIMIT_MAX=100 \
  -a <app-name>
```

Do not set `PORT`; Heroku provides it at runtime.

For a browser allowlist instead of public browser access, replace `*` with comma-separated origins:

```bash
heroku config:set CORS_ORIGINS='https://example.com,https://admin.example.com' -a <app-name>
```

## Deploy

Connect the GitHub repository in the Heroku dashboard or deploy with Git:

```bash
git push heroku main
```

The root `Procfile` declares the web process. Heroku installs dependencies and runs `npm start`.

## Seed the database

Seeding is deliberately not part of the release phase. A config-var change or rollback creates a new Heroku release, so automatic release seeding would perform database writes more often than intended.

Run the idempotent seed command explicitly after the first deployment and whenever approved seed data changes:

```bash
heroku run npm run seed -a <app-name>
```

Use reset seeding only when destructive replacement is explicitly intended:

```bash
heroku run npm run seed:reset -a <app-name>
```

## Verify

```bash
heroku ps -a <app-name>
heroku logs --tail -a <app-name>
curl https://<app-name>.herokuapp.com/health
curl https://<app-name>.herokuapp.com/api/v1/projects
```

A healthy deployment returns HTTP 200 from `/health`. The endpoint returns HTTP 503 when MongoDB is unavailable.

## Atlas production safeguards

- Use a dedicated database user and database.
- Generate a strong password and store it only in Heroku Config Vars.
- Enable Atlas backups appropriate to the selected tier.
- Review Atlas network access and activity regularly.
- Never commit a populated `.env` file or connection string.

## Operations

Scale the web process:

```bash
heroku ps:scale web=1 -a <app-name>
```

Restart after an operational change:

```bash
heroku restart -a <app-name>
```

Rollback when necessary:

```bash
heroku releases -a <app-name>
heroku rollback <release> -a <app-name>
```

The server handles Heroku's `SIGTERM`, stops accepting new traffic, closes active HTTP work, disconnects MongoDB, and exits with a bounded timeout.
