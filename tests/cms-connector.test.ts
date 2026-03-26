/**
 * cms-connector MCP server tests
 * Mocks: global fetch (WP REST API) + googleapis (GSC)
 *
 * Tools tested:
 *  - get_page
 *  - list_pages
 *  - get_page_metrics
 *  - update_page_meta  (including publish guard)
 *  - get_impressions_vs_ctr
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// ── Hoist mocks ───────────────────────────────────────────────────────
const { mockFetch, mockQuery } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockQuery: vi.fn(),
}));

// Stub global fetch before module loads
vi.stubGlobal("fetch", mockFetch);

// ── Mock Express (no port binding) ────────────────────────────────────
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

// ── Mock googleapis ───────────────────────────────────────────────────
vi.mock("googleapis", () => ({
  google: {
    auth: { GoogleAuth: vi.fn().mockImplementation(() => ({})) },
    searchconsole: vi.fn(() => ({ searchanalytics: { query: mockQuery } })),
  },
}));

// ── Import createServer after mocks ───────────────────────────────────
const { createServer } = await import("../src/mcp-servers/cms-connector/server.js");

// ── Constants ─────────────────────────────────────────────────────────
const FAKE_SA  = JSON.stringify({ type: "service_account", project_id: "test" });
const FAKE_WP  = "https://lifecircle.in/wp-json/wp/v2";
const FAKE_KEY = "admin:app-password-xyz";
const PAGE_URL = "https://lifecircle.in/counselling-services";

const TIMEOUT_ERROR    = Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" });
const RATE_LIMIT_ERROR = Object.assign(new Error("Quota exceeded"), { code: 429 });

// ── Fake WP post fixture ──────────────────────────────────────────────
function wpPost(overrides: object = {}) {
  return {
    id: 42,
    title: { rendered: "Counselling Services" },
    excerpt: { rendered: "<p>Professional counselling in India.</p>" },
    content: { rendered: "<p>Body content here.</p>" },
    modified: "2026-03-01T10:00:00",
    link: PAGE_URL,
    status: "publish",
    yoast_head_json: { description: "Meta desc from Yoast" },
    ...overrides,
  };
}

// ── Fetch response helpers ────────────────────────────────────────────
function okJson(data: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data)) });
}
function errorResponse(status: number, message: string) {
  return Promise.resolve({ ok: false, status, json: () => Promise.resolve({ message }), text: () => Promise.resolve(message) });
}

// ── GSC row helpers ───────────────────────────────────────────────────
function gscPageRow(url: string, impressions: number, clicks: number, ctr: number, position: number) {
  return { keys: [url], impressions, clicks, ctr, position };
}

// ── Parse tool response ───────────────────────────────────────────────
function text(content: unknown) {
  return JSON.parse((content as Array<{ text: string }>)[0].text);
}

// ── Client setup ─────────────────────────────────────────────────────
let client: Client;

beforeAll(async () => {
  process.env.GSC_OAUTH_SITE_1  = FAKE_SA;
  process.env.CMS_API_URL_SITE_1 = FAKE_WP;
  process.env.CMS_API_KEY_SITE_1 = FAKE_KEY;

  const [ct, st] = InMemoryTransport.createLinkedPair();
  await createServer().connect(st);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(ct);
});

afterAll(async () => { await client.close(); });
beforeEach(() => { mockFetch.mockReset(); mockQuery.mockReset(); });

// ═════════════════════════════════════════════════════════════════════
describe("get_page", () => {

  // 1 — Success ─────────────────────────────────────────────────────────
  it("returns structured page data for a known URL", async () => {
    // findPostByUrl: GET /posts?slug=counselling-services
    mockFetch.mockResolvedValueOnce(okJson([wpPost()]));

    const res = await client.callTool({ name: "get_page", arguments: { site_id: 1, url: PAGE_URL } });
    const d = text(res.content);

    expect(res.isError).toBeFalsy();
    expect(d.id).toBe(42);
    expect(d.title).toBe("Counselling Services");
    expect(d.meta_description).toBe("Meta desc from Yoast");
    expect(d.status).toBe("publish");
    expect(d.url).toBe(PAGE_URL);
  });

  it("falls back to excerpt when yoast_head_json has no description", async () => {
    mockFetch.mockResolvedValueOnce(okJson([wpPost({ yoast_head_json: {} })]));

    const res = await client.callTool({ name: "get_page", arguments: { site_id: 1, url: PAGE_URL } });
    const d = text(res.content);

    expect(d.meta_description).toBe("Professional counselling in India.");
  });

  it("tries /pages when /posts returns empty", async () => {
    mockFetch
      .mockResolvedValueOnce(okJson([]))   // posts → empty
      .mockResolvedValueOnce(okJson([wpPost()])); // pages → found

    const res = await client.callTool({ name: "get_page", arguments: { site_id: 1, url: PAGE_URL } });
    expect(res.isError).toBeFalsy();
    expect(text(res.content).id).toBe(42);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // 2 — WP API error ────────────────────────────────────────────────────
  it("returns isError when WP API returns 500", async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(500, "Internal Server Error"));

    const res = await client.callTool({ name: "get_page", arguments: { site_id: 1, url: PAGE_URL } });
    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/WP API 500/);
  });

  // 3 — Missing env vars ────────────────────────────────────────────────
  it("returns isError for missing CMS_API_URL env var", async () => {
    delete process.env.CMS_API_URL_SITE_1;
    const res = await client.callTool({ name: "get_page", arguments: { site_id: 1, url: PAGE_URL } });
    process.env.CMS_API_URL_SITE_1 = FAKE_WP;

    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/CMS_API_URL_SITE_1/);
  });

  // 4 — Unknown site_id ─────────────────────────────────────────────────
  it("returns isError for unknown site_id", async () => {
    const res = await client.callTool({ name: "get_page", arguments: { site_id: 99, url: PAGE_URL } });
    expect(res.isError).toBe(true);
  });

  // 5 — Post not found ──────────────────────────────────────────────────
  it("returns isError when post is not found in posts or pages", async () => {
    mockFetch
      .mockResolvedValueOnce(okJson([]))
      .mockResolvedValueOnce(okJson([]));

    const res = await client.callTool({ name: "get_page", arguments: { site_id: 1, url: PAGE_URL } });
    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/No post\/page found/);
  });
});

// ═════════════════════════════════════════════════════════════════════
describe("list_pages", () => {

  const WP_POSTS = [
    { id: 1, title: { rendered: "Page A" }, link: "https://lifecircle.in/page-a", modified: "2026-03-01", status: "publish" },
    { id: 2, title: { rendered: "Page B" }, link: "https://lifecircle.in/page-b", modified: "2026-03-02", status: "publish" },
  ];
  const GSC_ROWS = [
    gscPageRow("https://lifecircle.in/page-a", 500, 20, 0.04, 3.5),
    gscPageRow("https://lifecircle.in/page-b", 200, 4, 0.02, 8.1),
  ];

  // 1 — Success ─────────────────────────────────────────────────────────
  it("returns pages merged with GSC metrics", async () => {
    mockFetch.mockResolvedValueOnce(okJson(WP_POSTS));
    mockQuery.mockResolvedValueOnce({ data: { rows: GSC_ROWS } });

    const res = await client.callTool({ name: "list_pages", arguments: { site_id: 1 } });
    const d = text(res.content);

    expect(res.isError).toBeFalsy();
    expect(d.total).toBe(2);
    expect(d.pages[0].title).toBe("Page A");
    expect(d.pages[0].gsc.impressions).toBe(500);
    expect(d.pages[0].gsc.ctr_pct).toBe(4);
    expect(d.pages[1].gsc.impressions).toBe(200);
  });

  it("sets gsc=null for pages not in GSC data", async () => {
    mockFetch.mockResolvedValueOnce(okJson(WP_POSTS));
    mockQuery.mockResolvedValueOnce({ data: { rows: [] } });

    const res = await client.callTool({ name: "list_pages", arguments: { site_id: 1 } });
    const d = text(res.content);

    expect(d.pages[0].gsc).toBeNull();
  });

  it("respects limit and offset params", async () => {
    mockFetch.mockResolvedValueOnce(okJson(WP_POSTS));
    mockQuery.mockResolvedValueOnce({ data: { rows: [] } });

    await client.callTool({ name: "list_pages", arguments: { site_id: 1, limit: 5, offset: 10 } });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("per_page=5");
    expect(url).toContain("offset=10");
  });

  // 2 — WP API timeout ──────────────────────────────────────────────────
  it("returns isError on WP API timeout", async () => {
    mockFetch.mockRejectedValueOnce(TIMEOUT_ERROR);

    const res = await client.callTool({ name: "list_pages", arguments: { site_id: 1 } });
    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/ETIMEDOUT/);
  });

  // 3 — GSC rate limit ──────────────────────────────────────────────────
  it("returns isError on GSC rate-limit (429)", async () => {
    mockFetch.mockResolvedValueOnce(okJson(WP_POSTS));
    mockQuery.mockRejectedValueOnce(RATE_LIMIT_ERROR);

    const res = await client.callTool({ name: "list_pages", arguments: { site_id: 1 } });
    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/Quota exceeded/);
  });

  // 4 — Missing site_id ─────────────────────────────────────────────────
  it("returns isError when site_id is missing", async () => {
    const res = await client.callTool({ name: "list_pages", arguments: {} });
    expect(res.isError).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════
describe("get_page_metrics", () => {

  // 1 — Success ─────────────────────────────────────────────────────────
  it("returns GSC metrics for the page", async () => {
    mockQuery.mockResolvedValueOnce({
      data: { rows: [gscPageRow(PAGE_URL, 1200, 36, 0.03, 4.5)] },
    });

    const res = await client.callTool({ name: "get_page_metrics", arguments: { site_id: 1, url: PAGE_URL } });
    const d = text(res.content);

    expect(res.isError).toBeFalsy();
    expect(d.url).toBe(PAGE_URL);
    expect(d.impressions).toBe(1200);
    expect(d.clicks).toBe(36);
    expect(d.ctr_pct).toBe(3);
    expect(d.avg_position).toBe(4.5);
  });

  it("returns zeros when GSC has no data for the page", async () => {
    mockQuery.mockResolvedValueOnce({ data: { rows: [] } });

    const res = await client.callTool({ name: "get_page_metrics", arguments: { site_id: 1, url: PAGE_URL } });
    const d = text(res.content);

    expect(d.impressions).toBe(0);
    expect(d.avg_position).toBeNull();
  });

  // 2 — Timeout ─────────────────────────────────────────────────────────
  it("returns isError on GSC timeout", async () => {
    mockQuery.mockRejectedValueOnce(TIMEOUT_ERROR);
    const res = await client.callTool({ name: "get_page_metrics", arguments: { site_id: 1, url: PAGE_URL } });
    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/ETIMEDOUT/);
  });

  // 3 — Unknown site ────────────────────────────────────────────────────
  it("returns isError for unknown site_id", async () => {
    // Set the env var so buildGscClient passes — getSiteUrl then throws Unknown site_id
    process.env.GSC_OAUTH_SITE_99 = FAKE_SA;
    const res = await client.callTool({ name: "get_page_metrics", arguments: { site_id: 99, url: PAGE_URL } });
    delete process.env.GSC_OAUTH_SITE_99;
    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/Unknown site_id: 99/);
  });

  // 4 — Missing params ──────────────────────────────────────────────────
  it("returns isError when url is missing", async () => {
    const res = await client.callTool({ name: "get_page_metrics", arguments: { site_id: 1 } });
    expect(res.isError).toBe(true);
  });

  // 5 — Rate limit ──────────────────────────────────────────────────────
  it("returns isError on GSC rate-limit (429)", async () => {
    mockQuery.mockRejectedValueOnce(RATE_LIMIT_ERROR);
    const res = await client.callTool({ name: "get_page_metrics", arguments: { site_id: 1, url: PAGE_URL } });
    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/Quota exceeded/);
  });
});

// ═════════════════════════════════════════════════════════════════════
describe("update_page_meta", () => {

  // 1 — Success: title + description ────────────────────────────────────
  it("updates title and description via WP REST API", async () => {
    // findPostByUrl GET
    mockFetch.mockResolvedValueOnce(okJson([wpPost()]));
    // PATCH /posts/42
    mockFetch.mockResolvedValueOnce(okJson({ ...wpPost(), title: { rendered: "New Title" } }));

    const res = await client.callTool({
      name: "update_page_meta",
      arguments: { site_id: 1, url: PAGE_URL, title: "New Title", description: "New description." },
    });
    const d = text(res.content);

    expect(res.isError).toBeFalsy();
    expect(d.id).toBe(42);
    expect(d.title_updated).toBe(true);
    expect(d.description_updated).toBe(true);
    expect(d.status).toBe("publish");
  });

  it("sends correct PATCH payload with Yoast meta fields", async () => {
    mockFetch.mockResolvedValueOnce(okJson([wpPost()]));
    mockFetch.mockResolvedValueOnce(okJson(wpPost()));

    await client.callTool({
      name: "update_page_meta",
      arguments: { site_id: 1, url: PAGE_URL, title: "SEO Title", description: "SEO desc" },
    });

    const patchCall = mockFetch.mock.calls[1];
    const body = JSON.parse(patchCall[1].body as string);
    expect(body.title).toBe("SEO Title");
    expect(body.meta._yoast_wpseo_title).toBe("SEO Title");
    expect(body.meta._yoast_wpseo_metadesc).toBe("SEO desc");
    // Ensure status=publish is NOT in the payload
    expect(body.status).toBeUndefined();
  });

  // PUBLISH GUARD ────────────────────────────────────────────────────────
  it("throws FORBIDDEN when status=publish is passed", async () => {
    const res = await client.callTool({
      name: "update_page_meta",
      arguments: { site_id: 1, url: PAGE_URL, title: "Title", status: "publish" },
    });
    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/FORBIDDEN/);
    // Fetch must never be called — guard fires before any API call
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN when post_status=publish is passed", async () => {
    const res = await client.callTool({
      name: "update_page_meta",
      arguments: { site_id: 1, url: PAGE_URL, description: "desc", post_status: "publish" },
    });
    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/FORBIDDEN/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // 2 — WP PATCH error ───────────────────────────────────────────────────
  it("returns isError when PATCH returns WP error", async () => {
    mockFetch.mockResolvedValueOnce(okJson([wpPost()]));
    mockFetch.mockResolvedValueOnce(errorResponse(403, "Forbidden"));

    const res = await client.callTool({
      name: "update_page_meta",
      arguments: { site_id: 1, url: PAGE_URL, title: "New" },
    });
    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/WP API 403/);
  });

  // 3 — Missing title and description ────────────────────────────────────
  it("returns isError when neither title nor description is provided", async () => {
    const res = await client.callTool({
      name: "update_page_meta",
      arguments: { site_id: 1, url: PAGE_URL },
    });
    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/At least one of/);
  });

  // 4 — Post not found ───────────────────────────────────────────────────
  it("returns isError when post is not found", async () => {
    mockFetch.mockResolvedValueOnce(okJson([]));
    mockFetch.mockResolvedValueOnce(okJson([]));

    const res = await client.callTool({
      name: "update_page_meta",
      arguments: { site_id: 1, url: PAGE_URL, title: "New Title" },
    });
    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/No post\/page found/);
  });

  // 5 — WP API timeout ───────────────────────────────────────────────────
  it("returns isError on WP API timeout", async () => {
    mockFetch.mockRejectedValueOnce(TIMEOUT_ERROR);

    const res = await client.callTool({
      name: "update_page_meta",
      arguments: { site_id: 1, url: PAGE_URL, title: "New Title" },
    });
    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/ETIMEDOUT/);
  });
});

// ═════════════════════════════════════════════════════════════════════
describe("get_impressions_vs_ctr", () => {

  const GSC_ROWS = [
    gscPageRow("https://lifecircle.in/therapy",     2000, 30, 0.015, 3.2),  // high imp, low CTR → opportunity
    gscPageRow("https://lifecircle.in/counselling",  500,  5, 0.010, 5.1),  // high imp, low CTR → opportunity
    gscPageRow("https://lifecircle.in/about",        800, 80, 0.100, 2.0),  // high CTR → excluded
    gscPageRow("https://lifecircle.in/contact",       50,  1, 0.020, 7.0),  // below min_impressions → excluded
  ];

  // 1 — Success ─────────────────────────────────────────────────────────
  it("returns pages with high impressions and low CTR", async () => {
    mockQuery.mockResolvedValueOnce({ data: { rows: GSC_ROWS } });

    const res = await client.callTool({
      name: "get_impressions_vs_ctr",
      arguments: { site_id: 1, days: 28, min_impressions: 100, max_ctr_pct: 3 },
    });
    const d = text(res.content);

    expect(res.isError).toBeFalsy();
    expect(d.total).toBe(2);
    // sorted by impressions desc
    expect(d.opportunities[0].url).toBe("https://lifecircle.in/therapy");
    expect(d.opportunities[0].impressions).toBe(2000);
    expect(d.opportunities[0].ctr_pct).toBe(1.5);
    expect(d.opportunities[1].url).toBe("https://lifecircle.in/counselling");
  });

  it("excludes pages above max_ctr_pct threshold", async () => {
    mockQuery.mockResolvedValueOnce({ data: { rows: GSC_ROWS } });

    const res = await client.callTool({
      name: "get_impressions_vs_ctr",
      arguments: { site_id: 1 },
    });
    const urls = text(res.content).opportunities.map((o: { url: string }) => o.url);

    expect(urls).not.toContain("https://lifecircle.in/about");
  });

  it("excludes pages below min_impressions threshold", async () => {
    mockQuery.mockResolvedValueOnce({ data: { rows: GSC_ROWS } });

    const res = await client.callTool({
      name: "get_impressions_vs_ctr",
      arguments: { site_id: 1 },
    });
    const urls = text(res.content).opportunities.map((o: { url: string }) => o.url);

    expect(urls).not.toContain("https://lifecircle.in/contact");
  });

  it("returns empty opportunities when no pages match", async () => {
    mockQuery.mockResolvedValueOnce({ data: { rows: [] } });

    const res = await client.callTool({ name: "get_impressions_vs_ctr", arguments: { site_id: 1 } });
    const d = text(res.content);

    expect(d.total).toBe(0);
    expect(d.opportunities).toHaveLength(0);
  });

  // 2 — Timeout ─────────────────────────────────────────────────────────
  it("returns isError on GSC timeout", async () => {
    mockQuery.mockRejectedValueOnce(TIMEOUT_ERROR);
    const res = await client.callTool({ name: "get_impressions_vs_ctr", arguments: { site_id: 1 } });
    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/ETIMEDOUT/);
  });

  // 3 — Unknown site ────────────────────────────────────────────────────
  it("returns isError for unknown site_id", async () => {
    // Set the env var so buildGscClient passes — getSiteUrl then throws Unknown site_id
    process.env.GSC_OAUTH_SITE_99 = FAKE_SA;
    const res = await client.callTool({ name: "get_impressions_vs_ctr", arguments: { site_id: 99 } });
    delete process.env.GSC_OAUTH_SITE_99;
    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/Unknown site_id: 99/);
  });

  // 4 — Missing site_id ─────────────────────────────────────────────────
  it("returns isError when site_id is missing", async () => {
    const res = await client.callTool({ name: "get_impressions_vs_ctr", arguments: {} });
    expect(res.isError).toBe(true);
  });

  // 5 — Rate limit ──────────────────────────────────────────────────────
  it("returns isError on GSC rate-limit (429)", async () => {
    mockQuery.mockRejectedValueOnce(RATE_LIMIT_ERROR);
    const res = await client.callTool({ name: "get_impressions_vs_ctr", arguments: { site_id: 1 } });
    expect(res.isError).toBe(true);
    expect(text(res.content).error).toMatch(/Quota exceeded/);
  });
});
