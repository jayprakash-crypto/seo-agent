/**
 * Tests for schema-manager MCP server.
 * Global fetch and WordPress REST API calls are mocked.
 */

import { jest } from '@jest/globals';

// ── Mock spy functions ────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetch = jest.fn<any>();

// ── ESM-safe mocks ────────────────────────────────────────────────────
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
type SchemaModule = typeof import('../src/mcp-servers/schema-manager/server.js');
let getCurrentSchema: SchemaModule['getCurrentSchema'];
let getPaaQuestions: SchemaModule['getPaaQuestions'];
let suggestSchemaImprovements: SchemaModule['suggestSchemaImprovements'];
let pushSchemaToPage: SchemaModule['pushSchemaToPage'];
let detectPageType: SchemaModule['detectPageType'];
let RECOMMENDED_SCHEMA: SchemaModule['RECOMMENDED_SCHEMA'];

beforeAll(async () => {
  global.fetch = mockFetch;
  const mod = await import('../src/mcp-servers/schema-manager/server.js');
  getCurrentSchema = mod.getCurrentSchema;
  getPaaQuestions = mod.getPaaQuestions;
  suggestSchemaImprovements = mod.suggestSchemaImprovements;
  pushSchemaToPage = mod.pushSchemaToPage;
  detectPageType = mod.detectPageType;
  RECOMMENDED_SCHEMA = mod.RECOMMENDED_SCHEMA;
});

// ── Env helpers ───────────────────────────────────────────────────────
function setWpEnv(siteId: number) {
  process.env[`CMS_API_URL_SITE_${siteId}`] = 'https://lifecircle.in';
  process.env[`CMS_API_KEY_SITE_${siteId}`] = 'admin:app-password-123';
}
function clearWpEnv(siteId: number) {
  delete process.env[`CMS_API_URL_SITE_${siteId}`];
  delete process.env[`CMS_API_KEY_SITE_${siteId}`];
}
function setSerpApiKey() {
  process.env.SERPAPI_KEY = 'test-serpapi-key';
}
function clearSerpApiKey() {
  delete process.env.SERPAPI_KEY;
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

/** Returns a mock fetch Response for HTML text */
function htmlResponse(html: string): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => html,
    json: async () => ({}),
  } as unknown as Response;
}

// ── HTML fixtures ─────────────────────────────────────────────────────
const HTML_WITH_SCHEMA = `
<html>
<head>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"LocalBusiness","name":"LifeCircle"}
  </script>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"WebSite","url":"https://lifecircle.in"}
  </script>
</head>
<body><p>Hello</p></body>
</html>`;

const HTML_WITH_NO_SCHEMA = `<html><head></head><body><p>No schema here.</p></body></html>`;

const HTML_WITH_MALFORMED_SCHEMA = `
<html>
<head>
  <script type="application/ld+json">
  {"@type": "Organization", MALFORMED JSON
  </script>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"WebSite"}
  </script>
</head>
</html>`;

// ── detectPageType ────────────────────────────────────────────────────
describe('detectPageType', () => {
  it('returns home for root URL', () => {
    expect(detectPageType('https://lifecircle.in/')).toBe('home');
  });

  it('returns faq for /faq/ path', () => {
    expect(detectPageType('https://lifecircle.in/faq/')).toBe('faq');
  });

  it('returns contact for /contact/ path', () => {
    expect(detectPageType('https://lifecircle.in/contact/')).toBe('contact');
  });

  it('returns blog for /blog/ path', () => {
    expect(detectPageType('https://lifecircle.in/blog/')).toBe('blog');
  });

  it('returns service for /home-care/ path', () => {
    expect(detectPageType('https://lifecircle.in/home-care/')).toBe('service');
  });

  it('returns default for unknown paths', () => {
    expect(detectPageType('https://lifecircle.in/team/')).toBe('default');
  });
});

// ── getCurrentSchema ──────────────────────────────────────────────────
describe('getCurrentSchema', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('extracts multiple JSON-LD schema blocks from page HTML', async () => {
    mockFetch.mockResolvedValueOnce(htmlResponse(HTML_WITH_SCHEMA));
    const result = await getCurrentSchema(1, 'https://lifecircle.in/');
    expect(result.schema_count).toBe(2);
    expect(result.schemas).toHaveLength(2);
    expect((result.schemas[0] as Record<string, unknown>)['@type']).toBe('LocalBusiness');
    expect((result.schemas[1] as Record<string, unknown>)['@type']).toBe('WebSite');
  });

  it('returns empty schemas array when page has no JSON-LD', async () => {
    mockFetch.mockResolvedValueOnce(htmlResponse(HTML_WITH_NO_SCHEMA));
    const result = await getCurrentSchema(1, 'https://lifecircle.in/');
    expect(result.schema_count).toBe(0);
    expect(result.schemas).toHaveLength(0);
  });

  it('skips malformed JSON-LD blocks and parses valid ones', async () => {
    mockFetch.mockResolvedValueOnce(htmlResponse(HTML_WITH_MALFORMED_SCHEMA));
    const result = await getCurrentSchema(1, 'https://lifecircle.in/');
    expect(result.schema_count).toBe(1);
    expect((result.schemas[0] as Record<string, unknown>)['@type']).toBe('WebSite');
  });

  it('returns correct site_id and url', async () => {
    mockFetch.mockResolvedValueOnce(htmlResponse(HTML_WITH_NO_SCHEMA));
    const result = await getCurrentSchema(1, 'https://lifecircle.in/about/');
    expect(result.site_id).toBe(1);
    expect(result.url).toBe('https://lifecircle.in/about/');
  });
});

// ── getPaaQuestions ───────────────────────────────────────────────────
describe('getPaaQuestions', () => {
  beforeEach(() => {
    setSerpApiKey();
    mockFetch.mockReset();
  });
  afterEach(() => clearSerpApiKey());

  const SERP_RESPONSE = {
    related_questions: [
      { question: 'What is home care?', snippet: 'Home care is...' },
      { question: 'How much does home care cost?', answer: 'It varies.' },
      { question: 'Who needs home care?', snippet: null },
    ],
  };

  it('returns PAA questions for a keyword', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(SERP_RESPONSE));
    const result = await getPaaQuestions(1, 'home care');
    expect(result.keyword).toBe('home care');
    expect(result.questions_count).toBe(3);
    expect(result.questions[0].question).toBe('What is home care?');
    expect(result.questions[0].snippet).toBe('Home care is...');
  });

  it('uses answer field when snippet is missing', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(SERP_RESPONSE));
    const result = await getPaaQuestions(1, 'home care');
    expect(result.questions[1].snippet).toBe('It varies.');
  });

  it('returns null snippet when neither snippet nor answer is present', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(SERP_RESPONSE));
    const result = await getPaaQuestions(1, 'home care');
    expect(result.questions[2].snippet).toBeNull();
  });

  it('returns empty questions when related_questions is absent', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}));
    const result = await getPaaQuestions(1, 'home care');
    expect(result.questions_count).toBe(0);
    expect(result.questions).toHaveLength(0);
  });

  it('includes SERPAPI_KEY in request URL', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}));
    await getPaaQuestions(1, 'home care');
    const url = (mockFetch.mock.calls[0] as [string, ...unknown[]])[0] as string;
    expect(url).toContain('test-serpapi-key');
    expect(url).toContain('home%20care');
  });

  it('throws when SERPAPI_KEY is missing', async () => {
    clearSerpApiKey();
    await expect(getPaaQuestions(1, 'elder care')).rejects.toThrow('Missing env var SERPAPI_KEY');
  });

  it('throws on SerpAPI HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    } as unknown as Response);
    await expect(getPaaQuestions(1, 'home care')).rejects.toThrow('SerpAPI error 429');
  });
});

// ── suggestSchemaImprovements ─────────────────────────────────────────
describe('suggestSchemaImprovements', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('identifies missing schema types for a service page', async () => {
    // Page has LocalBusiness but not Service
    const html = `<html><head>
      <script type="application/ld+json">{"@type":"LocalBusiness"}</script>
    </head></html>`;
    mockFetch.mockResolvedValueOnce(htmlResponse(html));

    const result = await suggestSchemaImprovements(1, 'https://lifecircle.in/home-care/');
    expect(result.page_type).toBe('service');
    expect(result.existing_types).toContain('LocalBusiness');
    expect(result.missing_types).toContain('Service');
    expect(result.has_gaps).toBe(true);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions[0].action).toBe('add');
  });

  it('returns has_gaps=false when all recommended types are present', async () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type":"FAQPage"}</script>
    </head></html>`;
    mockFetch.mockResolvedValueOnce(htmlResponse(html));

    const result = await suggestSchemaImprovements(1, 'https://lifecircle.in/faq/');
    expect(result.page_type).toBe('faq');
    expect(result.has_gaps).toBe(false);
    expect(result.missing_types).toHaveLength(0);
  });

  it('detects home page and checks Organization, WebSite, LocalBusiness', async () => {
    mockFetch.mockResolvedValueOnce(htmlResponse(HTML_WITH_NO_SCHEMA));

    const result = await suggestSchemaImprovements(1, 'https://lifecircle.in/');
    expect(result.page_type).toBe('home');
    expect(result.recommended_types).toEqual(RECOMMENDED_SCHEMA['home']);
    expect(result.missing_types).toEqual(expect.arrayContaining(['Organization', 'WebSite', 'LocalBusiness']));
  });

  it('returns extra_types for schema types not in recommendations', async () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type":"FAQPage"}</script>
      <script type="application/ld+json">{"@type":"Event"}</script>
    </head></html>`;
    mockFetch.mockResolvedValueOnce(htmlResponse(html));

    const result = await suggestSchemaImprovements(1, 'https://lifecircle.in/faq/');
    expect(result.extra_types).toContain('Event');
  });
});

// ── pushSchemaToPage ──────────────────────────────────────────────────
describe('pushSchemaToPage', () => {
  beforeEach(() => {
    setWpEnv(1);
    mockFetch.mockReset();
  });
  afterEach(() => clearWpEnv(1));

  const WP_PAGE_STUB = [{ id: 42 }];
  const WP_UPDATED = { id: 42, link: 'https://lifecircle.in/home-care/' };
  const SCHEMA_OBJ = { '@type': 'Service', name: 'Home Care' };

  it('resolves page ID and writes schema to meta field', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(WP_PAGE_STUB)) // GET pages?slug=
      .mockResolvedValueOnce(jsonResponse(WP_UPDATED));  // PUT /pages/42

    const result = await pushSchemaToPage(1, 'https://lifecircle.in/home-care/', SCHEMA_OBJ);
    expect(result.ok).toBe(true);
    expect(result.id).toBe(42);
    expect(result.schema_stored).toBe(true);
  });

  it('PUT payload contains _seo_agent_schema meta key with stringified JSON', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(WP_PAGE_STUB))
      .mockResolvedValueOnce(jsonResponse(WP_UPDATED));

    await pushSchemaToPage(1, 'https://lifecircle.in/home-care/', SCHEMA_OBJ);
    const putCall = mockFetch.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(putCall[1].body as string);
    expect(body.meta._seo_agent_schema).toBe(JSON.stringify(SCHEMA_OBJ));
  });

  it('payload does NOT contain status or post_status field (PUBLISH GUARD)', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(WP_PAGE_STUB))
      .mockResolvedValueOnce(jsonResponse(WP_UPDATED));

    await pushSchemaToPage(1, 'https://lifecircle.in/home-care/', SCHEMA_OBJ);
    const putCall = mockFetch.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(putCall[1].body as string);
    expect(body).not.toHaveProperty('status');
    expect(body).not.toHaveProperty('post_status');
  });

  it('falls back to posts when page not found in pages', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([]))           // GET pages?slug= → empty
      .mockResolvedValueOnce(jsonResponse(WP_PAGE_STUB)) // GET posts?slug= → found
      .mockResolvedValueOnce(jsonResponse(WP_UPDATED));  // PUT /pages/42

    const result = await pushSchemaToPage(1, 'https://lifecircle.in/home-care/', SCHEMA_OBJ);
    expect(result.ok).toBe(true);
  });

  it('throws when page is not found', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]));

    await expect(
      pushSchemaToPage(1, 'https://lifecircle.in/missing/', SCHEMA_OBJ),
    ).rejects.toThrow('Page not found');
  });

  it('throws when CMS env vars are missing', async () => {
    clearWpEnv(1);
    await expect(
      pushSchemaToPage(1, 'https://lifecircle.in/', SCHEMA_OBJ),
    ).rejects.toThrow('Missing env var CMS_API_URL_SITE_1');
  });

  it('propagates WP API errors', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(WP_PAGE_STUB))
      .mockResolvedValueOnce(jsonResponse({ message: 'Forbidden' }, false, 403));

    await expect(
      pushSchemaToPage(1, 'https://lifecircle.in/home-care/', SCHEMA_OBJ),
    ).rejects.toThrow('WP API error 403: Forbidden');
  });
});
