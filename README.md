# Juice Bot

A Discord RPG battle bot scaffold with deterministic encounter state, PostgreSQL persistence, and a clean domain layer.

## Setup

1. Copy `.env.example` to `.env`.
2. Set `DISCORD_TOKEN`, `CLIENT_ID`, and `DATABASE_URL`.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Generate Prisma client:
   ```bash
   npm run prisma:generate
   ```
5. Run the first migration:
   ```bash
   npm run prisma:migrate
   ```
6. Start the bot in development:
   ```bash
   npm run dev
   ```

`GUILD_ID` is no longer required. Commands are registered globally, and the bot
automatically creates a campaign configuration for each guild on first use.

## Project structure

- `src/discord` - Discord command and interaction adapters
- `src/application` - Use-case services and DTOs
- `src/domain` - Pure domain and combat logic
- `src/infrastructure` - Database and scheduling support
- `src/content` - Versioned game content and definitions
- `src/observability` - Logging and audit helpers
- `prisma` - Prisma schema and migrations

## Commands

- `npm run build` - compile TypeScript
- `npm run dev` - run in development mode
- `npm run format` - format source files
- `npm run lint` - lint source files

## Notes

- This scaffold uses PostgreSQL as the authoritative persist layer.
- The first release is intended to support M0 foundation and establish the encounter/state machine architecture.
