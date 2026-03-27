/**
 * Tests for keyword-tracker MCP server
 * All GSC API calls are mocked — no real API calls are made.
 */

import { jest } from '@jest/globals';

// ── ESM-safe mocking: unstable_mockModule + dynamic import ────────────
// Create the spy function at module scope so tests can configure it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockQuery = jest.fn<() => Promise<any>>();

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

// ── Dynamic import after mocks are registered ─────────────────────────
type ServerModule = typeof import('../src/mcp-servers/keyword-tracker/server.js');
let getRankings: ServerModule['getRankings'];
let getRankingHistory: ServerModule['getRankingHistory'];
let getTopMovers: ServerModule['getTopMovers'];
let getRankVelocity: ServerModule['getRankVelocity'];
let validateSiteId: ServerModule['validateSiteId'];
let getSiteUrl: ServerModule['getSiteUrl'];

beforeAll(async () => {
  const mod = await import('../src/mcp-servers/keyword-tracker/server.js');
  getRankings = mod.getRankings;
  getRankingHistory = mod.getRankingHistory;
  getTopMovers = mod.getTopMovers;
  getRankVelocity = mod.getRankVelocity;
  validateSiteId = mod.validateSiteId;
  getSiteUrl = mod.getSiteUrl;
});

// ── Test helpers ───────────────────────────────────────────────────────
function setEnv(siteId: number, value: string) {
  process.env[`GSC_OAUTH_SITE_${siteId}`] = value;
}

function clearEnv(siteId: number) {
  delete process.env[`GSC_OAUTH_SITE_${siteId}`];
}

const MOCK_CREDENTIALS = JSON.stringify({
  type: 'service_account',
  project_id: 'test-project',
  private_key_id: 'key123',
  private_key: '-----BEGIN RSA PRIVATE KEY-----\nMOCK\n-----END RSA PRIVATE KEY-----',
  client_email: 'test@test-project.iam.gserviceaccount.com',
  client_id: '123456789',
});

// ── Realistic mock data ────────────────────────────────────────────────
const MOCK_RANKINGS_ROWS = [
  {
    keys: ['seo tools'],
    position: 4.2,
    clicks: 312,
    impressions: 5400,
    ctr: 0.0578,
  },
];

const MOCK_HISTORY_ROWS = [
  { keys: ['seo tools', '2026-03-18'], position: 6.1, clicks: 40, impressions: 820 },
  { keys: ['seo tools', '2026-03-19'], position: 5.8, clicks: 45, impressions: 870 },
  { keys: ['seo tools', '2026-03-20'], position: 5.3, clicks: 50, impressions: 910 },
  { keys: ['seo tools', '2026-03-21'], position: 4.9, clicks: 55, impressions: 950 },
  { keys: ['seo tools', '2026-03-22'], position: 4.5, clicks: 60, impressions: 990 },
  { keys: ['seo tools', '2026-03-23'], position: 4.2, clicks: 65, impressions: 1020 },
  { keys: ['seo tools', '2026-03-24'], position: 4.0, clicks: 70, impressions: 1060 },
];

const MOCK_CURRENT_ROWS = [
  { keys: ['seo tools'], position: 4.2, clicks: 312, impressions: 5400 },
  { keys: ['keyword research'], position: 8.5, clicks: 120, impressions: 2200 },
  { keys: ['rank tracker'], position: 12.1, clicks: 80, impressions: 1800 },
];

const MOCK_PREV_ROWS = [
  { keys: ['seo tools'], position: 8.7, clicks: 180, impressions: 4200 },        // +4.5 up
  { keys: ['keyword research'], position: 6.2, clicks: 200, impressions: 3100 }, // -2.3 down
  { keys: ['rank tracker'], position: 13.0, clicks: 70, impressions: 1700 },     // +0.9 (small)
];

// ── validateSiteId ────────────────────────────────────────────────────
describe('validateSiteId', () => {
  it('returns numeric id for valid integer', () => {
    expect(validateSiteId(1)).toBe(1);
    expect(validateSiteId('5')).toBe(5);
  });

  it('throws for non-integer site_id', () => {
    expect(() => validateSiteId(0)).toThrow('Invalid site_id');
    expect(() => validateSiteId(-1)).toThrow('Invalid site_id');
    expect(() => validateSiteId('abc')).toThrow('Invalid site_id');
  });
});

// ── getSiteUrl ────────────────────────────────────────────────────────
describe('getSiteUrl', () => {
  it('returns correct URL for site_id=1', () => {
    expect(getSiteUrl(1)).toBe('https://lifecircle.in');
  });

  it('throws for unknown site_id', () => {
    expect(() => getSiteUrl(99)).toThrow('Unknown site_id=99');
  });
});

// ── getRankings ───────────────────────────────────────────────────────
describe('getRankings', () => {
  beforeEach(() => {
    setEnv(1, MOCK_CREDENTIALS);
    mockQuery.mockResolvedValue({ data: { rows: MOCK_RANKINGS_ROWS } });
  });

  afterEach(() => {
    clearEnv(1);
    mockQuery.mockReset();
  });

  it('returns position, clicks, impressions, ctr per keyword', async () => {
    const result = await getRankings(1, ['seo tools']);

    expect(result.site_id).toBe(1);
    expect(result.site_url).toBe('https://lifecircle.in');
    expect(result.rankings).toHaveLength(1);
    expect(result.rankings[0]).toMatchObject({
      keyword: 'seo tools',
      position: 4.2,
      clicks: 312,
      impressions: 5400,
      ctr: 0.0578,
    });
  });

  it('handles multiple keywords in a single call', async () => {
    mockQuery
      .mockResolvedValueOnce({ data: { rows: MOCK_RANKINGS_ROWS } })
      .mockResolvedValueOnce({
        data: {
          rows: [{ keys: ['keyword research'], position: 8.5, clicks: 120, impressions: 2200, ctr: 0.054 }],
        },
      });

    const result = await getRankings(1, ['seo tools', 'keyword research']);
    expect(result.rankings).toHaveLength(2);
  });

  it('returns null position for keywords not found in GSC', async () => {
    mockQuery.mockResolvedValue({ data: { rows: [] } });
    const result = await getRankings(1, ['nonexistent keyword']);
    expect(result.rankings[0].position).toBeNull();
    expect(result.rankings[0].clicks).toBe(0);
  });

  it('throws when keywords array is empty', async () => {
    await expect(getRankings(1, [])).rejects.toThrow('keywords must be a non-empty array');
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  it('throws when keywords is not an array', async () => {
    await expect(getRankings(1, 'not-an-array' as any)).rejects.toThrow(
      'keywords must be a non-empty array'
    );
  });

  it('throws for missing GSC credentials (invalid site_id env)', async () => {
    clearEnv(1);
    await expect(getRankings(1, ['seo tools'])).rejects.toThrow('Missing env var GSC_OAUTH_SITE_1');
  });

  it('propagates API timeout errors', async () => {
    mockQuery.mockRejectedValue(new Error('ETIMEDOUT: connection timed out'));
    await expect(getRankings(1, ['seo tools'])).rejects.toThrow('ETIMEDOUT');
  });
});

// ── getRankingHistory ─────────────────────────────────────────────────
describe('getRankingHistory', () => {
  beforeEach(() => {
    setEnv(1, MOCK_CREDENTIALS);
    mockQuery.mockResolvedValue({ data: { rows: MOCK_HISTORY_ROWS } });
  });

  afterEach(() => {
    clearEnv(1);
    mockQuery.mockReset();
  });

  it('returns date-sorted history array with correct shape', async () => {
    const result = await getRankingHistory(1, 'seo tools', 7);

    expect(result.site_id).toBe(1);
    expect(result.keyword).toBe('seo tools');
    expect(result.days).toBe(7);
    expect(result.history).toHaveLength(7);

    // Verify sorted ascending by date
    for (let i = 1; i < result.history.length; i++) {
      expect(result.history[i].date >= result.history[i - 1].date).toBe(true);
    }

    expect(result.history[0]).toMatchObject({
      date: '2026-03-18',
      position: 6.1,
      clicks: 40,
      impressions: 820,
    });
  });

  it('returns empty history when GSC has no data', async () => {
    mockQuery.mockResolvedValue({ data: { rows: [] } });
    const result = await getRankingHistory(1, 'new keyword', 30);
    expect(result.history).toHaveLength(0);
  });

  it('throws for empty keyword string', async () => {
    await expect(getRankingHistory(1, '', 7)).rejects.toThrow('keyword must be a non-empty string');
  });

  it('throws for days out of range', async () => {
    await expect(getRankingHistory(1, 'seo tools', 0)).rejects.toThrow(
      'days must be an integer between 1 and 365'
    );
    await expect(getRankingHistory(1, 'seo tools', 400)).rejects.toThrow(
      'days must be an integer between 1 and 365'
    );
  });

  it('throws for missing site credentials', async () => {
    clearEnv(1);
    await expect(getRankingHistory(1, 'seo tools', 7)).rejects.toThrow(
      'Missing env var GSC_OAUTH_SITE_1'
    );
  });

  it('propagates API timeout errors', async () => {
    mockQuery.mockRejectedValue(new Error('socket hang up'));
    await expect(getRankingHistory(1, 'seo tools', 7)).rejects.toThrow('socket hang up');
  });
});

// ── getTopMovers ──────────────────────────────────────────────────────
describe('getTopMovers', () => {
  beforeEach(() => {
    setEnv(1, MOCK_CREDENTIALS);
    mockQuery
      .mockResolvedValueOnce({ data: { rows: MOCK_CURRENT_ROWS } })
      .mockResolvedValueOnce({ data: { rows: MOCK_PREV_ROWS } });
  });

  afterEach(() => {
    clearEnv(1);
    mockQuery.mockReset();
  });

  it('returns keywords that moved up by more than threshold', async () => {
    const result = await getTopMovers(1, 3, 'up');

    expect(result.site_id).toBe(1);
    expect(result.threshold).toBe(3);
    expect(result.direction).toBe('up');

    // 'seo tools' moved from 8.7 → 4.2 = +4.5 positions (up)
    const mover = result.movers.find((m) => m.keyword === 'seo tools');
    expect(mover).toBeDefined();
    expect(mover!.direction).toBe('up');
    expect(mover!.change).toBeGreaterThanOrEqual(3);

    // 'keyword research' went down (6.2 → 8.5), should not appear in 'up'
    const downMover = result.movers.find((m) => m.keyword === 'keyword research');
    expect(downMover).toBeUndefined();
  });

  it('returns keywords that moved down when direction=down', async () => {
    mockQuery
      .mockResolvedValueOnce({ data: { rows: MOCK_CURRENT_ROWS } })
      .mockResolvedValueOnce({ data: { rows: MOCK_PREV_ROWS } });

    const result = await getTopMovers(1, 2, 'down');
    const downMover = result.movers.find((m) => m.keyword === 'keyword research');
    expect(downMover).toBeDefined();
    expect(downMover!.direction).toBe('down');
  });

  it('returns both up and down movers when direction=both', async () => {
    mockQuery
      .mockResolvedValueOnce({ data: { rows: MOCK_CURRENT_ROWS } })
      .mockResolvedValueOnce({ data: { rows: MOCK_PREV_ROWS } });

    const result = await getTopMovers(1, 1, 'both');
    const dirs = result.movers.map((m) => m.direction);
    expect(dirs).toContain('up');
    expect(dirs).toContain('down');
  });

  it('movers are sorted by absolute change descending', async () => {
    mockQuery
      .mockResolvedValueOnce({ data: { rows: MOCK_CURRENT_ROWS } })
      .mockResolvedValueOnce({ data: { rows: MOCK_PREV_ROWS } });

    const result = await getTopMovers(1, 1, 'both');
    for (let i = 1; i < result.movers.length; i++) {
      expect(Math.abs(result.movers[i - 1].change)).toBeGreaterThanOrEqual(
        Math.abs(result.movers[i].change)
      );
    }
  });

  it('returns empty array when no movers exceed threshold', async () => {
    mockQuery
      .mockResolvedValueOnce({ data: { rows: MOCK_CURRENT_ROWS } })
      .mockResolvedValueOnce({ data: { rows: MOCK_PREV_ROWS } });

    const result = await getTopMovers(1, 100, 'both');
    expect(result.movers).toHaveLength(0);
  });

  it('throws for invalid direction', async () => {
    await expect(getTopMovers(1, 3, 'sideways' as any)).rejects.toThrow(
      'direction must be "up", "down", or "both"'
    );
  });

  it('throws for non-positive threshold', async () => {
    await expect(getTopMovers(1, 0, 'both')).rejects.toThrow(
      'threshold must be a positive number'
    );
  });

  it('throws for missing site credentials', async () => {
    clearEnv(1);
    await expect(getTopMovers(1, 3, 'up')).rejects.toThrow('Missing env var GSC_OAUTH_SITE_1');
  });

  it('propagates API timeout errors', async () => {
    mockQuery.mockReset();
    mockQuery.mockRejectedValue(new Error('Request timeout'));
    await expect(getTopMovers(1, 3, 'both')).rejects.toThrow('Request timeout');
  });
});

// ── getRankVelocity ───────────────────────────────────────────────────
describe('getRankVelocity', () => {
  beforeEach(() => {
    setEnv(1, MOCK_CREDENTIALS);
    mockQuery.mockResolvedValue({ data: { rows: MOCK_HISTORY_ROWS } });
  });

  afterEach(() => {
    clearEnv(1);
    mockQuery.mockReset();
  });

  it('calculates negative velocity (improving rank) correctly', async () => {
    // Positions go: 6.1, 5.8, 5.3, 4.9, 4.5, 4.2, 4.0 — steadily decreasing (improving)
    const result = await getRankVelocity(1, 'seo tools', 7);

    expect(result.site_id).toBe(1);
    expect(result.keyword).toBe('seo tools');
    expect(result.window_days).toBe(7);
    expect(result.data_points).toBe(7);
    expect(result.trend).toBe('improving');
    expect(result.velocity).toBeLessThan(0); // negative = moving to better position
    expect(result.interpretation).toMatch(/improving/);
  });

  it('returns insufficient_data when fewer than 2 data points', async () => {
    mockQuery.mockResolvedValue({ data: { rows: [MOCK_HISTORY_ROWS[0]] } });
    const result = await getRankVelocity(1, 'rare keyword', 7);
    expect(result.trend).toBe('insufficient_data');
    expect(result.velocity).toBeNull();
  });

  it('returns stable trend when velocity is near zero', async () => {
    const flatRows = Array.from({ length: 7 }, (_, i) => ({
      keys: ['stable keyword', `2026-03-${18 + i}`],
      position: 5.0,
      clicks: 50,
      impressions: 1000,
    }));
    mockQuery.mockResolvedValue({ data: { rows: flatRows } });

    const result = await getRankVelocity(1, 'stable keyword', 7);
    expect(result.trend).toBe('stable');
    expect(Math.abs(result.velocity as number)).toBeLessThan(0.1);
  });

  it('throws for empty keyword', async () => {
    await expect(getRankVelocity(1, '', 7)).rejects.toThrow(
      'keyword must be a non-empty string'
    );
  });

  it('throws when window_days is out of range', async () => {
    await expect(getRankVelocity(1, 'seo tools', 1)).rejects.toThrow(
      'window_days must be an integer between 2 and 90'
    );
    await expect(getRankVelocity(1, 'seo tools', 100)).rejects.toThrow(
      'window_days must be an integer between 2 and 90'
    );
  });

  it('throws for missing site credentials', async () => {
    clearEnv(1);
    await expect(getRankVelocity(1, 'seo tools', 7)).rejects.toThrow(
      'Missing env var GSC_OAUTH_SITE_1'
    );
  });

  it('propagates API timeout errors', async () => {
    mockQuery.mockRejectedValue(new Error('connect ECONNREFUSED'));
    await expect(getRankVelocity(1, 'seo tools', 7)).rejects.toThrow('connect ECONNREFUSED');
  });
});
