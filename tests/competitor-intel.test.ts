/**
 * Tests for competitor-intel MCP server.
 * Ahrefs API (global fetch), GSC (googleapis), and node:fs (cache) are mocked.
 */

import { jest } from '@jest/globals';

// ── Mock spy functions ────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetch = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockQuery = jest.fn<() => Promise<any>>();

const mockExistsSync = jest.fn<(path: string) => boolean>();
const mockReadFileSync = jest.fn<(path: string, enc: string) => string>();
const mockWriteFileSync = jest.fn();
const mockMkdirSync = jest.fn();

// ── ESM-safe mocks ────────────────────────────────────────────────────
jest.unstable_mockModule('node:fs', () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync: mockMkdirSync,
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
}));

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
type CompetitorModule = typeof import('../src/mcp-servers/competitor-intel/server.js');
let getCompetitorKeywords: CompetitorModule['getCompetitorKeywords'];
let getKeywordGaps: CompetitorModule['getKeywordGaps'];
let getCompetitorBacklinks: CompetitorModule['getCompetitorBacklinks'];
let getContentGaps: CompetitorModule['getContentGaps'];
let readCache: CompetitorModule['readCache'];
let writeCache: CompetitorModule['writeCache'];

beforeAll(async () => {
  // Disable Ahrefs delay in tests
  process.env.AHREFS_DELAY_MS = '0';
  global.fetch = mockFetch;
  const mod = await import('../src/mcp-servers/competitor-intel/server.js');
  getCompetitorKeywords = mod.getCompetitorKeywords;
  getKeywordGaps = mod.getKeywordGaps;
  getCompetitorBacklinks = mod.getCompetitorBacklinks;
  getContentGaps = mod.getContentGaps;
  readCache = mod.readCache;
  writeCache = mod.writeCache;
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
function setAhrefsKey() {
  process.env.AHREFS_KEY = 'test-ahrefs-key';
}
function clearAhrefsKey() {
  delete process.env.AHREFS_KEY;
}

/** Returns a mock fetch Response for a JSON body */
function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Unauthorized',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

// ── Sample fixtures ───────────────────────────────────────────────────
const AHREFS_KEYWORDS_RESPONSE = {
  keywords: [
    { keyword: 'elder care services', position: 3, volume: 5000, traffic: 200 },
    { keyword: 'home health aide', position: 8, volume: 2000, traffic: 50 },
    { keyword: 'senior living options', position: 12, volume: 1500, traffic: 30 },
  ],
};

const AHREFS_BACKLINKS_RESPONSE = {
  backlinks: [
    { url_from: 'https://health.com/article', url_to: 'https://competitor.com/', domain_rating_source: 72, domain_rating_target: 45, anchor: 'elder care' },
    { url_from: 'https://news.com/post', url_to: 'https://competitor.com/services', domain_rating_source: 55, domain_rating_target: 45, anchor: 'home care' },
  ],
};

const GSC_KEYWORDS_RESPONSE = {
  data: {
    rows: [
      { keys: ['homecare'], impressions: 1000, clicks: 40, ctr: 0.04, position: 5 },
      { keys: ['elder care'], impressions: 800, clicks: 20, ctr: 0.025, position: 7 },
    ],
  },
};

// ── readCache / writeCache (unit tests) ───────────────────────────────
describe('cache helpers', () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockMkdirSync.mockReset();
  });

  it('readCache returns null when file does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    expect(readCache('competitor.com', 'keywords')).toBeNull();
  });

  it('readCache returns null when cache is older than 24h', () => {
    mockExistsSync.mockReturnValue(true);
    const stale = JSON.stringify({ timestamp: Date.now() - 25 * 60 * 60 * 1000, data: [{ keyword: 'test' }] });
    mockReadFileSync.mockReturnValue(stale);
    expect(readCache('competitor.com', 'keywords')).toBeNull();
  });

  it('readCache returns data when cache is fresh', () => {
    mockExistsSync.mockReturnValue(true);
    const fresh = JSON.stringify({ timestamp: Date.now() - 60_000, data: [{ keyword: 'test' }] });
    mockReadFileSync.mockReturnValue(fresh);
    const result = readCache('competitor.com', 'keywords');
    expect(result).toEqual([{ keyword: 'test' }]);
  });

  it('writeCache calls mkdirSync and writeFileSync', () => {
    writeCache('competitor.com', 'keywords', [{ keyword: 'test' }]);
    expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/cache', { recursive: true });
    expect(mockWriteFileSync).toHaveBeenCalled();
    const writtenContent = JSON.parse(
      (mockWriteFileSync.mock.calls[0] as [string, string])[1],
    ) as { timestamp: number; data: unknown };
    expect(writtenContent.data).toEqual([{ keyword: 'test' }]);
  });

  it('readCache returns null on JSON parse error', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('not json');
    expect(readCache('competitor.com', 'keywords')).toBeNull();
  });
});

// ── getCompetitorKeywords ─────────────────────────────────────────────
describe('getCompetitorKeywords', () => {
  beforeEach(() => {
    setAhrefsKey();
    mockFetch.mockReset();
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockMkdirSync.mockReset();
  });
  afterEach(() => clearAhrefsKey());

  it('fetches keywords from Ahrefs when cache is empty', async () => {
    mockExistsSync.mockReturnValue(false);
    mockFetch.mockResolvedValueOnce(jsonResponse(AHREFS_KEYWORDS_RESPONSE));

    const result = await getCompetitorKeywords(1, 'competitor.com');
    expect(result.keywords_count).toBe(3);
    expect(result.keywords[0].keyword).toBe('elder care services');
    expect(result.cached).toBe(false);
  });

  it('returns cached data when cache is fresh', async () => {
    const cachedKeywords = AHREFS_KEYWORDS_RESPONSE.keywords;
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ timestamp: Date.now() - 60_000, data: cachedKeywords }),
    );

    const result = await getCompetitorKeywords(1, 'competitor.com');
    expect(result.cached).toBe(true);
    expect(result.keywords_count).toBe(3);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('includes Authorization Bearer header in Ahrefs request', async () => {
    mockExistsSync.mockReturnValue(false);
    mockFetch.mockResolvedValueOnce(jsonResponse(AHREFS_KEYWORDS_RESPONSE));

    await getCompetitorKeywords(1, 'competitor.com');
    const headers = (mockFetch.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-ahrefs-key');
  });

  it('writes result to cache after successful fetch', async () => {
    mockExistsSync.mockReturnValue(false);
    mockFetch.mockResolvedValueOnce(jsonResponse(AHREFS_KEYWORDS_RESPONSE));

    await getCompetitorKeywords(1, 'competitor.com');
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it('throws when AHREFS_KEY is missing', async () => {
    clearAhrefsKey();
    mockExistsSync.mockReturnValue(false);
    await expect(getCompetitorKeywords(1, 'competitor.com')).rejects.toThrow('Missing env var AHREFS_KEY');
  });

  it('throws on Ahrefs API error', async () => {
    mockExistsSync.mockReturnValue(false);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => 'Forbidden',
    } as unknown as Response);

    await expect(getCompetitorKeywords(1, 'competitor.com')).rejects.toThrow('Ahrefs API error 403');
  });
});

// ── getKeywordGaps ────────────────────────────────────────────────────
describe('getKeywordGaps', () => {
  beforeEach(() => {
    setGscEnv(1);
    setAhrefsKey();
    mockFetch.mockReset();
    mockQuery.mockReset();
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockMkdirSync.mockReset();
  });
  afterEach(() => {
    clearGscEnv(1);
    clearAhrefsKey();
  });

  it('returns keywords competitor ranks for that site does not', async () => {
    // Site ranks for: 'homecare', 'elder care'
    mockQuery.mockResolvedValueOnce(GSC_KEYWORDS_RESPONSE);
    // Competitor ranks for: 'elder care services', 'home health aide', 'senior living options'
    mockExistsSync.mockReturnValue(false);
    mockFetch.mockResolvedValueOnce(jsonResponse(AHREFS_KEYWORDS_RESPONSE));

    const result = await getKeywordGaps(1, 'competitor.com');
    // 'elder care services', 'home health aide', 'senior living options' are gaps
    // 'elder care' is NOT a gap (site ranks for it)
    expect(result.gap_count).toBeGreaterThan(0);
    const gapKeywords = result.gaps.map((g) => g.keyword);
    expect(gapKeywords).toContain('elder care services');
    expect(gapKeywords).toContain('home health aide');
    expect(gapKeywords).not.toContain('elder care');
  });

  it('returns zero gaps when site already ranks for all competitor keywords', async () => {
    mockQuery.mockResolvedValueOnce({
      data: {
        rows: [
          { keys: ['elder care services'] },
          { keys: ['home health aide'] },
          { keys: ['senior living options'] },
        ],
      },
    });
    mockExistsSync.mockReturnValue(false);
    mockFetch.mockResolvedValueOnce(jsonResponse(AHREFS_KEYWORDS_RESPONSE));

    const result = await getKeywordGaps(1, 'competitor.com');
    expect(result.gap_count).toBe(0);
    expect(result.gaps).toHaveLength(0);
  });

  it('sorts gaps by competitor_volume descending', async () => {
    mockQuery.mockResolvedValueOnce(GSC_KEYWORDS_RESPONSE);
    mockExistsSync.mockReturnValue(false);
    mockFetch.mockResolvedValueOnce(jsonResponse(AHREFS_KEYWORDS_RESPONSE));

    const result = await getKeywordGaps(1, 'competitor.com');
    for (let i = 1; i < result.gaps.length; i++) {
      expect(result.gaps[i - 1].competitor_volume).toBeGreaterThanOrEqual(
        result.gaps[i].competitor_volume,
      );
    }
  });

  it('throws when GSC_OAUTH env var is missing', async () => {
    clearGscEnv(1);
    await expect(getKeywordGaps(1, 'competitor.com')).rejects.toThrow(
      'Missing env var GSC_OAUTH_SITE_1',
    );
  });
});

// ── getCompetitorBacklinks ────────────────────────────────────────────
describe('getCompetitorBacklinks', () => {
  beforeEach(() => {
    setAhrefsKey();
    mockFetch.mockReset();
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockMkdirSync.mockReset();
  });
  afterEach(() => clearAhrefsKey());

  it('fetches backlinks from Ahrefs when cache is empty', async () => {
    mockExistsSync.mockReturnValue(false);
    mockFetch.mockResolvedValueOnce(jsonResponse(AHREFS_BACKLINKS_RESPONSE));

    const result = await getCompetitorBacklinks(1, 'competitor.com');
    expect(result.backlinks_count).toBe(2);
    expect(result.backlinks[0].url_from).toBe('https://health.com/article');
    expect(result.backlinks[0].domain_rating_source).toBe(72);
    expect(result.cached).toBe(false);
  });

  it('returns cached backlinks when cache is fresh', async () => {
    const cachedBacklinks = AHREFS_BACKLINKS_RESPONSE.backlinks;
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ timestamp: Date.now() - 60_000, data: cachedBacklinks }),
    );

    const result = await getCompetitorBacklinks(1, 'competitor.com');
    expect(result.cached).toBe(true);
    expect(result.backlinks_count).toBe(2);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('writes backlinks to cache after fetch', async () => {
    mockExistsSync.mockReturnValue(false);
    mockFetch.mockResolvedValueOnce(jsonResponse(AHREFS_BACKLINKS_RESPONSE));

    await getCompetitorBacklinks(1, 'competitor.com');
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it('throws when AHREFS_KEY is missing', async () => {
    clearAhrefsKey();
    mockExistsSync.mockReturnValue(false);
    await expect(getCompetitorBacklinks(1, 'competitor.com')).rejects.toThrow(
      'Missing env var AHREFS_KEY',
    );
  });
});

// ── getContentGaps ────────────────────────────────────────────────────
describe('getContentGaps', () => {
  beforeEach(() => {
    setGscEnv(1);
    setAhrefsKey();
    mockFetch.mockReset();
    mockQuery.mockReset();
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockMkdirSync.mockReset();
  });
  afterEach(() => {
    clearGscEnv(1);
    clearAhrefsKey();
  });

  it('clusters gap keywords into topic groups', async () => {
    mockQuery.mockResolvedValueOnce(GSC_KEYWORDS_RESPONSE);
    mockExistsSync.mockReturnValue(false);
    mockFetch.mockResolvedValueOnce(jsonResponse(AHREFS_KEYWORDS_RESPONSE));

    const result = await getContentGaps(1, 'competitor.com');
    expect(result.topic_groups_count).toBeGreaterThan(0);
    expect(result.topic_groups[0]).toHaveProperty('topic');
    expect(result.topic_groups[0]).toHaveProperty('keywords');
    expect(result.topic_groups[0]).toHaveProperty('keyword_count');
    expect(result.topic_groups[0]).toHaveProperty('avg_volume');
  });

  it('sorts topic groups by avg_volume descending', async () => {
    mockQuery.mockResolvedValueOnce(GSC_KEYWORDS_RESPONSE);
    mockExistsSync.mockReturnValue(false);
    mockFetch.mockResolvedValueOnce(jsonResponse(AHREFS_KEYWORDS_RESPONSE));

    const result = await getContentGaps(1, 'competitor.com');
    for (let i = 1; i < result.topic_groups.length; i++) {
      expect(result.topic_groups[i - 1].avg_volume).toBeGreaterThanOrEqual(
        result.topic_groups[i].avg_volume,
      );
    }
  });

  it('returns empty topic_groups when there are no gaps', async () => {
    mockQuery.mockResolvedValueOnce({
      data: {
        rows: [
          { keys: ['elder care services'] },
          { keys: ['home health aide'] },
          { keys: ['senior living options'] },
        ],
      },
    });
    mockExistsSync.mockReturnValue(false);
    mockFetch.mockResolvedValueOnce(jsonResponse(AHREFS_KEYWORDS_RESPONSE));

    const result = await getContentGaps(1, 'competitor.com');
    expect(result.topic_groups_count).toBe(0);
    expect(result.topic_groups).toHaveLength(0);
  });
});
