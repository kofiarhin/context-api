# Context API

Context API is a public, read-only Node.js and Express service for structured, reusable context used by ChatGPT projects, coding agents, Architect workflows, the Ideas Hub, and future applications.

The API stores context in separate MongoDB-backed domains and exposes only the records a client needs for a task.

## Security status

The API is intentionally unauthenticated and read-only.

Treat every stored record as publicly readable. Do not store secrets, passwords, access tokens, private keys, raw chat history, chain-of-thought, private customer data, or sensitive personal context. Rate limiting, input validation, security headers, bounded payloads, and read-only routing reduce abuse risk but do not provide access control.

## Requirements

- Node.js 24 LTS
- npm 11
- MongoDB 8 compatible service, with MongoDB Atlas recommended for production

## Setup

```bash
npm install
cp .env.example .env
```

Update `.env` with a local MongoDB connection string:

```env
NODE_ENV=development
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/context_api
LOG_LEVEL=info
CORS_ORIGINS=http://localhost:5173
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

Never commit the populated `.env` file.

## Commands

```bash
npm start             # start the API
npm run dev           # start with Node watch mode
npm test              # run Jest tests serially
npm run test:watch    # run Jest in watch mode
npm run test:coverage # run tests with coverage
npm run lint          # run ESLint
npm run lint:fix      # apply safe ESLint fixes
npm run format        # format files with Prettier
npm run format:check  # verify formatting
npm run check         # lint, formatting check, and tests
npm run data:extract  # extract canonical Ideas Hub project seed data
npm run seed          # idempotently seed all domains
npm run seed:reset    # explicitly reset and reseed all domains
```

## Run locally

Start MongoDB, seed representative context, then start the service:

```bash
npm run seed
npm start
```

The default local URL is `http://localhost:4000`.

## Production deployment

The repository includes:

- a Heroku `Procfile`
- an `app.json` manifest
- Node.js 24 and npm 11 runtime declarations
- production environment validation
- graceful `SIGTERM` shutdown
- MongoDB-first startup
- health and readiness behavior
- explicit public or allowlisted CORS configuration
- rate limiting and security headers
- GitHub Actions verification

For complete MongoDB Atlas and Heroku setup, seeding, verification, rollback, and operational commands, see [`docs/HEROKU.md`](docs/HEROKU.md).

For a public browser-consumable deployment, set:

```env
CORS_ORIGINS=*
```

For restricted browser access, use a comma-separated origin allowlist instead. Non-browser clients can call the API in either mode.

## API

Health endpoint:

```http
GET /health
```

Versioned read endpoints:

```text
GET /api/v1/profile
GET /api/v1/coding-conventions
GET /api/v1/coding-conventions/:key
GET /api/v1/projects
GET /api/v1/projects/:projectId
GET /api/v1/tasks
GET /api/v1/tasks/:taskId
GET /api/v1/instruction-sets
GET /api/v1/instruction-sets/:key
GET /api/v1/ideas-hub
GET /api/v1/ideas-hub/:section
GET /api/v1/glossary
GET /api/v1/glossary/:term
GET /api/v1/learnings
GET /api/v1/learnings/:learningId
```

Collections support bounded pagination and their documented filters. Unknown query parameters and invalid route parameters are rejected.

### Success envelope

```json
{
  "data": [],
  "meta": {
    "count": 0,
    "version": "v1"
  }
}
```

### Error envelope

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested resource was not found.",
    "details": []
  },
  "meta": {
    "correlationId": "generated-id",
    "version": "v1"
  }
}
```

## Seed behavior

The default seed command validates records before writing, upserts by stable domain identifiers, reports inserted, updated, unchanged, and failed counts, and exits non-zero on validation or write failure.

The default command does not drop collections. Reset behavior is only available through the explicit `seed:reset` command. Production seeding is deliberately an explicit one-off operation rather than an automatic Heroku release task.

## Documentation

- Product requirements: [`docs/PRD.md`](docs/PRD.md)
- Technical specification: [`docs/SPEC.md`](docs/SPEC.md)
- Implementation plan: [`docs/PLAN.md`](docs/PLAN.md)
- Heroku deployment: [`docs/HEROKU.md`](docs/HEROKU.md)
