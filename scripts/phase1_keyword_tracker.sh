#!/bin/bash
# phase1_keyword_tracker.sh
# Run: bash scripts/phase1_keyword_tracker.sh
set -e # Exit on any error
LOG=logs/phase1_$(date +%Y%m%d_%H%M).log
mkdir -p logs
echo '================================================' | tee -a $LOG
echo 'PHASE 1: Keyword Tracker — $(date)' | tee -a $LOG
echo '================================================' | tee -a $LOG
# Write the structured prompt to a temp file
cat > /tmp/phase1_prompt.txt << 'PROMPT'
Read CLAUDE.md for full project context. You are building Phase 1 of the SEO agent.
TASK LIST — complete every item before stopping:
1. Build the keyword-tracker MCP server at src/mcp-servers/keyword-tracker/server.ts
Follow the template in src/mcp-template/server.ts exactly.
Implement exactly 4 tools:
- get_rankings(site_id, keywords[]) — calls Google Search Console API,
returns position, clicks, impressions per keyword
- get_ranking_history(site_id, keyword, days) — returns position trend array
- get_top_movers(site_id, threshold, direction) — returns keywords that moved
up or down by more than threshold positions
- get_rank_velocity(site_id, keyword, window_days) — returns rate of change
Use env var GSC_OAUTH_SITE_{site_id} for Google auth (service account JSON).
Every tool must return structured JSON and handle errors gracefully.
2. Create package.json for keyword-tracker with: start, build, dev, test scripts.
Install: @modelcontextprotocol/sdk express googleapis
Install dev: typescript @types/node @types/express ts-node jest
3. Write Jest tests at tests/keyword-tracker.test.ts:
- Mock all GSC API calls (never call real APIs in tests)
- Test all 4 tools with site_id=1
- Test success response with realistic mock data
- Test API timeout handling
- Test invalid site_id rejection
- Test missing required parameters
Run tests and fix all failures before continuing.
4. Create src/orchestrators/weekly.py — a stub that:
- Initialises the Anthropic Python SDK
- Calls claude-sonnet-4-5 with a prompt to request a keyword report
- Passes keyword-tracker as an MCP tool the model can call
- Prints the Claude response to console
- Includes DRY_RUN flag that skips all write operations
5. Create .github/workflows/weekly.yml — GitHub Actions workflow:
- Triggers: cron '0 8 * * 1' (Monday 8am UTC) + workflow_dispatch
- Uses python 3.11
- Reads secrets: ANTHROPIC_API_KEY, GSC_OAUTH_SITE_1
- Runs: python src/orchestrators/weekly.py
6. Create railway.toml for keyword-tracker service deployment.
7. Create docs/api-reference.md documenting all 4 tools with:
parameter types, return format, and example JSON responses.
8. Run npm test in keyword-tracker directory. Fix all failures.
Output a final summary of: files created, tests passing, tests failing.
DONE CRITERIA: All 4 tools implemented. All tests passing. Orchestrator stub runs.
GitHub Actions workflow file exists. Do not stop until all criteria are met.
PROMPT

# Execute Claude Code in headless mode with the prompt
claude --dangerously-skip-permissions -p "$(cat /tmp/phase1_prompt.txt)" 2>&1 | tee -a $LOG
echo 'PHASE 1 COMPLETE — $(date)' | tee -a $LOG