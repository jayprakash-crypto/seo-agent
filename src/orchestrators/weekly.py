"""Weekly SEO orchestrator — keyword rankings → reporting digest."""

import anthropic
import os
import json
import time
from dotenv import load_dotenv

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────
DRY_RUN = os.environ.get("DRY_RUN", "false").lower() in ("1", "true", "yes")
TIMEOUT_SECONDS = 15 * 60  # 15 minutes hard limit
MAX_RETRIES = 3
RETRY_BACKOFF = [2, 5, 10]  # seconds between retries

KEYWORD_TRACKER_URL = os.environ.get(
    "KEYWORD_TRACKER_URL",
    "https://keyword-tracker-seo-agent.up.railway.app/mcp",
)
REPORTING_URL = os.environ.get(
    "REPORTING_URL",
    "https://reporting-seo-agent.up.railway.app/mcp",
)

keywords = {
    1: ["homecare", "elder care", "home health care", "senior care"],
}


# ── Retry helper ──────────────────────────────────────────────────────
def call_with_retry(client: anthropic.Anthropic, label: str, **kwargs) -> anthropic.types.Message:
    """Call Claude API with exponential backoff retry on failure."""
    last_exc: Exception = RuntimeError("No attempts made")
    for attempt in range(MAX_RETRIES):
        try:
            return client.beta.messages.create(**kwargs)
        except Exception as exc:
            last_exc = exc
            if attempt < MAX_RETRIES - 1:
                wait = RETRY_BACKOFF[attempt]
                print(f"[{label}] attempt {attempt + 1} failed: {exc}. Retrying in {wait}s...")
                time.sleep(wait)
            else:
                print(f"[{label}] all {MAX_RETRIES} attempts failed.")
    raise last_exc


# ── Step 1: Keyword rankings ──────────────────────────────────────────
def step1_keyword_rankings(client: anthropic.Anthropic, site_id: int) -> dict:
    """Get keyword rankings, top movers, and velocity via keyword-tracker MCP."""
    print(f"\n[step1] Getting keyword rankings for site_id={site_id}...")

    response = call_with_retry(
        client,
        "step1",
        model="claude-sonnet-4-5",
        max_tokens=8192,
        mcp_servers=[{"type": "url", "url": KEYWORD_TRACKER_URL, "name": "keyword-tracker"}],
        messages=[{
            "role": "user",
            "content": f"""You are an SEO analyst. Use the keyword-tracker tools for site_id={site_id}.

Call in order:
1. get_rankings with site_id={site_id} and keywords: {keywords.get(site_id, [])}
2. get_top_movers with site_id={site_id}, threshold=3, direction="both"
3. get_rank_velocity for the best-ranking keyword (lowest position number) with window_days=14

Return ONLY a JSON object with keys: rankings (array), top_movers (object), velocity (object), summary (string with 2-3 action items for next week). No extra text.""",
        }],
        betas=["mcp-client-2025-04-04"],
    )

    text = "".join(block.text for block in response.content if hasattr(block, "text")).strip()
    print(f"[step1] Done. Stop reason: {response.stop_reason}")

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Claude returned explanation text alongside JSON — extract the JSON block
        import re
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            return json.loads(match.group())
        print(f"[step1] Warning: could not parse JSON from response. Raw: {text[:200]}")
        return {"rankings": [], "top_movers": {"movers": []}, "velocity": {}, "summary": text}


# ── Step 5: Reporting ─────────────────────────────────────────────────
def step5_reporting(client: anthropic.Anthropic, site_id: int, data: dict) -> None:
    """Format digest and post to Slack; log to Google Sheets."""
    print(f"\n[step5] Posting weekly digest for site_id={site_id}...")

    if DRY_RUN:
        print("[step5] DRY_RUN=true — skipping Slack post and Sheets writes")
        print(f"[step5] Would post digest with {len(data.get('rankings', []))} rankings")
        return

    response = call_with_retry(
        client,
        "step5",
        model="claude-sonnet-4-5",
        max_tokens=8192,
        mcp_servers=[{"type": "url", "url": REPORTING_URL, "name": "reporting"}],
        messages=[{
            "role": "user",
            "content": f"""You are an SEO reporting agent for site_id={site_id}.

This week's keyword performance data:
{json.dumps(data, indent=2)}

Please do all of the following in order:
1. Call create_weekly_digest with site_id={site_id} and the rankings, top_movers, velocity, and summary from the data above
2. Call post_slack_message using the blocks and fallback_text returned by create_weekly_digest
3. Call write_to_sheet with site_id={site_id}, tab_name="Rankings", and the rankings data formatted as rows: [[date, keyword, position, clicks, impressions, ctr], ...]
4. Call log_recommendation with site_id={site_id}, module="keyword-tracker", a concise recommendation from the summary, outcome="pending"

Confirm when all steps are complete.""",
        }],
        betas=["mcp-client-2025-04-04"],
    )

    for block in response.content:
        if hasattr(block, "text"):
            print(f"[step5] {block.text}")
    print(f"[step5] Done. Stop reason: {response.stop_reason}")


# ── Main pipeline ─────────────────────────────────────────────────────
def run_weekly_tasks(site_id: int) -> None:
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    start_time = time.time()
    errors: dict[str, str] = {}

    print(f"[weekly] ══════════════════════════════════════════")
    print(f"[weekly] Starting weekly pipeline — site_id={site_id}")
    print(f"[weekly] DRY_RUN={DRY_RUN}")
    print(f"[weekly] ══════════════════════════════════════════")

    # ── Step 1: Keyword rankings ──────────────────────────────────────
    keyword_data: dict = {}
    try:
        keyword_data = step1_keyword_rankings(client, site_id)
    except Exception as exc:
        errors["step1"] = str(exc)
        print(f"[step1] ERROR: {exc}")

    # ── Steps 2–4: Skipped (Phase 2/3 not yet implemented) ────────────
    print("\n[step2] Skipped — cms-connector (Phase 2)")
    print("[step3] Skipped — schema-manager (Phase 3)")
    print("[step4] Skipped — competitor-intel (Phase 3)")

    # ── Timeout check ─────────────────────────────────────────────────
    elapsed = time.time() - start_time
    if elapsed > TIMEOUT_SECONDS:
        print(f"\n[weekly] TIMEOUT: pipeline exceeded {TIMEOUT_SECONDS}s ({elapsed:.0f}s elapsed)")
        _print_summary(errors, elapsed)
        return

    # ── Step 5: Reporting ─────────────────────────────────────────────
    try:
        step5_reporting(client, site_id, keyword_data)
    except Exception as exc:
        errors["step5"] = str(exc)
        print(f"[step5] ERROR: {exc}")

    elapsed = time.time() - start_time
    _print_summary(errors, elapsed)


def _print_summary(errors: dict, elapsed: float) -> None:
    print(f"\n[weekly] ══════════════════════════════════════════")
    print(f"[weekly] Pipeline complete in {elapsed:.1f}s")
    if errors:
        print(f"[weekly] Errors encountered:")
        for step, msg in errors.items():
            print(f"  {step}: {msg}")
    else:
        print("[weekly] All steps succeeded ✓")
    print(f"[weekly] ══════════════════════════════════════════")


if __name__ == "__main__":
    site_id = 1
    run_weekly_tasks(site_id)
