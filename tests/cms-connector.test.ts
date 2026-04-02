/**
 * Tests for cms-connector MCP server.
 * WordPress REST API (global fetch) and GSC (googleapis) calls are mocked.
 */

import { jest } from '@jest/globals';

// ── Mock spy functions ────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockQuery = jest.fn<() => Promise<any>>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetch = jest.fn<any>();

// ── ESM-safe mocks ────────────────────────────────────────────────────
jest.unstable_mockModule('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: jest.fn().mockImplementation(() => ({})),
    },
    searchconsole: jest.fn().mockReturnValue({
      searchanalytics: { query: mockQuery },
    }),
  },
}));

jest.unstable_mockModule('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    setRequestHandler: jest.fn(),
    connect: jest.fn(),
  })),
}));

jest.unstable_mockModule('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: jest.fn().mockImplementation(() => ({
    handleRequest: jest.fn(),
    onclose: null,
    sessionId: 'test-session',
    close: jest.fn(),
  })),
}));

jest.unstable_mockModule('@modelcontextprotocol/sdk/types.js', () => ({
  ListToolsRequestSchema: 'ListToolsRequestSchema',
  CallToolRequestSchema: 'CallToolRequestSchema',
  isInitializeRequest: jest.fn().mockReturnValue(true),
}));

jest.unstable_mockModule('express', () => {
  const app = {
    use: jest.fn(),
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
    listen: jest.fn(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const express = jest.fn(() => app) as any;
  express.json = jest.fn(() => jest.fn());
  return { default: express };
});

// ── Dynamic import after mocks ────────────────────────────────────────
type CmsModule = typeof import('../src/mcp-servers/cms-connector/server.js');
let getPage: CmsModule['getPage'];
let listPages: CmsModule['listPages'];
let getPageMetrics: CmsModule['getPageMetrics'];
let updatePageMeta: CmsModule['updatePageMeta'];
let getImpressionsVsCtr: CmsModule['getImpressionsVsCtr'];

beforeAll(async () => {
  // Install global fetch mock before the module is imported
  global.fetch = mockFetch;
  const mod = await import('../src/mcp-servers/cms-connector/server.js');
  getPage = mod.getPage;
  listPages = mod.listPages;
  getPageMetrics = mod.getPageMetrics;
  updatePageMeta = mod.updatePageMeta;
  getImpressionsVsCtr = mod.getImpressionsVsCtr;
});

// ── Env helpers ───────────────────────────────────────────────────────
const MOCK_GSC_CREDS = JSON.stringify({
  type: 'service_account',
  project_id: 'test-project',
  private_key_id: 'key123',
  private_key: '-----BEGIN RSA PRIVATE KEY-----\nMOCK\n-----END RSA PRIVATE KEY-----',
  client_email: 'test@test-project.iam.gserviceaccount.com',
  client_id: '123456789',
});

function setGscEnv(siteId: number) {
  process.env[`GSC_OAUTH_SITE_${siteId}`] = MOCK_GSC_CREDS;
}
function clearGscEnv(siteId: number) {
  delete process.env[`GSC_OAUTH_SITE_${siteId}`];
}
function setWpEnv(siteId: number) {
  process.env[`CMS_API_URL_SITE_${siteId}`] = 'https://lifecircle.in';
  process.env[`CMS_API_KEY_SITE_${siteId}`] = 'admin:app-password-123';
}
function clearWpEnv(siteId: number) {
  delete process.env[`CMS_API_URL_SITE_${siteId}`];
  delete process.env[`CMS_API_KEY_SITE_${siteId}`];
}

/** Returns a mock fetch Response for a JSON body */
function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Bad Request',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}


// Sample WP page fixture
const WP_PAGE = {
  id: 42,
  title: { rendered: 'Home Care Services' },
  content: { rendered: '<p>We provide home care.</p>' },
  modified: '2026-03-01T10:00:00',
  link: 'https://lifecircle.in/home-care/',
  rank_math_meta: { description: 'Trusted home care services.' },
  meta: {},
};

// ── getPage ───────────────────────────────────────────────────────────
describe('getPage', () => {
  beforeEach(() => {
    setWpEnv(1);
    mockFetch.mockReset();
  });
  afterEach(() => clearWpEnv(1));

  it('returns page data with meta description from Rank Math', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([WP_PAGE]));

    const result = await getPage(1, 'https://lifecircle.in/home-care/');
    expect(result.id).toBe(42);
    expect(result.title).toBe('Home Care Services');
    expect(result.meta_description).toBe('Trusted home care services.');
    expect(result.last_modified).toBe('2026-03-01T10:00:00');
  });

  it('falls back to posts when page not found', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([]))         // pages?slug= → empty
      .mockResolvedValueOnce(jsonResponse([WP_PAGE])); // posts?slug= → found

    const result = await getPage(1, 'https://lifecircle.in/home-care/');
    expect(result.id).toBe(42);
  });

  it('throws when page not found in pages or posts', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]));

    await expect(getPage(1, 'https://lifecircle.in/missing/')).rejects.toThrow(
      'Page not found',
    );
  });

  it('throws when CMS_API_URL_SITE_N is missing', async () => {
    clearWpEnv(1);
    await expect(getPage(1, 'https://lifecircle.in/')).rejects.toThrow(
      'Missing env var CMS_API_URL_SITE_1',
    );
  });

});

// ── listPages ─────────────────────────────────────────────────────────
describe('listPages', () => {
  beforeEach(() => {
    setWpEnv(1);
    setGscEnv(1);
    mockFetch.mockReset();
    mockQuery.mockReset();
  });
  afterEach(() => {
    clearWpEnv(1);
    clearGscEnv(1);
  });

  const WP_PAGES_LIST = [
    { id: 1, title: { rendered: 'Home' }, link: 'https://lifecircle.in/', modified: '2026-03-01T00:00:00' },
    { id: 2, title: { rendered: 'About' }, link: 'https://lifecircle.in/about/', modified: '2026-02-15T00:00:00' },
  ];
  const GSC_ROWS = {
    data: {
      rows: [
        { keys: ['https://lifecircle.in/'], impressions: 5000, clicks: 200, ctr: 0.04, position: 3.2 },
        { keys: ['https://lifecircle.in/about/'], impressions: 800, clicks: 20, ctr: 0.025, position: 8.1 },
      ],
    },
  };

  it('returns pages enriched with GSC metrics', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(WP_PAGES_LIST));
    mockQuery.mockResolvedValueOnce(GSC_ROWS);

    const result = await listPages(1, 10, 0);
    expect(result.site_id).toBe(1);
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].impressions).toBe(5000);
    expect(result.pages[0].ctr).toBe(0.04);
    expect(result.pages[1].url).toBe('https://lifecircle.in/about/');
  });

  it('returns 0 metrics for pages with no GSC data', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([
      { id: 3, title: { rendered: 'Contact' }, link: 'https://lifecircle.in/contact/', modified: '2026-01-01T00:00:00' },
    ]));
    mockQuery.mockResolvedValueOnce({ data: { rows: [] } });

    const result = await listPages(1, 10, 0);
    expect(result.pages[0].impressions).toBe(0);
    expect(result.pages[0].position).toBeNull();
  });

  it('throws for invalid limit', async () => {
    await expect(listPages(1, 0, 0)).rejects.toThrow('limit must be an integer');
    await expect(listPages(1, 101, 0)).rejects.toThrow('limit must be an integer');
  });

  it('throws for invalid offset', async () => {
    await expect(listPages(1, 10, -1)).rejects.toThrow('offset must be a non-negative integer');
  });

  it('passes correct per_page and offset to WP API', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));
    mockQuery.mockResolvedValueOnce({ data: { rows: [] } });

    await listPages(1, 5, 10);
    const fetchUrl = (mockFetch.mock.calls[0] as [string, ...unknown[]])[0] as string;
    expect(fetchUrl).toContain('per_page=5');
    expect(fetchUrl).toContain('offset=10');
  });
});

// ── getPageMetrics ────────────────────────────────────────────────────
describe('getPageMetrics', () => {
  beforeEach(() => {
    setGscEnv(1);
    mockQuery.mockReset();
  });
  afterEach(() => clearGscEnv(1));

  it('returns GSC metrics for a given URL', async () => {
    mockQuery.mockResolvedValueOnce({
      data: {
        rows: [
          { keys: ['https://lifecircle.in/home-care/'], impressions: 1200, clicks: 45, ctr: 0.0375, position: 5.2 },
        ],
      },
    });
    const result = await getPageMetrics(1, 'https://lifecircle.in/home-care/');
    expect(result.impressions).toBe(1200);
    expect(result.clicks).toBe(45);
    expect(result.ctr).toBeCloseTo(0.0375);
    expect(result.position).toBe(5.2);
    expect(result.url).toBe('https://lifecircle.in/home-care/');
  });

  it('returns zeros when no GSC data found', async () => {
    mockQuery.mockResolvedValueOnce({ data: { rows: [] } });
    const result = await getPageMetrics(1, 'https://lifecircle.in/new-page/');
    expect(result.impressions).toBe(0);
    expect(result.clicks).toBe(0);
    expect(result.position).toBeNull();
  });

  it('passes page URL as a dimension filter to GSC', async () => {
    mockQuery.mockResolvedValueOnce({ data: { rows: [] } });
    await getPageMetrics(1, 'https://lifecircle.in/home-care/');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (mockQuery.mock.calls[0] as any)[0].requestBody;
    expect(body.dimensionFilterGroups[0].filters[0].expression).toBe(
      'https://lifecircle.in/home-care/',
    );
  });

  it('throws when GSC_OAUTH_SITE_N is missing', async () => {
    clearGscEnv(1);
    await expect(
      getPageMetrics(1, 'https://lifecircle.in/'),
    ).rejects.toThrow('Missing env var GSC_OAUTH_SITE_1');
  });

  it('propagates GSC API errors', async () => {
    mockQuery.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
    await expect(
      getPageMetrics(1, 'https://lifecircle.in/'),
    ).rejects.toThrow('PERMISSION_DENIED');
  });
});

// ── updatePageMeta ────────────────────────────────────────────────────
describe('updatePageMeta', () => {
  beforeEach(() => {
    setWpEnv(1);
    mockFetch.mockReset();
  });
  afterEach(() => clearWpEnv(1));

  const UPDATED_PAGE = {
    id: 42,
    link: 'https://lifecircle.in/home-care/',
    title: { rendered: 'Updated Home Care Services' },
  };

  /** Queue: pages?slug= → WP_PAGE, PUT → UPDATED_PAGE */
  function setupUpdateFetch() {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([WP_PAGE]))
      .mockResolvedValueOnce(jsonResponse(UPDATED_PAGE));
  }

  it('updates title and description, returns ok=true', async () => {
    setupUpdateFetch();
    const result = await updatePageMeta(
      1,
      'https://lifecircle.in/home-care/',
      'Updated Home Care Services',
      'Award-winning home care.',
    );
    expect(result.ok).toBe(true);
    expect(result.id).toBe(42);
    expect(result.title).toBe('Updated Home Care Services');
  });

  it('sends PUT with title and meta description in payload', async () => {
    setupUpdateFetch();
    await updatePageMeta(1, 'https://lifecircle.in/home-care/', 'New Title', 'New desc');
    // 3rd fetch call (index 2) is the PUT
    const putCall = mockFetch.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(putCall[1].body as string);
    expect(body.title).toBe('New Title');
    expect(body.meta.rank_math_description).toBe('New desc');
  });

  it('PUT URL includes the resolved page ID', async () => {
    setupUpdateFetch();
    await updatePageMeta(1, 'https://lifecircle.in/home-care/', 'T', 'D');
    const putCall = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(putCall[0]).toContain('/pages/42');
  });

  it('payload does NOT contain status field', async () => {
    setupUpdateFetch();
    await updatePageMeta(1, 'https://lifecircle.in/home-care/', 'T', 'D');
    const putCall = mockFetch.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(putCall[1].body as string);
    expect(body).not.toHaveProperty('status');
    expect(body).not.toHaveProperty('post_status');
  });

  // ── PUBLISH GUARD ──────────────────────────────────────────────────
  it('PUBLISH GUARD: throws when status=publish is passed via _extraFields', async () => {
    await expect(
      updatePageMeta(1, 'https://lifecircle.in/', 'T', 'D', { status: 'publish' }),
    ).rejects.toThrow('PUBLISH GUARD');
  });

  it('PUBLISH GUARD: throws when post_status=publish is passed via _extraFields', async () => {
    await expect(
      updatePageMeta(1, 'https://lifecircle.in/', 'T', 'D', { post_status: 'publish' }),
    ).rejects.toThrow('PUBLISH GUARD');
  });

  it('PUBLISH GUARD: does not throw for other status values', async () => {
    setupUpdateFetch();
    const result = await updatePageMeta(
      1, 'https://lifecircle.in/home-care/', 'T', 'D', { status: 'draft' },
    );
    expect(result.ok).toBe(true);
  });

  it('throws when CMS_API_URL_SITE_N is missing', async () => {
    clearWpEnv(1);
    await expect(
      updatePageMeta(1, 'https://lifecircle.in/', 'T', 'D'),
    ).rejects.toThrow('Missing env var CMS_API_URL_SITE_1');
  });

  it('propagates WP API errors', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([WP_PAGE]))
      .mockResolvedValueOnce(jsonResponse({ message: 'Forbidden' }, false, 403));
    await expect(
      updatePageMeta(1, 'https://lifecircle.in/home-care/', 'T', 'D'),
    ).rejects.toThrow('WP API error 403: Forbidden');
  });
});

// ── getImpressionsVsCtr ───────────────────────────────────────────────
describe('getImpressionsVsCtr', () => {
  beforeEach(() => {
    setGscEnv(1);
    mockQuery.mockReset();
  });
  afterEach(() => clearGscEnv(1));

  const GSC_ALL_PAGES = {
    data: {
      rows: [
        // High impressions, low CTR → opportunity
        { keys: ['https://lifecircle.in/home-care/'], impressions: 2000, clicks: 20, ctr: 0.01, position: 6.0 },
        // High impressions, good CTR → NOT an opportunity
        { keys: ['https://lifecircle.in/senior-care/'], impressions: 1500, clicks: 90, ctr: 0.06, position: 4.0 },
        // Low impressions, low CTR → below impression threshold
        { keys: ['https://lifecircle.in/contact/'], impressions: 50, clicks: 1, ctr: 0.02, position: 12.0 },
        // High impressions, low CTR → opportunity
        { keys: ['https://lifecircle.in/about/'], impressions: 800, clicks: 16, ctr: 0.02, position: 7.5 },
      ],
    },
  };

  it('returns only pages with impressions > 100 and CTR < 3%', async () => {
    mockQuery.mockResolvedValueOnce(GSC_ALL_PAGES);
    const result = await getImpressionsVsCtr(1, 28);
    expect(result.opportunities).toHaveLength(2);
    const urls = result.opportunities.map((o) => o.url);
    expect(urls).toContain('https://lifecircle.in/home-care/');
    expect(urls).toContain('https://lifecircle.in/about/');
    expect(urls).not.toContain('https://lifecircle.in/senior-care/');
    expect(urls).not.toContain('https://lifecircle.in/contact/');
  });

  it('sorts results by impressions descending', async () => {
    mockQuery.mockResolvedValueOnce(GSC_ALL_PAGES);
    const result = await getImpressionsVsCtr(1, 28);
    expect(result.opportunities[0].impressions).toBeGreaterThanOrEqual(
      result.opportunities[1].impressions,
    );
  });

  it('returns correct threshold metadata', async () => {
    mockQuery.mockResolvedValueOnce({ data: { rows: [] } });
    const result = await getImpressionsVsCtr(1, 30);
    expect(result.threshold).toEqual({ min_impressions: 100, max_ctr: 0.03 });
    expect(result.days).toBe(30);
    expect(result.site_id).toBe(1);
  });

  it('returns empty opportunities when all pages have good CTR', async () => {
    mockQuery.mockResolvedValueOnce({
      data: {
        rows: [
          { keys: ['https://lifecircle.in/'], impressions: 5000, clicks: 500, ctr: 0.1, position: 1.5 },
        ],
      },
    });
    const result = await getImpressionsVsCtr(1, 28);
    expect(result.opportunities).toHaveLength(0);
  });

  it('throws for days out of range', async () => {
    await expect(getImpressionsVsCtr(1, 0)).rejects.toThrow('days must be an integer');
    await expect(getImpressionsVsCtr(1, 91)).rejects.toThrow('days must be an integer');
  });

  it('throws when GSC_OAUTH_SITE_N is missing', async () => {
    clearGscEnv(1);
    await expect(getImpressionsVsCtr(1, 28)).rejects.toThrow('Missing env var GSC_OAUTH_SITE_1');
  });

  it('propagates GSC API errors', async () => {
    mockQuery.mockRejectedValueOnce(new Error('RESOURCE_EXHAUSTED'));
    await expect(getImpressionsVsCtr(1, 28)).rejects.toThrow('RESOURCE_EXHAUSTED');
  });
});
