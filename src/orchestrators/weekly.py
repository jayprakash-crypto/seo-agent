"""Weekly orchestrator — asks Claude for a keyword + CMS audit using the Anthropic Python SDK."""

import os
import time
import json
import urllib.request
from pathlib import Path

import anthropic
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

BASE_URL = "https://seo-agent-production-e243.up.railway.app"
DRY_RUN  = os.getenv("DRY_RUN", "true").lower() == "true"

SITE_IDS = [1]

# ── Server warm-up ────────────────────────────────────────────────────
def wait_for_server(timeout: int = 90) -> None:
    """Send a real MCP initialize request to /keyword-tracker/mcp so the
    full MCP stack — not just the HTTP process — is warm before Anthropic
    tries to connect from their cloud."""
    url = f"{BASE_URL}/keyword-tracker/mcp"
    payload = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "warmup", "version": "1.0"},
        },
    }).encode()
    deadline = time.time() + timeout
    print(f"Warming up MCP server at {url} ...")
    while time.time() < deadline:
        try:
            req = urllib.request.Request(
                url, data=payload,
                headers={"Content-Type": "application/json", "Accept": "application/json, text/event-stream"},
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                if resp.status in (200, 202):
                    print("MCP server is ready.")
                    return
        except Exception:
            pass
        time.sleep(5)
    raise RuntimeError(f"MCP server did not become ready within {timeout}s")

WEEKLY_MCP = [
    { "type":"url","url":f"{BASE_URL}/keyword-tracker/mcp","name":"keyword-tracker" },
    { "type":"url","url":f"{BASE_URL}/cms-connector/mcp","name":"cms-connector" },
    # { "type":"url","url":f"{BASE_URL}/schema-manager/mcp","name":"schema" },
    # { "type":"url","url":f"{BASE_URL}/competitor-intel/mcp","name":"competitors" },
    # { "type":"url","url":f"{BASE_URL}/gbp-manager/mcp","name":"gbp" },
    # { "type":"url","url":f"{BASE_URL}/serp-features/mcp","name":"serp" },
    # { "type":"url","url":f"{BASE_URL}/backlink-monitor/mcp","name":"backlinks" },
    # { "type":"url","url":f"{BASE_URL}/reporting/mcp","name":"reporting" },
]

# One mcp_toolset entry per active MCP server (must match "name" fields above)
WEEKLY_TOOLS = [
    { "type": "mcp_toolset", "mcp_server_name": "keyword-tracker" },
    { "type": "mcp_toolset", "mcp_server_name": "cms-connector" },
    # { "type": "mcp_toolset", "mcp_server_name": "schema" },
    # { "type": "mcp_toolset", "mcp_server_name": "competitors" },
    # { "type": "mcp_toolset", "mcp_server_name": "gbp" },
    # { "type": "mcp_toolset", "mcp_server_name": "serp" },
    # { "type": "mcp_toolset", "mcp_server_name": "backlinks" },
    # { "type": "mcp_toolset", "mcp_server_name": "reporting" },
]

_DRY_RUN_NOTE = """

IMPORTANT — DRY RUN MODE: You may read data freely, but you must NOT call \
update_page_meta or any other write tool. Only analyse and suggest.""" if DRY_RUN else ""

WEEKLY_PROMPT = f"""
You are an SEO analyst. Run the full weekly audit for the site:

1. RANKINGS: Use get_rankings and get_top_movers to check all tracked keywords.
   Flag any keyword that dropped >5 positions. Note overall rank velocity.

2. CMS AUDIT: Use get_impressions_vs_ctr (min_impressions=200, max_ctr_pct=3) to find
   the 5 pages with the highest impressions but lowest CTR.
   For each page call get_page to read the current title and meta description.
   Suggest a rewritten title and meta description for each page.
   Do NOT call update_page_meta.

3. REPORT: Print a concise digest with:
   - Top 3 keyword wins / losses this week
   - 5 pages with their current and suggested meta (table format)
   - Top 3 action items for next week

Be specific: use actual URLs, keyword positions, and CTR percentages.{_DRY_RUN_NOTE}
"""


def run_weekly() -> None:
    wait_for_server()
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])  # reads ANTHROPIC_API_KEY from env

    for site_id in SITE_IDS:
        print(f"\n-- Site {site_id} -- DRY_RUN={DRY_RUN} ------------------------------")

        message = client.beta.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=8192,
            betas=["mcp-client-2025-11-20"],
            mcp_servers=WEEKLY_MCP,
            tools=WEEKLY_TOOLS,
            messages=[{ "role": "user", "content": WEEKLY_PROMPT }],
        )

        print("WEEKLY KEYWORD REPORT")
        print("=" * 60)

        for block in message.content:
            if hasattr(block, "text"):
                print(block.text)
            elif hasattr(block, "type") and block.type == "tool_use":
                print(f"\n[tool_call] {block.name}({json.dumps(block.input, indent=2)})")
            elif hasattr(block, "type") and block.type == "tool_result":
                print(f"\n[tool_result] {block.content}")


if __name__ == "__main__":
    run_weekly()
