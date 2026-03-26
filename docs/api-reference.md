# API Reference

## MCP Servers

All MCP servers expose tools via SSE transport on port 3000.

## Common Parameters

- `site_id` (required): Integer identifying the target site (e.g., `1` for https://lifecircle.in)

## Servers

### keyword-tracker

Tracks keyword rankings via Google Search Console API.
Credentials: env var `GSC_OAUTH_SITE_{site_id}` (service account JSON).

---

#### `get_rankings`

Returns current ranking data for a list of keywords over the last 28 days.

**Parameters**

| Name       | Type       | Required | Description                              |
|------------|------------|----------|------------------------------------------|
| `site_id`  | `number`   | yes      | Site ID from config (e.g. `1`)           |
| `keywords` | `string[]` | yes      | Array of keywords to look up             |

**Returns**

```json
{
  "site_id": 1,
  "site_url": "https://lifecircle.in",
  "rankings": [
    {
      "keyword": "seo tools",
      "position": 4.2,
      "clicks": 312,
      "impressions": 5400,
      "ctr": 0.0578
    },
    {
      "keyword": "rank tracker",
      "position": null,
      "clicks": 0,
      "impressions": 0,
      "ctr": 0
    }
  ]
}
```

> `position` is `null` when GSC has no data for the keyword in the date range.

---

#### `get_ranking_history`

Returns daily position trend for a single keyword over N days.

**Parameters**

| Name      | Type     | Required | Description                                  |
|-----------|----------|----------|----------------------------------------------|
| `site_id` | `number` | yes      | Site ID from config                          |
| `keyword` | `string` | yes      | Keyword to retrieve history for              |
| `days`    | `number` | yes      | Number of days of history (1–365)            |

**Returns**

```json
{
  "site_id": 1,
  "site_url": "https://lifecircle.in",
  "keyword": "seo tools",
  "days": 7,
  "history": [
    { "date": "2026-03-18", "position": 6.1, "clicks": 40, "impressions": 820 },
    { "date": "2026-03-19", "position": 5.8, "clicks": 45, "impressions": 870 },
    { "date": "2026-03-20", "position": 5.3, "clicks": 50, "impressions": 910 },
    { "date": "2026-03-21", "position": 4.9, "clicks": 55, "impressions": 950 },
    { "date": "2026-03-22", "position": 4.5, "clicks": 60, "impressions": 990 },
    { "date": "2026-03-23", "position": 4.2, "clicks": 65, "impressions": 1020 },
    { "date": "2026-03-24", "position": 4.0, "clicks": 70, "impressions": 1060 }
  ]
}
```

> Results are sorted ascending by date. Days with no data are omitted.

---

#### `get_top_movers`

Returns keywords that moved significantly in position, comparing the last 7 days
against the prior 7-day period.

**Parameters**

| Name        | Type     | Required | Description                                                    |
|-------------|----------|----------|----------------------------------------------------------------|
| `site_id`   | `number` | yes      | Site ID from config                                            |
| `threshold` | `number` | yes      | Minimum position change to include (e.g. `3` = moved 3+ spots)|
| `direction` | `string` | yes      | `"up"` (improved), `"down"` (declined), or `"both"`           |

**Returns**

```json
{
  "site_id": 1,
  "site_url": "https://lifecircle.in",
  "threshold": 3,
  "direction": "both",
  "movers": [
    {
      "keyword": "seo tools",
      "previous_position": 8.7,
      "current_position": 4.2,
      "change": 4.5,
      "direction": "up"
    },
    {
      "keyword": "keyword research",
      "previous_position": 6.2,
      "current_position": 8.5,
      "change": -2.3,
      "direction": "down"
    }
  ]
}
```

> `change` is positive for improvements (lower position number = better rank).
> Results are sorted by `|change|` descending.

---

#### `get_rank_velocity`

Calculates the rate of position change (velocity) for a keyword over a rolling
time window using linear regression.

**Parameters**

| Name          | Type     | Required | Description                                         |
|---------------|----------|----------|-----------------------------------------------------|
| `site_id`     | `number` | yes      | Site ID from config                                 |
| `keyword`     | `string` | yes      | Keyword to analyse                                  |
| `window_days` | `number` | yes      | Rolling window in days for velocity calculation (2–90) |

**Returns**

```json
{
  "site_id": 1,
  "site_url": "https://lifecircle.in",
  "keyword": "seo tools",
  "window_days": 14,
  "velocity": -0.3,
  "trend": "improving",
  "data_points": 14,
  "interpretation": "Position changing by 0.3 places/day (improving)"
}
```

**Trend values**

| Value                | Meaning                                  |
|----------------------|------------------------------------------|
| `"improving"`        | Position number decreasing (moving up)   |
| `"declining"`        | Position number increasing (moving down) |
| `"stable"`           | Change < 0.1 positions/day               |
| `"insufficient_data"`| Fewer than 2 data points available       |

> A negative `velocity` means rank is improving (position number getting smaller).
> Returns `velocity: null` when there are insufficient data points.

---

### cms-connector

Reads and updates WordPress pages/posts via the WP REST API, merged with GSC metrics.
Credentials: `CMS_API_URL_SITE_{site_id}` (WP REST base URL, e.g. `https://lifecircle.in/wp-json/wp/v2`), `CMS_API_KEY_SITE_{site_id}` (`username:application_password`), `GSC_OAUTH_SITE_{site_id}` (service account JSON).

---

#### `get_page`

Fetch a WordPress page/post by URL. Returns title, meta description, body HTML, JSON-LD schema blocks, and last modified date.

**Parameters**

| Name      | Type     | Required | Description              |
|-----------|----------|----------|--------------------------|
| `site_id` | `number` | yes      | Site ID (e.g. `1`)       |
| `url`     | `string` | yes      | Full URL of the page     |

**Returns**

```json
{
  "site_id": 1,
  "id": 42,
  "url": "https://lifecircle.in/counselling-services",
  "title": "Counselling Services",
  "meta_description": "Professional counselling in India.",
  "body": "<p>Body HTML...</p>",
  "schema": [{ "@type": "LocalBusiness", "name": "LifeCircle" }],
  "last_modified": "2026-03-01T10:00:00",
  "status": "publish"
}
```

> `meta_description` prefers Yoast `yoast_head_json.description`; falls back to `excerpt`.
> `schema` is extracted from all `<script type="application/ld+json">` blocks in the page body.

---

#### `list_pages`

List published posts with their GSC metrics (impressions, clicks, CTR, position). Supports pagination.

**Parameters**

| Name      | Type     | Required | Description                        |
|-----------|----------|----------|------------------------------------|
| `site_id` | `number` | yes      | Site ID                            |
| `limit`   | `number` | no       | Pages per page (default: 20)       |
| `offset`  | `number` | no       | Pagination offset (default: 0)     |

**Returns**

```json
{
  "site_id": 1,
  "total": 2,
  "offset": 0,
  "pages": [
    {
      "id": 1,
      "title": "Counselling Services",
      "url": "https://lifecircle.in/counselling-services",
      "last_modified": "2026-03-01T10:00:00",
      "gsc": { "clicks": 45, "impressions": 800, "ctr_pct": 5.6, "position": 3.2 }
    }
  ]
}
```

> `gsc` is `null` for pages not found in GSC data.

---

#### `get_page_metrics`

Get GSC metrics (impressions, clicks, CTR, avg position) for a specific page URL over the last 28 days.

**Parameters**

| Name      | Type     | Required | Description          |
|-----------|----------|----------|----------------------|
| `site_id` | `number` | yes      | Site ID              |
| `url`     | `string` | yes      | Full URL of the page |

**Returns**

```json
{
  "site_id": 1,
  "url": "https://lifecircle.in/counselling-services",
  "clicks": 36,
  "impressions": 1200,
  "ctr_pct": 3.0,
  "avg_position": 4.5
}
```

> `avg_position` is `null` when GSC has no data for the page.

---

#### `update_page_meta`

Update the SEO title and/or meta description of a WordPress page/post via the REST API.

**Hard rule: this tool will never set `post_status` to `publish`. Passing `status=publish` throws a `FORBIDDEN` error immediately, before any API call is made.**

**Parameters**

| Name          | Type     | Required | Description                          |
|---------------|----------|----------|--------------------------------------|
| `site_id`     | `number` | yes      | Site ID                              |
| `url`         | `string` | yes      | Full URL of the page to update       |
| `title`       | `string` | no       | New SEO title                        |
| `description` | `string` | no       | New meta description                 |

At least one of `title` or `description` is required.

**Returns**

```json
{
  "site_id": 1,
  "id": 42,
  "url": "https://lifecircle.in/counselling-services",
  "title_updated": true,
  "description_updated": true,
  "status": "draft"
}
```

---

#### `get_impressions_vs_ctr`

Find pages with high impressions but low CTR — content improvement opportunities. Returns pages sorted by impressions descending.

**Parameters**

| Name              | Type     | Required | Description                                   |
|-------------------|----------|----------|-----------------------------------------------|
| `site_id`         | `number` | yes      | Site ID                                       |
| `days`            | `number` | no       | Date range in days (default: 28)              |
| `min_impressions` | `number` | no       | Minimum impressions to include (default: 100) |
| `max_ctr_pct`     | `number` | no       | Maximum CTR % to include (default: 3.0)       |

**Returns**

```json
{
  "site_id": 1,
  "days": 28,
  "filters": { "min_impressions": 100, "max_ctr_pct": 3.0 },
  "total": 2,
  "opportunities": [
    { "url": "https://lifecircle.in/therapy", "impressions": 2000, "clicks": 30, "ctr_pct": 1.5, "avg_position": 3.2 },
    { "url": "https://lifecircle.in/counselling", "impressions": 500, "clicks": 5, "ctr_pct": 1.0, "avg_position": 5.1 }
  ]
}
```

---

### rank-tracker
### backlink-analyzer
### content-auditor
### technical-seo
### site-speed
### schema-validator
### gsc-connector
### gbp-connector
### competitor-analyzer
### content-generator
### internal-linking
### sitemap-manager
### redirect-manager
### page-optimizer
### keyword-gap-analyzer
### serp-tracker
### report-generator
