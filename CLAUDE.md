## Project: Claude AI SEO Agent System
## Purpose: Autonomous SEO platform — 18 MCP servers + orchestrators + dashboard

## Architecture
- 18 MCP servers in src/mcp-servers/ (TypeScript, Anthropic MCP SDK)
- 4 Python orchestrators in src/orchestrators/ (Anthropic Python SDK)
- Next.js Operator Dashboard in src/dashboard/ (React, Tailwind, shadcn/ui, Prisma)
- PostgreSQL database for dashboard state
- GitHub Actions for scheduling (daily, weekly, monthly)

## Key Conventions
- All MCP servers accept site_id as a parameter for multi-site support
- Credentials stored as env vars: GSC_OAUTH_SITE_1, GBP_OAUTH_SITE_1, etc.
- Never hardcode site-specific values — always look up from config sheet or env
- Every MCP tool must include error handling and return structured JSON
- All servers run on Railway via SSE transport on port 3000

## Current Phase
Update this line as you move through phases:
Phase 1 — Building keyword-tracker MCP server

## MCP Template
All new servers copy from src/mcp-template/server.ts

## API Models
- Development: claude-sonnet-4-5
- Production: claude-opus-4-5

## Sites Config
Site IDs: 1=https://lifecircle.in
(Update this list as new sites are added via the config sheet)
