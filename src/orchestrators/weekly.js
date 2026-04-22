import Anthropic from "@anthropic-ai/sdk";
import * as dotenv from "dotenv";

import { getKeywordRankings } from "../mcp-servers/keyword-tracker/server.js";
import {
  createApprovalQueue,
  getPage,
  getTop5PagesWithHighImpressionLowCtr,
} from "../mcp-servers/cms-connector/server.js";
import { suggestSchemaImprovementsForPages } from "../mcp-servers/schema-manager/server.js";
import { getPaaQuestionsForKeywords } from "../mcp-servers/schema-manager/server.js";
import { getKeywordsGapForCompetitorDomain } from "../mcp-servers/competitor-intel/server.js";
import { getContentsGapForCompetitorDomain } from "../mcp-servers/competitor-intel/server.js";
import { getBacklinksForCompetitorDomain } from "../mcp-servers/competitor-intel/server.js";
import { postMessageToSlack } from "../mcp-servers/reporting/server.js";
import { writeRecommendationsToSheet } from "../mcp-servers/reporting/server.js";

dotenv.config();

// ── Config ────────────────────────────────────────────────────────────
const DRY_RUN = ["1", "true", "yes"].includes(
  (process.env.DRY_RUN || "false").toLowerCase(),
);
const TIMEOUT_SECONDS = 15 * 60; // 15 minutes hard limit
const MAX_RETRIES = 3;
const RETRY_BACKOFF = [2000, 5000, 10000]; // milliseconds between retries

const KEYWORD_TRACKER_URL =
  "https://keyword-tracker-seo-agent.up.railway.app/mcp";
const CMS_CONNECTOR_URL = "https://cms-connector-seo-agent.up.railway.app/mcp";
const REPORTING_URL = "https://reporting-seo-agent.up.railway.app/mcp";
const SCHEMA_MANAGER_URL =
  "https://schema-manager-seo-agent.up.railway.app/mcp";
const COMPETITOR_INTEL_URL =
  "https://competitor-intel-seo-agent.up.railway.app/mcp";

const keywords = {
  1: ["homecare", "elder care", "home health care", "senior care"],
};

// Competitor domains to analyse per site
const competitors = {
  1: ["www.portea.com", "www.care24.co.in"],
};

// ── Helper ────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    // Claude might return explanation text alongside JSON — extract the JSON block
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (innerErr) {
        // Fallthrough to return null on secondary failure
      }
    }
    return null;
  }
}

// ── Retry helper ──────────────────────────────────────────────────────
async function callWithRetry(client, label, params) {
  let lastExc = new Error("No attempts made");

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await client.beta.messages.create(params);
    } catch (exc) {
      lastExc = exc;
      if (attempt < MAX_RETRIES - 1) {
        const waitMs = RETRY_BACKOFF[attempt];
        console.log(
          `[${label}] attempt ${attempt + 1} failed: ${exc.message}. Retrying in ${waitMs / 1000}s...`,
        );
        await sleep(waitMs);
      } else {
        console.log(`[${label}] all ${MAX_RETRIES} attempts failed.`);
      }
    }
  }
  throw lastExc;
}

// ── Step 1: Keyword rankings ──────────────────────────────────────────
async function step1KeywordRankings(client, siteId) {
  console.log(`\n[step1] Getting keyword rankings for site_id=${siteId}...`);
  const siteKeywords = keywords[siteId] || [];

  const keywordRanking = await getKeywordRankings(siteId, siteKeywords);

  //   const response = await callWithRetry(client, "step1", {
  //     model: "claude-sonnet-4-5",
  //     max_tokens: 8192,
  //     mcp_servers: [
  //       { type: "url", url: KEYWORD_TRACKER_URL, name: "keyword-tracker" },
  //     ],
  //     messages: [
  //       {
  //         role: "user",
  //         content: `You are an SEO analyst. Use the keyword-tracker tools for site_id=${siteId}.

  // Call in order:
  // 1. get_rankings with site_id=${siteId} and keywords: ${JSON.stringify(siteKeywords)}
  // 2. get_top_movers with site_id=${siteId}, threshold=3, direction="both"
  // 3. get_rank_velocity for the best-ranking keyword (lowest position number) with window_days=14

  // Return ONLY a JSON object with keys: rankings (array), top_movers (object), velocity (object), summary (string with 2-3 action items for next week). No extra text.`,
  //       },
  //     ],
  //     betas: ["mcp-client-2025-04-04"],
  //   });

  //   const text = response.content
  //     .filter((block) => block.text)
  //     .map((block) => block.text)
  //     .join("")
  //     .trim();
  //   console.log(`[step1] Done. Stop reason: ${response.stop_reason}`);

  //   const parsed = extractJson(text);
  //   if (!parsed) {
  //     console.log(
  //       `[step1] Warning: could not parse JSON from response. Raw: ${text.substring(0, 200)}`,
  //     );
  return {
    rankings: keywordRanking.rankings || [],
    top_movers: { movers: [] },
    velocity: {},
    summary: "",
  };
  //   }
  //   return parsed;
}

// ── Step 2: CMS Connector ─────────────────────────────────────────────
async function step2CmsConnector(client, siteId) {
  console.log(`\n[step2] Analyzing low-CTR pages for site_id=${siteId}...`);

  const impressionsVsCtr = await getTop5PagesWithHighImpressionLowCtr(
    siteId,
    28,
  );
  const pages = await Promise.all(
    impressionsVsCtr.map(async (row) => {
      const page = await getPage(siteId, row.url);
      return { ...page, ...row };
    }),
  );

  const response = await callWithRetry(client, "step2", {
    model: "claude-sonnet-4-5",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: `You are an SEO content analyst for site_id=${siteId}.
  ${JSON.stringify(pages)}

  - For each page from data above, write an improved title (max 60 chars) and meta description (max 155 chars) to increase CTR

  Return ONLY a JSON object with keys:
  - opportunities: array of objects with url, current_ctr, impressions, current_title, current_description, suggested_title, suggested_description, reasoning, priority (1-3 based on potential impact)
  - summary: string with 2-3 overall action items

  No extra text.`,
      },
    ],
    betas: ["mcp-client-2025-04-04"],
  });

  const text = response.content
    .filter((block) => block.text)
    .map((block) => block.text)
    .join("")
    .trim();
  console.log(`[step2] Done. Stop reason: ${response.stop_reason}`);

  const parsed = extractJson(text);
  if (!parsed) {
    console.log(
      `[step2] Warning: could not parse JSON from response. Raw: ${text.substring(0, 200)}`,
    );
    return { opportunities: [], summary: text };
  }

  await createApprovalQueue(
    parsed.opportunities.map((opp) => {
      return {
        site_id: siteId,
        module: "cms-connector",
        type: "meta_rewrite",
        priority: opp.priority,
        title: opp.current_title,
        content: {
          url: opp.url,
          current_title: opp.current_title,
          current_description: opp.current_description,
          suggested_title: opp.suggested_title,
          suggested_description: opp.suggested_description,
          reasoning: opp.reasoning,
        },
        preview_url: opp.url,
      };
    }),
  );

  return parsed;
}

// ── Step 3: Schema Manager ────────────────────────────────────────────
async function step3SchemaManager(client, siteId, cmsData = null) {
  console.log(`\n[step3] Analysing schema gaps for site_id=${siteId}...`);

  let topPages = [];
  if (cmsData && cmsData.opportunities && cmsData.opportunities.length > 0) {
    topPages = cmsData.opportunities
      .slice(0, 3)
      .map((o) => o.url)
      .filter(Boolean);
  }
  if (topPages.length === 0) {
    topPages = [];
  }

  const improvements = await suggestSchemaImprovementsForPages(topPages);

  const paaQuestions = await getPaaQuestionsForKeywords(siteId, [
    "home care services",
    "homecare",
  ]);

  return {
    pages: improvements || [],
    paa_questions: paaQuestions || [],
  };

  //   const response = await callWithRetry(client, "step3", {
  //     model: "claude-sonnet-4-5",
  //     max_tokens: 8192,
  //     mcp_servers: [
  //       { type: "url", url: SCHEMA_MANAGER_URL, name: "schema-manager" },
  //     ],
  //     messages: [
  //       {
  //         role: "user",
  //         content: `You are an SEO schema analyst for site_id=${siteId}.

  // Analyse schema markup on the following pages:
  // ${pagesList}

  // For each page:
  // 1. Call suggest_schema_improvements with site_id=${siteId} and the page URL
  // 2. If the page has missing schema types, note the suggestions

  // Also call get_paa_questions with site_id=${siteId} for keyword "home care services" to identify FAQ schema opportunities.

  // Return ONLY a JSON object with keys:
  // - pages: array of objects with url, page_type, missing_types (array), has_gaps (bool), suggestions (array)
  // - paa_questions: array of question strings (top 5)
  // - summary: string with 2-3 schema improvement action items

  // No extra text.`,
  //       },
  //     ],
  //     betas: ["mcp-client-2025-04-04"],
  //   });

  //   const text = response.content
  //     .filter((block) => block.text)
  //     .map((block) => block.text)
  //     .join("")
  //     .trim();
  //   console.log(`[step3] Done. Stop reason: ${response.stop_reason}`);

  //   const parsed = extractJson(text);
  //   if (!parsed) {
  //     console.log(
  //       `[step3] Warning: could not parse JSON. Raw: ${text.substring(0, 200)}`,
  //     );
  //     return { pages: [], paa_questions: [], summary: text };
  //   }
  //   return parsed;
}

// ── Step 4: Competitor Intel ──────────────────────────────────────────
async function step4CompetitorIntel(client, siteId) {
  console.log(`\n[step4] Running competitor analysis for site_id=${siteId}...`);

  const siteCompetitors = competitors[siteId] || [];
  if (siteCompetitors.length === 0) {
    console.log(
      `[step4] No competitors configured for site_id=${siteId}, skipping.`,
    );
    return {
      keyword_gaps: [],
      content_gaps: [],
      summary: "No competitors configured.",
    };
  }

  const keywordGaps = await getKeywordsGapForCompetitorDomain(
    siteId,
    siteCompetitors,
  );

  const contentGaps = await getContentsGapForCompetitorDomain(
    siteId,
    siteCompetitors,
  );

  const backlinks = await getBacklinksForCompetitorDomain(
    siteId,
    siteCompetitors,
  );

  const data = siteCompetitors.map((domain, idx) => ({
    competitor_domain: domain,
    keywordGaps: keywordGaps[idx].gaps || [],
    contentGaps: contentGaps[idx].topic_groups || [],
    backlinks: backlinks[idx].backlinks || [],
  }));

  return data;

  //   const response = await callWithRetry(client, "step4", {
  //     model: "claude-sonnet-4-5",
  //     max_tokens: 8192,
  //     mcp_servers: [
  //       { type: "url", url: COMPETITOR_INTEL_URL, name: "competitor-intel" },
  //     ],
  //     messages: [
  //       {
  //         role: "user",
  //         content: `You are a competitive SEO analyst for site_id=${siteId}.

  // Analyse competitor domain: ${competitorDomain}

  // Call in order:
  // 1. get_keyword_gaps with site_id=${siteId} and competitor_domain="${competitorDomain}"
  // 2. get_content_gaps with site_id=${siteId} and competitor_domain="${competitorDomain}"
  // 3. get_competitor_backlinks with site_id=${siteId} and competitor_domain="${competitorDomain}"

  // Return ONLY a JSON object with keys:
  // - competitor_domain: "${competitorDomain}"
  // - keyword_gaps: array of top 10 gap objects (keyword, competitor_position, competitor_volume)
  // - content_gaps: array of top 5 topic groups (topic, keyword_count, avg_volume)
  // - top_backlinks: array of top 5 backlinks (url_from, domain_rating, anchor)
  // - summary: string with 2-3 actionable competitor insights

  // No extra text.`,
  //       },
  //     ],
  //     betas: ["mcp-client-2025-04-04"],
  //   });

  //   const text = response.content
  //     .filter((block) => block.text)
  //     .map((block) => block.text)
  //     .join("")
  //     .trim();
  //   console.log(`[step4] Done. Stop reason: ${response.stop_reason}`);

  //   const parsed = extractJson(text);
  //   if (!parsed) {
  //     console.log(
  //       `[step4] Warning: could not parse JSON. Raw: ${text.substring(0, 200)}`,
  //     );
  //     return { keyword_gaps: [], content_gaps: [], summary: text };
  //   }
  //   return parsed;
}

// ── Step 5: Reporting ─────────────────────────────────────────────────
async function step5Reporting(client, siteId, data) {
  console.log(`\n[step5] Posting weekly digest for site_id=${siteId}...`);

  const {
    keywords,
    cmsData = null,
    schemaData = null,
    competitorData = [],
  } = data || {};

  if (DRY_RUN) {
    console.log("[step5] DRY_RUN=true — skipping Slack post and Sheets writes");
    console.log(
      `[step5] Would post digest with ${(keywords.rankings || []).length} rankings`,
    );
    if (cmsData && cmsData.opportunities) {
      console.log(
        `[step5] CMS step2 found ${cmsData.opportunities.length} low-CTR opportunities`,
      );
    }
    return;
  }

  const cmsOpportunities = (cmsData || {}).opportunities || [];
  const cmsSummary = (cmsData || {}).summary || "";

  const schemaPages = (schemaData || {}).pages || [];
  const schemaSummary = (schemaData || {}).summary || "";
  const paaQuestions = (schemaData || {}).paa_questions || [];

  const competitorKeywordGaps = (competitorData || []).map((competitor) => ({
    domain: competitor.competitor_domain,
    keywordGaps: competitor.keywordGaps || [],
  }));
  const competitorContentGaps = (competitorData || []).map((competitor) => ({
    domain: competitor.competitor_domain,
    contentGaps: competitor.contentGaps || [],
  }));
  const competitorSummary = (competitorData || {}).summary || "";
  const competitorDomain = (competitorData || {}).competitor_domain || "";

  //   let extraLogSteps = "";
  //   let stepNum = 5;

  //   if (cmsData && cmsData.opportunities && cmsData.opportunities.length > 0) {
  //     extraLogSteps += `\n${stepNum}. Call log_recommendation with site_id=${siteId}, module="cms-connector", a concise recommendation from the cms_data summary, outcome="pending"`;
  //     stepNum++;
  //   }
  //   if (schemaData && schemaData.pages && schemaData.pages.length > 0) {
  //     extraLogSteps += `\n${stepNum}. Call log_recommendation with site_id=${siteId}, module="schema-manager", a concise recommendation from the schema summary, outcome="pending"`;
  //     stepNum++;
  //   }
  //   if (
  //     competitorData &&
  //     competitorData.keyword_gaps &&
  //     competitorData.keyword_gaps.length > 0
  //   ) {
  //     extraLogSteps += `\n${stepNum}. Call log_recommendation with site_id=${siteId}, module="competitor-intel", a concise recommendation from the competitor summary, outcome="pending"`;
  //   }

  const response = await callWithRetry(client, "step5", {
    model: "claude-sonnet-4-5",
    max_tokens: 8192,
    mcp_servers: [{ type: "url", url: REPORTING_URL, name: "reporting" }],
    messages: [
      {
        role: "user",
        content: `You are an SEO reporting agent for site_id=${siteId}.

Here is all data collected this week:

## Module 1 — Keyword Performance
${JSON.stringify(keywords, null, 2)}

## Module 2 — CMS Meta Suggestions (low-CTR pages)
${cmsOpportunities.length ? JSON.stringify(cmsOpportunities, null, 2) : "No opportunities identified."}

## Module 3 — Schema Gaps
${schemaPages.length ? JSON.stringify(schemaPages, null, 2) : "No schema gap data."}
PAA questions identified: ${paaQuestions.length ? JSON.stringify(paaQuestions.slice(0, 5)) : "None"}

## Module 4 — Competitor Intelligence
Competitors Keyword gaps: ${competitorKeywordGaps.length ? JSON.stringify(competitorKeywordGaps.slice(0, 5), null, 2) : "No gaps identified."}
Competitors Content gaps: ${competitorContentGaps.length ? JSON.stringify(competitorContentGaps.slice(0, 5), null, 2) : "No content gaps."}

Please do all of the following in order:
1. From above data, create a concise summary of key insights and recommendations for next week (3-5 sentences).
2. For every module, write a recommendation with site_id=${siteId}, module=<module_name>, a concise recommendation from the module data

Return ONLY a JSON object with keys:
- summary: string with concise insights and recommendations
- recommendations: array of objects with module, recommendation_text

`,
      },
    ],
    betas: ["mcp-client-2025-04-04"],
  });

  response.content.forEach((block) => {
    if (block.text) console.log(`[step5] ${block.text}`);
  });

  const text = response.content
    .filter((block) => block.text)
    .map((block) => block.text)
    .join("")
    .trim();

  const parsed = extractJson(text);

  await writeRecommendationsToSheet(siteId, parsed.recommendations);

  await postMessageToSlack(siteId, {
    rankings: keywords.rankings || [],
    cmsOpportunities: (cmsData || {}).opportunities || [],
    schemaGaps: (schemaData || {}).pages || [],
    competitorsAlerts: competitorData,
    summary: parsed.summary || "No summary",
  });

  console.log(`[step5] Done. Stop reason: ${response.stop_reason}`);
}

// ── Summary Printer ───────────────────────────────────────────────────
function printSummary(errors, elapsed) {
  console.log(`\n[weekly] ══════════════════════════════════════════`);
  console.log(`[weekly] Pipeline complete in ${elapsed.toFixed(1)}s`);
  if (Object.keys(errors).length > 0) {
    console.log(`[weekly] Errors encountered:`);
    for (const [step, msg] of Object.entries(errors)) {
      console.log(`  ${step}: ${msg}`);
    }
  } else {
    console.log(`[weekly] All steps succeeded ✓`);
  }
  console.log(`[weekly] ══════════════════════════════════════════`);
}

// ── Main pipeline ─────────────────────────────────────────────────────
async function runWeeklyTasks(siteId) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const startTime = Date.now();
  const errors = {};

  console.log(`[weekly] ══════════════════════════════════════════`);
  console.log(`[weekly] Starting weekly pipeline — site_id=${siteId}`);
  console.log(`[weekly] DRY_RUN=${DRY_RUN}`);
  console.log(`[weekly] ══════════════════════════════════════════`);

  // ── Step 1: Keyword rankings ──────────────────────────────────────
  let keywordData = {};
  try {
    keywordData = await step1KeywordRankings(client, siteId);
  } catch (exc) {
    errors.step1 = exc.message;
    console.log(`[step1] ERROR: ${exc.message}`);
  }

  // ── Step 2: CMS connector — low-CTR page analysis ────────────────
  let cmsData = {};
  try {
    cmsData = await step2CmsConnector(client, siteId);
  } catch (exc) {
    errors.step2 = exc.message;
    console.log(`[step2] ERROR: ${exc.message}`);
  }

  // ── Step 3: Schema manager ────────────────────────────────────────
  let schemaData = {};
  try {
    schemaData = await step3SchemaManager(client, siteId, cmsData);
  } catch (exc) {
    errors.step3 = exc.message;
    console.log(`[step3] ERROR: ${exc.message}`);
  }

  // ── Step 4: Competitor intel ──────────────────────────────────────
  let competitorData = [];
  try {
    competitorData = await step4CompetitorIntel(client, siteId);
  } catch (exc) {
    errors.step4 = exc.message;
    console.log(`[step4] ERROR: ${exc.message}`);
  }

  // ── Timeout check ─────────────────────────────────────────────────
  let elapsedSeconds = (Date.now() - startTime) / 1000;
  if (elapsedSeconds > TIMEOUT_SECONDS) {
    console.log(
      `\n[weekly] TIMEOUT: pipeline exceeded ${TIMEOUT_SECONDS}s (${elapsedSeconds.toFixed(0)}s elapsed)`,
    );
    printSummary(errors, elapsedSeconds);
    return;
  }

  // ── Step 5: Reporting ─────────────────────────────────────────────
  try {
    await step5Reporting(client, siteId, {
      keywords: keywordData,
      cmsData,
      schemaData,
      competitorData,
    });
  } catch (exc) {
    errors.step5 = exc.message;
    console.log(`[step5] ERROR: ${exc.message}`);
  }

  elapsedSeconds = (Date.now() - startTime) / 1000;
  printSummary(errors, elapsedSeconds);
}

// ── Execute ───────────────────────────────────────────────────────────
// if (import.meta.url === `file://${process.argv[1]}`) {
const siteId = 1;
runWeeklyTasks(siteId).catch(console.error);
// }
