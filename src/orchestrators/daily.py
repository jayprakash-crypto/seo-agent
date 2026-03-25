"""Daily orchestrator — runs keyword tracking, SERP features, and technical SEO checks."""

import asyncio


async def run_daily():
    print("Running daily SEO tasks...")
    # TODO: invoke keyword-tracker, serp-features, technical-seo MCP servers


if __name__ == "__main__":
    asyncio.run(run_daily())
