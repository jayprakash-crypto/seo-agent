"""Weekly orchestrator — asks Claude for a keyword report using the Anthropic Python SDK."""

import os
from pathlib import Path

import anthropic
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5")

SITE_IDS = [1]

WEEKLY_MCP = [
    { "type":"url","url":f"https://seo-agent-keyword-tracker.up.railway.app/mcp","name":"keywords" },
    # { "type":"url","url":f"{BASE_URL}/cms-connector","name":"cms" },
    # { "type":"url","url":f"{BASE_URL}/schema-manager","name":"schema" },
    # { "type":"url","url":f"{BASE_URL}/competitor-intel","name":"competitors" },
    # { "type":"url","url":f"{BASE_URL}/gbp-manager","name":"gbp" },
    # { "type":"url","url":f"{BASE_URL}/serp-features","name":"serp" },
    # { "type":"url","url":f"{BASE_URL}/backlink-monitor","name":"backlinks" },
    # { "type":"url","url":f"{BASE_URL}/reporting","name":"reporting" },
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
    client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env

    for site_id in SITE_IDS:
        print(f"\n── Site {site_id} ──────────────────────────────")

        message = client.beta.messages.create(
            model=MODEL,
            max_tokens=8192,
            betas=["mcp-client-2025-04-04"],
            mcp_servers=WEEKLY_MCP,
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
