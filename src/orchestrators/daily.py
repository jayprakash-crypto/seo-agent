"""Daily SEO orchestrator — runs keyword tracking, rank checks, and GSC sync."""

import anthropic
import os


def run_daily_tasks(site_id: int) -> None:
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    # TODO: implement daily orchestration logic
    # - Keyword rank tracking
    # - GSC data sync
    # - Technical SEO checks
    pass


if __name__ == "__main__":
    site_id = 1
    run_daily_tasks(site_id)
