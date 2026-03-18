"""Monthly discovery orchestrator — keyword research, GBP audit, page generation."""

import asyncio


async def run_monthly_discovery():
    print("Running monthly discovery tasks...")
    # TODO: invoke keyword-researcher, gbp-manager, page-generator MCP servers


if __name__ == "__main__":
    asyncio.run(run_monthly_discovery())
