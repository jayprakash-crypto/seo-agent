/**
 * keyword-tracker MCP server tests
 * Uses Vitest (Jest-compatible API: describe/it/expect/vi.mock)
 *
 * Scenarios per tool:
 *  1. Successful response with realistic mock data
 *  2. API timeout handling
 *  3. Invalid site_id
 *  4. Missing required parameters
 *  5. API rate-limit error (HTTP 429)
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// ── Hoist mockQuery so it's available inside vi.mock factory ──────────
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

// ── Prevent Express from binding a real port ──────────────────────────
vi.mock("express", () => {
  const app = {
    use: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    listen: vi.fn((_port: unknown, cb?: () => void) => { cb?.(); }),
  };
  return { default: Object.assign(vi.fn(() => app), { json: vi.fn(() => vi.fn()) }) };
});

// ── Mock googleapis — all GSC queries go through mockQuery ────────────
vi.mock("googleapis", () => ({
  google: {
    auth: { GoogleAuth: vi.fn().mockImplementation(() => ({})) },
    searchconsole: vi.fn(() => ({ searchanalytics: { query: mockQuery } })),
  },
}));

// ── Import createServer after mocks are registered ────────────────────
const { createServer } = await import("../src/mcp-servers/keyword-tracker/server.js");

// ── Shared test errors ────────────────────────────────────────────────
const TIMEOUT_ERROR = Object.assign(new Error("ETIMEDOUT: request timed out"), { code: "ETIMEDOUT" });
const RATE_LIMIT_ERROR = Object.assign(new Error("Quota exceeded for quota metric 'Queries per minute'"), { code: 429, status: 429 });

const FAKE_SA = JSON.stringify({ type: "service_account", project_id: "test-project" });

// ── Data builders ─────────────────────────────────────────────────────
function row(kw: string, pos: number, clicks = 10, impressions = 200, ctr = 0.05) {
  return { keys: [kw], position: pos, clicks, impressions, ctr };
}
function rowD(kw: string, date: string, pos: number, clicks = 10, impressions = 200, ctr = 0.05) {
  return { keys: [kw, date], position: pos, clicks, impressions, ctr };
}

function text(content: unknown) {
  return JSON.parse((content as Array<{ text: string }>)[0].text);
}

// ── MCP client wired to a fresh server instance via InMemoryTransport ─
let client: Client;

beforeAll(async () => {
  process.env.GSC_OAUTH_SITE_1 = FAKE_SA;
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await createServer().connect(st);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(ct);
});

afterAll(async () => { await client.close(); });
beforeEach(() => { mockQuery.mockReset(); });

// ═════════════════════════════════════════════════════════════════════
describe("get_rankings", () => {

  // 1 — Success ────────────────────────────────────────────────────────
  it("returns keywords sorted by position with correct fields", async () => {
    mockQuery.mockResolvedValue({ data: { rows: [
      row("lifecircle counselling",   7.8,  12, 200, 0.06),
      row("therapy near me",          3.2,  45, 520, 0.0865),
      row("online counsellor india", 15.3,   5, 180, 0.0278),
    ]}});

    const res = await client.callTool({ name: "get_rankings", arguments: { site_id: 1 } });
    const d = text(res.content);

    expect(res.isError).toBeFalsy();
    expect(d.site_id).toBe(1);
    expect(d.total).toBe(3);
    // sorted ascending by position
    expect(d.rankings[0].keyword).toBe("therapy near me");
    expect(d.rankings[0].position).toBe(3.2);
    expect(d.rankings[0].clicks).toBe(45);
    expect(d.rankings[0].impressions).toBe(520);
    expect(d.rankings[0].ctr_pct).toBe(8.65);
    expect(d.rankings[2].keyword).toBe("online counsellor india");
    expect(d.date_range).toHaveProperty("start");
    expect(d.date_range).toHaveProperty("end");
  });

  it("respects explicit date range and limit params", async () => {
    mockQuery.mockResolvedValue({ data: { rows: [] } });

    const res = await client.callTool({
      name: "get_rankings",
      arguments: { site_id: 1, start_date: "2026-01-01", end_date: "2026-01-31", limit: 50 },
    });
    const d = text(res.content);

    expect(d.date_range.start).toBe("2026-01-01");
    expect(d.date_range.end).toBe("2026-01-31");
    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.requestBody.rowLimit).toBe(50);
  });

  // 2 — Timeout ────────────────────────────────────────────────────────
  it("returns isError on API timeout", async () => {
    mockQuery.mockRejectedValue(TIMEOUT_ERROR);

    const res = await client.callTool({ name: "get_rankings", arguments: { site_id: 1 } });

    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/ETIMEDOUT/);
  });

  // 3 — Invalid site_id ────────────────────────────────────────────────
  it("returns isError for unknown site_id", async () => {
    process.env.GSC_OAUTH_SITE_99 = FAKE_SA; // allow auth to pass so site lookup runs
    const res = await client.callTool({ name: "get_rankings", arguments: { site_id: 99 } });
    delete process.env.GSC_OAUTH_SITE_99;

    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/Unknown site_id: 99/);
  });

  // 4 — Missing required param ─────────────────────────────────────────
  it("returns isError when site_id is missing", async () => {
    const res = await client.callTool({ name: "get_rankings", arguments: {} });

    expect(res.isError).toBe(true);
  });

  // 5 — Rate limit ─────────────────────────────────────────────────────
  it("returns isError on API rate-limit (429)", async () => {
    mockQuery.mockRejectedValue(RATE_LIMIT_ERROR);

    const res = await client.callTool({ name: "get_rankings", arguments: { site_id: 1 } });

    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/Quota exceeded/);
  });
});

// ═════════════════════════════════════════════════════════════════════
describe("get_ranking_history", () => {

  // 1 — Success ────────────────────────────────────────────────────────
  it("returns history sorted by date ascending", async () => {
    mockQuery.mockResolvedValue({ data: { rows: [
      rowD("therapy near me", "2026-03-17", 3.2, 45, 520, 0.087),
      rowD("therapy near me", "2026-03-01", 5.0, 38, 400, 0.095),
      rowD("therapy near me", "2026-03-10", 3.5, 42, 450, 0.093),
    ]}});

    const res = await client.callTool({
      name: "get_ranking_history",
      arguments: { site_id: 1, keyword: "therapy near me", days: 30 },
    });
    const d = text(res.content);

    expect(res.isError).toBeFalsy();
    expect(d.site_id).toBe(1);
    expect(d.keyword).toBe("therapy near me");
    expect(d.days).toBe(30);
    expect(d.history).toHaveLength(3);
    expect(d.history[0].date).toBe("2026-03-01");
    expect(d.history[1].date).toBe("2026-03-10");
    expect(d.history[2].date).toBe("2026-03-17");
    expect(d.history[0].position).toBe(5);
    expect(d.history[0].ctr_pct).toBe(9.5);
  });

  it("passes keyword as dimension filter to GSC", async () => {
    mockQuery.mockResolvedValue({ data: { rows: [] } });

    await client.callTool({
      name: "get_ranking_history",
      arguments: { site_id: 1, keyword: "lifecircle counselling", days: 14 },
    });

    const body = mockQuery.mock.calls[0][0].requestBody;
    expect(body.dimensions).toContain("date");
    expect(body.dimensionFilterGroups[0].filters[0].expression).toBe("lifecircle counselling");
  });

  // 2 — Timeout ────────────────────────────────────────────────────────
  it("returns isError on API timeout", async () => {
    mockQuery.mockRejectedValue(TIMEOUT_ERROR);

    const res = await client.callTool({
      name: "get_ranking_history",
      arguments: { site_id: 1, keyword: "therapy near me" },
    });

    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/ETIMEDOUT/);
  });

  // 3 — Invalid site_id ────────────────────────────────────────────────
  it("returns isError for unknown site_id", async () => {
    process.env.GSC_OAUTH_SITE_99 = FAKE_SA;
    const res = await client.callTool({
      name: "get_ranking_history",
      arguments: { site_id: 99, keyword: "test" },
    });
    delete process.env.GSC_OAUTH_SITE_99;

    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/Unknown site_id: 99/);
  });

  // 4 — Missing required param ─────────────────────────────────────────
  it("returns isError when keyword is missing", async () => {
    const res = await client.callTool({
      name: "get_ranking_history",
      arguments: { site_id: 1 }, // keyword required but omitted
    });

    expect(res.isError).toBe(true);
  });

  // 5 — Rate limit ─────────────────────────────────────────────────────
  it("returns isError on API rate-limit (429)", async () => {
    mockQuery.mockRejectedValue(RATE_LIMIT_ERROR);

    const res = await client.callTool({
      name: "get_ranking_history",
      arguments: { site_id: 1, keyword: "counselling" },
    });

    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/Quota exceeded/);
  });
});

// ═════════════════════════════════════════════════════════════════════
describe("get_top_movers", () => {

  const CURRENT = [
    row("therapy near me",          3.2),
    row("lifecircle counselling",   12.0),
    row("online counsellor india",   8.0),
  ];
  const PREVIOUS = [
    row("therapy near me",          5.0),  // +1.8 improved
    row("lifecircle counselling",   8.0),  // -4.0 declined
    row("online counsellor india", 12.0), // +4.0 improved
  ];

  function mockTwoPeriods(current = CURRENT, previous = PREVIOUS) {
    mockQuery
      .mockResolvedValueOnce({ data: { rows: current } })
      .mockResolvedValueOnce({ data: { rows: previous } });
  }

  // 1 — Success ────────────────────────────────────────────────────────
  it("returns all movers sorted by |change| descending", async () => {
    mockTwoPeriods();

    const res = await client.callTool({
      name: "get_top_movers",
      arguments: { site_id: 1, days: 7, direction: "both" },
    });
    const d = text(res.content);

    expect(res.isError).toBeFalsy();
    expect(d.site_id).toBe(1);
    expect(d.movers).toHaveLength(3);
    const changes = d.movers.map((m: { change: number }) => Math.abs(m.change));
    expect(changes[0]).toBeGreaterThanOrEqual(changes[1]);
    expect(changes[1]).toBeGreaterThanOrEqual(changes[2]);
  });

  it("filters direction=up — only positive changes", async () => {
    mockTwoPeriods();

    const res = await client.callTool({
      name: "get_top_movers",
      arguments: { site_id: 1, direction: "up" },
    });
    const d = text(res.content);

    expect(d.movers.every((m: { change: number }) => m.change > 0)).toBe(true);
    expect(d.movers).toHaveLength(2);
  });

  it("filters direction=down — only negative changes", async () => {
    mockTwoPeriods();

    const res = await client.callTool({
      name: "get_top_movers",
      arguments: { site_id: 1, direction: "down" },
    });
    const d = text(res.content);

    expect(d.movers.every((m: { change: number }) => m.change < 0)).toBe(true);
    expect(d.movers).toHaveLength(1);
    expect(d.movers[0].keyword).toBe("lifecircle counselling");
  });

  it("skips keywords absent from the previous period", async () => {
    mockQuery
      .mockResolvedValueOnce({ data: { rows: [row("brand new kw", 5), row("established kw", 3)] } })
      .mockResolvedValueOnce({ data: { rows: [row("established kw", 7)] } });

    const res = await client.callTool({ name: "get_top_movers", arguments: { site_id: 1 } });
    const keywords = text(res.content).movers.map((m: { keyword: string }) => m.keyword);

    expect(keywords).not.toContain("brand new kw");
    expect(keywords).toContain("established kw");
  });

  // 2 — Timeout ────────────────────────────────────────────────────────
  it("returns isError on API timeout", async () => {
    mockQuery.mockRejectedValue(TIMEOUT_ERROR);

    const res = await client.callTool({ name: "get_top_movers", arguments: { site_id: 1 } });

    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/ETIMEDOUT/);
  });

  // 3 — Invalid site_id ────────────────────────────────────────────────
  it("returns isError for unknown site_id", async () => {
    const res = await client.callTool({ name: "get_top_movers", arguments: { site_id: 99 } });

    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/Unknown site_id: 99/);
  });

  // 4 — Missing required param ─────────────────────────────────────────
  it("returns isError when site_id is missing", async () => {
    const res = await client.callTool({ name: "get_top_movers", arguments: {} });

    expect(res.isError).toBe(true);
  });

  // 5 — Rate limit ─────────────────────────────────────────────────────
  it("returns isError on API rate-limit (429)", async () => {
    mockQuery.mockRejectedValue(RATE_LIMIT_ERROR);

    const res = await client.callTool({ name: "get_top_movers", arguments: { site_id: 1 } });

    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/Quota exceeded/);
  });
});

// ═════════════════════════════════════════════════════════════════════
describe("get_rank_velocity", () => {

  // improving: positions [8,6,5,4,3] → slope ≈ -1.2  → "improving"
  // stable:    positions [5,5.1,4.9] → slope ≈ -0.05 → "stable"
  // declining: positions [3,5,7,9,11]→ slope = +2.0  → "declining"
  const VELOCITY_ROWS = [
    rowD("improving kw", "2026-02-17",  8),
    rowD("improving kw", "2026-02-24",  6),
    rowD("improving kw", "2026-03-03",  5),
    rowD("improving kw", "2026-03-10",  4),
    rowD("improving kw", "2026-03-17",  3),
    rowD("stable kw",    "2026-03-01",  5.0),
    rowD("stable kw",    "2026-03-08",  5.1),
    rowD("stable kw",    "2026-03-15",  4.9),
    rowD("declining kw", "2026-02-17",  3),
    rowD("declining kw", "2026-02-24",  5),
    rowD("declining kw", "2026-03-03",  7),
    rowD("declining kw", "2026-03-10",  9),
    rowD("declining kw", "2026-03-17", 11),
  ];

  type VelocityKw = { keyword: string; velocity: number; trend: string; data_points: number };
  function find(keywords: VelocityKw[], name: string) {
    return keywords.find((k) => k.keyword === name);
  }

  // 1 — Success ────────────────────────────────────────────────────────
  it("correctly labels improving, stable, and declining trends", async () => {
    mockQuery.mockResolvedValue({ data: { rows: VELOCITY_ROWS } });

    const res = await client.callTool({
      name: "get_rank_velocity",
      arguments: { site_id: 1, days: 30 },
    });
    const d = text(res.content);

    expect(res.isError).toBeFalsy();
    expect(d.site_id).toBe(1);
    expect(find(d.keywords, "improving kw")?.trend).toBe("improving");
    expect(find(d.keywords, "stable kw")?.trend).toBe("stable");
    expect(find(d.keywords, "declining kw")?.trend).toBe("declining");
  });

  it("sorts results by |velocity| descending", async () => {
    mockQuery.mockResolvedValue({ data: { rows: VELOCITY_ROWS } });

    const res = await client.callTool({
      name: "get_rank_velocity",
      arguments: { site_id: 1 },
    });
    const velocities = text(res.content).keywords.map((k: { velocity: number }) => Math.abs(k.velocity));

    for (let i = 0; i < velocities.length - 1; i++) {
      expect(velocities[i]).toBeGreaterThanOrEqual(velocities[i + 1]);
    }
  });

  it("reports stable with velocity=0 for a keyword with only 1 data point", async () => {
    mockQuery.mockResolvedValue({ data: { rows: [rowD("single-day kw", "2026-03-17", 5)] } });

    const res = await client.callTool({
      name: "get_rank_velocity",
      arguments: { site_id: 1 },
    });
    const kw = find(text(res.content).keywords, "single-day kw");

    expect(kw?.trend).toBe("stable");
    expect(kw?.velocity).toBe(0);
    expect(kw?.data_points).toBe(1);
  });

  // 2 — Timeout ────────────────────────────────────────────────────────
  it("returns isError on API timeout", async () => {
    mockQuery.mockRejectedValue(TIMEOUT_ERROR);

    const res = await client.callTool({
      name: "get_rank_velocity",
      arguments: { site_id: 1 },
    });

    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/ETIMEDOUT/);
  });

  // 3 — Invalid site_id ────────────────────────────────────────────────
  it("returns isError for unknown site_id", async () => {
    process.env.GSC_OAUTH_SITE_99 = FAKE_SA;
    const res = await client.callTool({
      name: "get_rank_velocity",
      arguments: { site_id: 99 },
    });
    delete process.env.GSC_OAUTH_SITE_99;

    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/Unknown site_id: 99/);
  });

  // 4 — Missing required param ─────────────────────────────────────────
  it("returns isError when site_id is missing", async () => {
    const res = await client.callTool({ name: "get_rank_velocity", arguments: {} });

    expect(res.isError).toBe(true);
  });

  // 5 — Rate limit ─────────────────────────────────────────────────────
  it("returns isError on API rate-limit (429)", async () => {
    mockQuery.mockRejectedValue(RATE_LIMIT_ERROR);

    const res = await client.callTool({
      name: "get_rank_velocity",
      arguments: { site_id: 1 },
    });

    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/Quota exceeded/);
  });
});
