/**
 * Tests for reporting MCP server.
 * Slack (node:https) and Google Sheets (googleapis) calls are mocked.
 */

import { jest } from '@jest/globals';

// ── Mock spy functions ────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAppend = jest.fn<() => Promise<any>>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRequest = jest.fn<any>();

// ── ESM-safe mocks ────────────────────────────────────────────────────
jest.unstable_mockModule('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: jest.fn().mockImplementation(() => ({})),
    },
    sheets: jest.fn().mockReturnValue({
      spreadsheets: {
        values: { append: mockAppend },
      },
    }),
  },
}));

jest.unstable_mockModule('node:https', () => ({
  default: { request: mockRequest },
  request: mockRequest,
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
type ReportingModule = typeof import('../src/mcp-servers/reporting/server.js');
let postSlackMessage: ReportingModule['postSlackMessage'];
let createWeeklyDigest: ReportingModule['createWeeklyDigest'];
let writeToSheet: ReportingModule['writeToSheet'];
let logRecommendation: ReportingModule['logRecommendation'];

beforeAll(async () => {
  const mod = await import('../src/mcp-servers/reporting/server.js');
  postSlackMessage = mod.postSlackMessage;
  createWeeklyDigest = mod.createWeeklyDigest;
  writeToSheet = mod.writeToSheet;
  logRecommendation = mod.logRecommendation;
});

// ── Helpers ───────────────────────────────────────────────────────────
const MOCK_CREDENTIALS = JSON.stringify({
  type: 'service_account',
  project_id: 'test-project',
  private_key_id: 'key123',
  private_key: '-----BEGIN RSA PRIVATE KEY-----\nMOCK\n-----END RSA PRIVATE KEY-----',
  client_email: 'test@test-project.iam.gserviceaccount.com',
  client_id: '123456789',
});

function setEnv(siteId: number, value: string) {
  process.env[`GSC_OAUTH_SITE_${siteId}`] = value;
}
function clearEnv(siteId: number) {
  delete process.env[`GSC_OAUTH_SITE_${siteId}`];
}

function setupSlackRequest(response: object) {
  mockRequest.mockImplementation((_opts: unknown, callback: (res: object) => void) => {
    const mockRes = {
      on: jest.fn((event: string, handler: (data?: string) => void) => {
        if (event === 'data') handler(JSON.stringify(response));
        if (event === 'end') handler();
      }),
    };
    callback(mockRes);
    return { write: jest.fn(), end: jest.fn(), on: jest.fn() };
  });
}

const SAMPLE_RANKINGS = [
  { keyword: 'home care', position: 4.2, clicks: 312, impressions: 5400, ctr: 0.0578 },
  { keyword: 'senior care', position: 8.5, clicks: 120, impressions: 2200, ctr: 0.054 },
];


// ── postSlackMessage ──────────────────────────────────────────────────
describe('postSlackMessage', () => {
  beforeEach(() => {
    process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
    process.env.SLACK_CHANNEL_ID = 'C12345';
  });

  afterEach(() => {
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_CHANNEL_ID;
    jest.clearAllMocks();
  });

  it('posts message and returns ts and channel on success', async () => {
    setupSlackRequest({ ok: true, ts: '1234567890.123456', channel: 'C12345' });
    const result = await postSlackMessage('Weekly SEO report is ready.');
    expect(result.ok).toBe(true);
    expect(result.ts).toBe('1234567890.123456');
    expect(result.channel).toBe('C12345');
  });

  it('uses provided channel over env default', async () => {
    setupSlackRequest({ ok: true, ts: '1111', channel: 'C99999' });
    const result = await postSlackMessage('Hello', undefined, 'C99999');
    expect(result.channel).toBe('C99999');
  });

  it('includes blocks when provided', async () => {
    setupSlackRequest({ ok: true, ts: '2222', channel: 'C12345' });
    const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: '*test*' } }];
    await postSlackMessage('Fallback', blocks);
    expect(mockRequest).toHaveBeenCalled();
  });

  it('throws when SLACK_BOT_TOKEN is missing', async () => {
    delete process.env.SLACK_BOT_TOKEN;
    await expect(postSlackMessage('test')).rejects.toThrow('Missing env var SLACK_BOT_TOKEN');
  });

  it('throws when SLACK_CHANNEL_ID is missing and no channel provided', async () => {
    delete process.env.SLACK_CHANNEL_ID;
    await expect(postSlackMessage('test')).rejects.toThrow('Missing env var SLACK_CHANNEL_ID');
  });

  it('throws when Slack API returns ok=false', async () => {
    setupSlackRequest({ ok: false, error: 'channel_not_found' });
    await expect(postSlackMessage('test')).rejects.toThrow('Slack API error: channel_not_found');
  });

  it('propagates network errors', async () => {
    mockRequest.mockImplementation((_opts: unknown, _cb: unknown) => {
      const req = {
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn((event: string, handler: (err: Error) => void) => {
          if (event === 'error') handler(new Error('connect ECONNREFUSED'));
        }),
      };
      return req;
    });
    await expect(postSlackMessage('test')).rejects.toThrow('connect ECONNREFUSED');
  });
});

const SAMPLE_CMS_OPPORTUNITIES = [
  {
    url: 'https://lifecircle.in/home-care/',
    impressions: 2000,
    current_ctr: 0.01,
    current_title: 'Home Care',
    current_description: 'We offer home care.',
    suggested_title: 'Trusted Home Care Services Near You',
    suggested_description: 'Award-winning in-home care for seniors. Book a free consultation today.',
    reasoning: 'Title lacks intent signal; description has no CTA.',
  },
];

// ── createWeeklyDigest ────────────────────────────────────────────────
describe('createWeeklyDigest', () => {
  it('returns correct block structure', () => {
    const result = createWeeklyDigest(1, SAMPLE_RANKINGS, 'Focus on home care.');
    expect(result.site_id).toBe(1);
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.blocks).toBeInstanceOf(Array);
    expect(result.fallback_text).toContain('Site 1');
  });

  it('includes header block with site_id', () => {
    const result = createWeeklyDigest(1, SAMPLE_RANKINGS, 'Test');
    const header = result.blocks.find((b) => b.type === 'header');
    expect(header).toBeDefined();
    expect((header as { text: { text: string } }).text.text).toContain('lifecircle.in');
  });

  it('renders keyword rankings in a section block', () => {
    const result = createWeeklyDigest(1, SAMPLE_RANKINGS, 'Test');
    const sections = result.blocks.filter((b) => b.type === 'section');
    const rankSection = sections.find((s) =>
      (s as { text: { text: string } }).text.text.includes('home care'),
    );
    expect(rankSection).toBeDefined();
  });

  it('handles empty rankings gracefully', () => {
    const result = createWeeklyDigest(1, [], 'Test');
    const blocksText = JSON.stringify(result.blocks);
    expect(blocksText).toContain('No ranking data available');
  });

  it('renders cms meta suggestions when cms_opportunities provided', () => {
    const result = createWeeklyDigest(1, SAMPLE_RANKINGS, 'Test', SAMPLE_CMS_OPPORTUNITIES);
    const blocksText = JSON.stringify(result.blocks);
    expect(blocksText).toContain('Meta Suggestions');
    expect(blocksText).toContain('Trusted Home Care Services Near You');
    expect(blocksText).toContain('current_ctr' in SAMPLE_CMS_OPPORTUNITIES[0] ? '1.0%' : '');
  });

  it('shows no opportunities message when cms_opportunities is empty', () => {
    const result = createWeeklyDigest(1, SAMPLE_RANKINGS, 'Test', []);
    const blocksText = JSON.stringify(result.blocks);
    expect(blocksText).toContain('No low-CTR opportunities identified');
  });

  it('shows no opportunities message when cms_opportunities is omitted', () => {
    const result = createWeeklyDigest(1, SAMPLE_RANKINGS, 'Test');
    const blocksText = JSON.stringify(result.blocks);
    expect(blocksText).toContain('No low-CTR opportunities identified');
  });

  it('includes summary in a section block', () => {
    const result = createWeeklyDigest(1, SAMPLE_RANKINGS, 'Increase budget for home care ads.');
    const blocksText = JSON.stringify(result.blocks);
    expect(blocksText).toContain('Increase budget for home care ads');
  });
});

// ── writeToSheet ──────────────────────────────────────────────────────
describe('writeToSheet', () => {
  beforeEach(() => {
    setEnv(1, MOCK_CREDENTIALS);
    process.env.SHEETS_ID = '1iiyTPzblQ17-u54Y_t3TXp1iI7S3ZidQf6VHtH8UQTY';
    mockAppend.mockResolvedValue({ data: { updates: { updatedRows: 2 } } });
  });

  afterEach(() => {
    clearEnv(1);
    delete process.env.SHEETS_ID;
    jest.clearAllMocks();
  });

  it('appends rows to the correct tab and returns updated_rows', async () => {
    const rows = [['2026-03-30', 1, 'home care', 4.2, 312]];
    const result = await writeToSheet(1, 'Weekly Rankings', rows);
    expect(result.ok).toBe(true);
    expect(result.tab).toBe('Weekly Rankings');
    expect(result.updated_rows).toBe(2);
  });

  it('calls sheets.append with correct spreadsheetId and range', async () => {
    await writeToSheet(1, 'Test Tab', [['a', 'b']]);
    expect(mockAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: '1iiyTPzblQ17-u54Y_t3TXp1iI7S3ZidQf6VHtH8UQTY',
        range: 'Test Tab!A1',
        valueInputOption: 'USER_ENTERED',
      }),
    );
  });

  it('returns 0 updated_rows when API returns no updates object', async () => {
    mockAppend.mockResolvedValue({ data: {} });
    const result = await writeToSheet(1, 'Tab', [['x']]);
    expect(result.updated_rows).toBe(0);
  });

  it('throws when GSC_OAUTH_SITE_N is missing', async () => {
    clearEnv(1);
    await expect(writeToSheet(1, 'Tab', [['x']])).rejects.toThrow('Missing env var GSC_OAUTH_SITE_1');
  });

  it('throws when SHEETS_ID is missing', async () => {
    delete process.env.SHEETS_ID;
    await expect(writeToSheet(1, 'Tab', [['x']])).rejects.toThrow('Missing env var SHEETS_ID');
  });

  it('propagates Sheets API errors', async () => {
    mockAppend.mockRejectedValue(new Error('PERMISSION_DENIED'));
    await expect(writeToSheet(1, 'Tab', [['x']])).rejects.toThrow('PERMISSION_DENIED');
  });
});

// ── logRecommendation ─────────────────────────────────────────────────
describe('logRecommendation', () => {
  beforeEach(() => {
    setEnv(1, MOCK_CREDENTIALS);
    process.env.SHEETS_ID = '1iiyTPzblQ17-u54Y_t3TXp1iI7S3ZidQf6VHtH8UQTY';
    mockAppend.mockResolvedValue({ data: { updates: { updatedRows: 1 } } });
  });

  afterEach(() => {
    clearEnv(1);
    delete process.env.SHEETS_ID;
    mockAppend.mockReset();
  });

  it('writes to the Recommendation Outcomes tab', async () => {
    await logRecommendation(1, 'keyword-tracker', 'Increase bids on home care', 'pending');
    expect(mockAppend).toHaveBeenCalledWith(
      expect.objectContaining({ range: 'Recommendation Outcomes!A1' }),
    );
  });

  it('row includes date, site_id, module, recommendation, outcome', async () => {
    await logRecommendation(1, 'keyword-tracker', 'Test recommendation', 'accepted');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (mockAppend.mock.calls as any)[0][0] as { requestBody: { values: unknown[][] } };
    const row = call.requestBody.values[0];
    expect(row[1]).toBe(1);               // site_id
    expect(row[2]).toBe('keyword-tracker'); // module
    expect(row[3]).toBe('Test recommendation');
    expect(row[4]).toBe('accepted');
    expect(typeof row[0]).toBe('string'); // ISO date string
  });

  it('throws for invalid outcome', async () => {
    await expect(
      logRecommendation(1, 'mod', 'rec', 'unknown' as never),
    ).rejects.toThrow('outcome must be one of');
  });

  it('accepts all valid outcome values', async () => {
    for (const outcome of ['pending', 'accepted', 'rejected', 'successful'] as const) {
      await logRecommendation(1, 'mod', 'rec', outcome);
    }
    expect(mockAppend).toHaveBeenCalledTimes(4);
  });
});
