"""Weekly orchestrator — asks Claude for a keyword report using the Anthropic Python SDK."""

import os
import time
import json
import urllib.request
import urllib.error
from pathlib import Path

import anthropic
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5")
BASE_URL = "https://seo-agent-production-e243.up.railway.app"

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
    { "type":"url","url":f"https://seo-agent-production-e243.up.railway.app/keyword-tracker/mcp","name":"keywords" },
    # { "type":"url","url":f"https://seo-agent-production-e243.up.railway.app/cms-connector/mcp","name":"cms" },
    # { "type":"url","url":f"https://seo-agent-production-e243.up.railway.app/schema-manager/mcp","name":"schema" },
    # { "type":"url","url":f"https://seo-agent-production-e243.up.railway.app/competitor-intel/mcp","name":"competitors" },
    # { "type":"url","url":f"https://seo-agent-production-e243.up.railway.app/gbp-manager/mcp","name":"gbp" },
    # { "type":"url","url":f"https://seo-agent-production-e243.up.railway.app/serp-features/mcp","name":"serp" },
    # { "type":"url","url":f"https://seo-agent-production-e243.up.railway.app/backlink-monitor/mcp","name":"backlinks" },
    # { "type":"url","url":f"https://seo-agent-production-e243.up.railway.app/reporting/mcp","name":"reporting" },
]

# One mcp_toolset entry per active MCP server (must match "name" fields above)
WEEKLY_TOOLS = [
    { "type": "mcp_toolset", "mcp_server_name": "keywords" },
    # { "type": "mcp_toolset", "mcp_server_name": "cms" },
    # { "type": "mcp_toolset", "mcp_server_name": "schema" },
    # { "type": "mcp_toolset", "mcp_server_name": "competitors" },
    # { "type": "mcp_toolset", "mcp_server_name": "gbp" },
    # { "type": "mcp_toolset", "mcp_server_name": "serp" },
    # { "type": "mcp_toolset", "mcp_server_name": "backlinks" },
    # { "type": "mcp_toolset", "mcp_server_name": "reporting" },
]

WEEKLY_PROMPT = '''
You are an autonomous SEO agent. Run the full weekly audit:
1. RANKINGS: Check all tracked keywords. Flag drops >5 positions. Note rank velocity.
2. CONTENT: Audit 10 lowest-scoring pages. Rewrite meta for the worst 3.
3. SCHEMA: Find pages missing FAQPage or LocalBusiness schema. Generate markup.
4. COMPETITORS: Pull keyword gaps per city. Flag new competitor content.
5. GBP: Check local pack positions per city. Draft next week's GBP posts.
6. SERP FEATURES: Check featured snippet and PAA ownership per city.
7. BACKLINKS: New and lost links this week. Flag any toxic links.
8. REPORT: Write a Slack digest with top 3 action items. Log all to Sheets.
Be specific: use actual URLs, keyword positions, city names, and competitor domains.
'''

def run_weekly() -> None:
    wait_for_server()
    client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env

    for site_id in SITE_IDS:
        print(f"\n── Site {site_id} ──────────────────────────────")

        message = client.beta.messages.create(
            model=MODEL,
            max_tokens=8192,
            betas=["mcp-client-2025-11-20"],
            mcp_servers=WEEKLY_MCP,
            tools=WEEKLY_TOOLS,
            messages=[
                {
                    "role": "user",
                    "content": WEEKLY_PROMPT,
                }
            ],
        )

        print(message.content[0].text)


if __name__ == "__main__":
    run_weekly()
