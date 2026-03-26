"""Weekly SEO orchestrator — keyword tracking report via Claude + MCP tool."""

import anthropic
import os
import json
from dotenv import load_dotenv

load_dotenv()

# Set to True to skip all write operations (dry run mode)
DRY_RUN = os.environ.get("DRY_RUN", "false").lower() in ("1", "true", "yes")

KEYWORD_TRACKER_URL = "https://seo-agent-test-new.up.railway.app/sse"

def run_weekly_tasks(site_id: int) -> None:
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    print(f"[weekly] Starting weekly keyword report for site_id={site_id}")
    if DRY_RUN:
        print("[weekly] DRY_RUN=true — skipping all write operations")

    # Define the keyword-tracker MCP server as a tool source
    mcp_server = {
        "type": "url",
        "url": KEYWORD_TRACKER_URL,
        "name": "keyword-tracker",
    }

    prompt = f"""You are an SEO analyst. Use the keyword-tracker tools to generate a
weekly keyword performance report for site_id={site_id}.

Please:
1. Call get_rankings with site_id={site_id} and these keywords:
   ["seo tools", "keyword tracker", "rank tracking", "search console"]
2. Call get_top_movers with site_id={site_id}, threshold=3, direction="both"
3. Call get_rank_velocity for the top-performing keyword with window_days=14

Then summarise:
- Which keywords improved this week?
- Which keywords declined?
- What is the velocity trend for the top keyword?
- Key action items for next week

{"NOTE: This is a DRY RUN. Do not write any reports or send any notifications." if DRY_RUN else ""}
"""

    print("[weekly] Sending prompt to Claude (claude-sonnet-4-5)...")

    response = client.beta.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=8192,
        mcp_servers=[mcp_server],
        messages=[{"role": "user", "content": prompt}],
        betas=["mcp-client-2025-04-04"],
    )

    print("\n" + "=" * 60)
    print("WEEKLY KEYWORD REPORT")
    print("=" * 60)

    for block in response.content:
        if hasattr(block, "text"):
            print(block.text)
        elif hasattr(block, "type") and block.type == "tool_use":
            print(f"\n[tool_call] {block.name}({json.dumps(block.input, indent=2)})")
        elif hasattr(block, "type") and block.type == "tool_result":
            print(f"\n[tool_result] {block.content}")

    print("=" * 60)
    print(f"[weekly] Report complete. Stop reason: {response.stop_reason}")


if __name__ == "__main__":
    site_id = 1
    run_weekly_tasks(site_id)
