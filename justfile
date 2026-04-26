# Install dependencies
install:
    pnpm install

# Start dev server
dev:
    pnpm dev

# Run unit/integration tests with coverage
test:
    pnpm exec vitest run --coverage

# Run E2E tests
e2e:
    pnpm exec playwright test

# Lint
lint:
    pnpm exec eslint . && pnpm exec prettier --check .

# Type check
typecheck:
    pnpm tsc --noEmit

# Full CI suite
check: lint typecheck test e2e

# Generate DB migration
migrate-gen:
    pnpm exec drizzle-kit generate

# Run DB migrations
migrate:
    pnpm exec drizzle-kit migrate

# Drizzle Studio
db-studio:
    pnpm exec drizzle-kit studio
