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

KEYWORD_TRACKER_URL = "https://keyword-tracker-seo-agent.up.railway.app/mcp"
CMS_CONNECTOR_URL = "https://cms-connector-seo-agent.up.railway.app/mcp"
REPORTING_URL = "https://reporting-seo-agent.up.railway.app/mcp"
SCHEMA_MANAGER_URL = "https://schema-manager-seo-agent.up.railway.app/mcp"
COMPETITOR_INTEL_URL = "https://competitor-intel-seo-agent.up.railway.app/mcp"

keywords = {
    1: ["homecare", "elder care", "home health care", "senior care"],
}

# Competitor domains to analyse per site
competitors = {
    1: ["www.portea.com", "www.care24.co.in"],
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


# ── Step 2: CMS Connector ─────────────────────────────────────────────
def step2_cms_connector(client: anthropic.Anthropic, site_id: int) -> dict:
    """Find low-CTR pages and suggest meta improvements via cms-connector MCP."""
    print(f"\n[step2] Analyzing low-CTR pages for site_id={site_id}...")

    response = call_with_retry(
        client,
        "step2",
        model="claude-sonnet-4-5",
        max_tokens=8192,
        mcp_servers=[{"type": "url", "url": CMS_CONNECTOR_URL, "name": "cms-connector"}],
        messages=[{
            "role": "user",
            "content": f"""You are an SEO content analyst for site_id={site_id}.

Call in order:
1. get_impressions_vs_ctr with site_id={site_id} and days=28
2. From the results, take the top 5 pages by impressions (highest impression count first)
3. For each of those 5 pages, call get_page with site_id={site_id} and the page URL
4. For each page, write an improved title (max 60 chars) and meta description (max 155 chars) to increase CTR
5. Call create_approval_queue ONCE with all 5 pages as a single items list:
   {{
     "items": [
       {{
         "site_id": {site_id},
         "module": "cms-connector",
         "type": "meta_rewrite",
         "priority": 2,
         "title": "Update meta: <current page title>",
         "content": {{
           "url": "<page url>",
           "current_title": "<current title>",
           "current_description": "<current meta description>",
           "suggested_title": "<your improved title>",
           "suggested_description": "<your improved description>",
           "reasoning": "<1-2 sentence explanation>"
         }},
         "preview_url": "<page url>"
       }},
       ... (one object per page)
     ]
   }}

Return ONLY a JSON object with keys:
- opportunities: array of objects with url, current_ctr, impressions, current_title, current_description, suggested_title, suggested_description, reasoning
- queued: number of items successfully submitted to the approval queue
- summary: string with 2-3 overall action items

No extra text.""",
        }],
        betas=["mcp-client-2025-04-04"],
    )

    text = "".join(block.text for block in response.content if hasattr(block, "text")).strip()
    print(f"[step2] Done. Stop reason: {response.stop_reason}")

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        import re
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            return json.loads(match.group())
        print(f"[step2] Warning: could not parse JSON from response. Raw: {text[:200]}")
        return {"opportunities": [], "summary": text}


# ── Step 3: Schema Manager ────────────────────────────────────────────
def step3_schema_manager(client: anthropic.Anthropic, site_id: int, cms_data: dict | None = None) -> dict:
    """Analyse schema gaps on top low-CTR pages via schema-manager MCP."""
    print(f"\n[step3] Analysing schema gaps for site_id={site_id}...")

    # Pick top 3 page URLs from cms_data opportunities, fall back to site root
    top_pages: list[str] = []
    if cms_data and cms_data.get("opportunities"):
        top_pages = [o["url"] for o in cms_data["opportunities"][:3] if o.get("url")]
    if not top_pages:
        top_pages = ["https://lifecircle.in"]  # fallback to site root

    pages_list = "\n".join(f"- {url}" for url in top_pages)

    response = call_with_retry(
        client,
        "step3",
        model="claude-sonnet-4-5",
        max_tokens=8192,
        mcp_servers=[{"type": "url", "url": SCHEMA_MANAGER_URL, "name": "schema-manager"}],
        messages=[{
            "role": "user",
            "content": f"""You are an SEO schema analyst for site_id={site_id}.

Analyse schema markup on the following pages:
{pages_list}

For each page:
1. Call suggest_schema_improvements with site_id={site_id} and the page URL
2. If the page has missing schema types, note the suggestions

Also call get_paa_questions with site_id={site_id} for keyword "home care services" to identify FAQ schema opportunities.

Return ONLY a JSON object with keys:
- pages: array of objects with url, page_type, missing_types (array), has_gaps (bool), suggestions (array)
- paa_questions: array of question strings (top 5)
- summary: string with 2-3 schema improvement action items

No extra text.""",
        }],
        betas=["mcp-client-2025-04-04"],
    )

    text = "".join(block.text for block in response.content if hasattr(block, "text")).strip()
    print(f"[step3] Done. Stop reason: {response.stop_reason}")

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        import re
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            return json.loads(match.group())
        print(f"[step3] Warning: could not parse JSON. Raw: {text[:200]}")
        return {"pages": [], "paa_questions": [], "summary": text}


# ── Step 4: Competitor Intel ──────────────────────────────────────────
def step4_competitor_intel(client: anthropic.Anthropic, site_id: int) -> dict:
    """Analyse competitor keyword gaps and content gaps via competitor-intel MCP."""
    print(f"\n[step4] Running competitor analysis for site_id={site_id}...")

    site_competitors = competitors.get(site_id, [])
    if not site_competitors:
        print(f"[step4] No competitors configured for site_id={site_id}, skipping.")
        return {"keyword_gaps": [], "content_gaps": [], "summary": "No competitors configured."}

    competitor_domain = site_competitors[0]  # Analyse primary competitor

    response = call_with_retry(
        client,
        "step4",
        model="claude-sonnet-4-5",
        max_tokens=8192,
        mcp_servers=[{"type": "url", "url": COMPETITOR_INTEL_URL, "name": "competitor-intel"}],
        messages=[{
            "role": "user",
            "content": f"""You are a competitive SEO analyst for site_id={site_id}.

Analyse competitor domain: {competitor_domain}

Call in order:
1. get_keyword_gaps with site_id={site_id} and competitor_domain="{competitor_domain}"
2. get_content_gaps with site_id={site_id} and competitor_domain="{competitor_domain}"
3. get_competitor_backlinks with site_id={site_id} and competitor_domain="{competitor_domain}"

Return ONLY a JSON object with keys:
- competitor_domain: "{competitor_domain}"
- keyword_gaps: array of top 10 gap objects (keyword, competitor_position, competitor_volume)
- content_gaps: array of top 5 topic groups (topic, keyword_count, avg_volume)
- top_backlinks: array of top 5 backlinks (url_from, domain_rating, anchor)
- summary: string with 2-3 actionable competitor insights

No extra text.""",
        }],
        betas=["mcp-client-2025-04-04"],
    )

    text = "".join(block.text for block in response.content if hasattr(block, "text")).strip()
    print(f"[step4] Done. Stop reason: {response.stop_reason}")

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        import re
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            return json.loads(match.group())
        print(f"[step4] Warning: could not parse JSON. Raw: {text[:200]}")
        return {"keyword_gaps": [], "content_gaps": [], "summary": text}


# ── Step 5: Reporting ─────────────────────────────────────────────────
def step5_reporting(
    client: anthropic.Anthropic,
    site_id: int,
    data: dict,
    cms_data: dict | None = None,
    schema_data: dict | None = None,
    competitor_data: dict | None = None,
) -> None:
    """Format digest and post to Slack; log to Google Sheets."""
    print(f"\n[step5] Posting weekly digest for site_id={site_id}...")

    if DRY_RUN:
        print("[step5] DRY_RUN=true — skipping Slack post and Sheets writes")
        print(f"[step5] Would post digest with {len(data.get('rankings', []))} rankings")
        if cms_data:
            print(f"[step5] CMS step2 found {len(cms_data.get('opportunities', []))} low-CTR opportunities")
        return

    cms_opportunities = (cms_data or {}).get("opportunities", [])
    cms_summary = (cms_data or {}).get("summary", "")

    schema_pages = (schema_data or {}).get("pages", [])
    schema_summary = (schema_data or {}).get("summary", "")
    paa_questions = (schema_data or {}).get("paa_questions", [])

    competitor_keyword_gaps = (competitor_data or {}).get("keyword_gaps", [])
    competitor_content_gaps = (competitor_data or {}).get("content_gaps", [])
    competitor_summary = (competitor_data or {}).get("summary", "")
    competitor_domain = (competitor_data or {}).get("competitor_domain", "")

    # Build extra log_recommendation steps
    extra_log_steps = ""
    step_num = 5
    if cms_data and cms_data.get("opportunities"):
        extra_log_steps += f"\n{step_num}. Call log_recommendation with site_id={site_id}, module=\"cms-connector\", a concise recommendation from the cms_data summary, outcome=\"pending\""
        step_num += 1
    if schema_data and schema_data.get("pages"):
        extra_log_steps += f"\n{step_num}. Call log_recommendation with site_id={site_id}, module=\"schema-manager\", a concise recommendation from the schema summary, outcome=\"pending\""
        step_num += 1
    if competitor_data and competitor_data.get("keyword_gaps"):
        extra_log_steps += f"\n{step_num}. Call log_recommendation with site_id={site_id}, module=\"competitor-intel\", a concise recommendation from the competitor summary, outcome=\"pending\""

    response = call_with_retry(
        client,
        "step5",
        model="claude-sonnet-4-5",
        max_tokens=8192,
        mcp_servers=[{"type": "url", "url": REPORTING_URL, "name": "reporting"}],
        messages=[{
            "role": "user",
            "content": f"""You are an SEO reporting agent for site_id={site_id}.

Here is all data collected this week:

## Step 1 — Keyword Performance
{json.dumps(data, indent=2)}

## Step 2 — CMS Meta Suggestions (low-CTR pages)
{json.dumps(cms_opportunities, indent=2) if cms_opportunities else "No opportunities identified."}
CMS summary: {cms_summary or "N/A"}

## Step 3 — Schema Gaps
{json.dumps(schema_pages, indent=2) if schema_pages else "No schema gap data."}
Schema summary: {schema_summary or "N/A"}
PAA questions identified: {json.dumps(paa_questions[:5]) if paa_questions else "None"}

## Step 4 — Competitor Intelligence
Competitor: {competitor_domain or "N/A"}
Keyword gaps (top 10): {json.dumps(competitor_keyword_gaps[:10], indent=2) if competitor_keyword_gaps else "No gaps identified."}
Content gaps (top 5 topics): {json.dumps(competitor_content_gaps[:5], indent=2) if competitor_content_gaps else "No content gaps."}
Competitor summary: {competitor_summary or "N/A"}

Please do all of the following in order:
1. Call create_weekly_digest with:
   - site_id={site_id}
   - rankings, summary from the keyword data above
   - cms_opportunities: the list of CMS meta suggestions from above (pass as-is, each item has url, impressions, current_ctr, current_title, current_description, suggested_title, suggested_description, reasoning)
   - schema_gaps: the schema pages data from above
   - competitor_alerts: the competitor keyword gaps above
2. Call post_slack_message using the blocks and fallback_text returned by create_weekly_digest
3. Call write_to_sheet with site_id={site_id}, tab_name="Rankings", and the rankings data formatted as rows: [[date, keyword, position, clicks, impressions, ctr], ...]
4. Call log_recommendation with site_id={site_id}, module="keyword-tracker", a concise recommendation from the keyword summary, outcome="pending"{extra_log_steps}

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

    # ── Step 2: CMS connector — low-CTR page analysis ────────────────
    cms_data: dict = {}
    try:
        cms_data = step2_cms_connector(client, site_id)
    except Exception as exc:
        errors["step2"] = str(exc)
        print(f"[step2] ERROR: {exc}")

    # ── Step 3: Schema manager ────────────────────────────────────────
    schema_data: dict = {}
    try:
        schema_data = step3_schema_manager(client, site_id, cms_data)
    except Exception as exc:
        errors["step3"] = str(exc)
        print(f"[step3] ERROR: {exc}")

    # ── Step 4: Competitor intel ──────────────────────────────────────
    competitor_data: dict = {}
    try:
        competitor_data = step4_competitor_intel(client, site_id)
    except Exception as exc:
        errors["step4"] = str(exc)
        print(f"[step4] ERROR: {exc}")

    # ── Timeout check ─────────────────────────────────────────────────
    elapsed = time.time() - start_time
    if elapsed > TIMEOUT_SECONDS:
        print(f"\n[weekly] TIMEOUT: pipeline exceeded {TIMEOUT_SECONDS}s ({elapsed:.0f}s elapsed)")
        _print_summary(errors, elapsed)
        return

    # ── Step 5: Reporting ─────────────────────────────────────────────
    try:
        step5_reporting(client, site_id, keyword_data, cms_data, schema_data, competitor_data)
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
