# Contributing to Mainstreetly

Thank you for your interest in contributing to Mainstreetly!

## Development Setup

1. **Prerequisites**: Node.js 20+, pnpm 9+, PostgreSQL with PostGIS
2. **Clone and install**:
   ```bash
   git clone https://github.com/mainstreetly/mainstreetly.git
   cd mainstreetly
   pnpm install
   ```
3. **Set up environment**: Copy `.env.example` to `.env` and fill in your `DATABASE_URL`
4. **Run migrations**: `pnpm db:push`
5. **Seed data**: `pnpm seed:osm`
6. **Start MCP server**: `pnpm dev`

## Branch Workflow

- `main` — protected, always deployable
- `dev` — integration branch
- Feature branches: `feature/description` off `dev`
- Bug fixes: `fix/description` off `dev`

## Pull Requests

- All PRs require review before merge
- Squash merge into `dev`
- Include description of what changed and why

## License

By contributing, you agree that your contributions will be licensed under the BSL 1.1 license.
