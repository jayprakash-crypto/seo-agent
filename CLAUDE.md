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
Phase 10 — Operator Dashboard complete (Next.js 14 + shadcn/ui + Prisma + NextAuth TOTP 2FA + Socket.io real-time approvals + Railway deployment)

## Dashboard Architecture (Phase 10)
- Next.js 14 app router in src/dashboard/ — deployed to Vercel
- Approvals API (Express + Socket.io) in src/api/ — deployed to Railway (port 3002)
- WebSocket relay server in src/ws-server/ — deployed to Railway (port 3002)
- 4 panels: Approval Queue, Alert Feed, Site Overview, Config Manager
- Auth: NextAuth.js credentials + TOTP 2FA (otplib), protected by middleware.ts
- Real-time: Socket.io client with reconnection:true, reconnectionAttempts:Infinity

## MCP Template
All new servers copy from src/mcp-template/server.ts

## API Models
- Development: claude-sonnet-4-5
- Production: claude-opus-4-5

## Sites Config
Site IDs: 1=https://lifecircle.in
