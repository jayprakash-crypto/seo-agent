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

Connects to WordPress via REST API and Google Search Console.
Credentials:
- `CMS_API_URL_SITE_{site_id}` — WordPress site base URL (e.g. `https://lifecircle.in`)
- `CMS_API_KEY_SITE_{site_id}` — WordPress application password in `username:app_password` format
- `GSC_OAUTH_SITE_{site_id}` — GSC service account JSON (same as keyword-tracker)

---

#### `get_page`

Fetch a WordPress page's title, Rank Math meta description, and last modified date.

**Parameters**

| Name      | Type     | Required | Description            |
|-----------|----------|----------|------------------------|
| `site_id` | `number` | yes      | Site ID from config    |
| `url`     | `string` | yes      | Full URL of the page   |

**Returns**

```json
{
  "id": 42,
  "url": "https://lifecircle.in/home-care/",
  "title": "Home Care Services",
  "meta_description": "Trusted home care services in your area.",
  "last_modified": "2026-03-01T10:00:00"
}
```

> `meta_description` is read from Rank Math (`rank_math_meta.description`) when available, then `meta.meta_description`, then `null`.
> Searches WordPress `pages` first, then `posts` if not found.

---

#### `list_pages`

Return a paginated list of published WordPress pages enriched with GSC impressions, clicks, CTR, and average position.

**Parameters**

| Name      | Type     | Required | Description                                    |
|-----------|----------|----------|------------------------------------------------|
| `site_id` | `number` | yes      | Site ID from config                            |
| `limit`   | `number` | no       | Max pages to return (1–100, default `20`)      |
| `offset`  | `number` | no       | Pagination offset (default `0`)                |

**Returns**

```json
{
  "site_id": 1,
  "total": 2,
  "offset": 0,
  "pages": [
    {
      "id": 1,
      "url": "https://lifecircle.in/",
      "title": "Home",
      "modified": "2026-03-01T00:00:00",
      "impressions": 5000,
      "clicks": 200,
      "ctr": 0.04,
      "position": 3.2
    }
  ]
}
```

> GSC metrics are fetched in a single query (last 28 days, `page` dimension) and matched by URL.
> Pages with no GSC data have `impressions: 0`, `clicks: 0`, `ctr: 0`, `position: null`.

---

#### `get_page_metrics`

Return GSC impressions, clicks, CTR, and average position for a specific page URL over the last 28 days.

**Parameters**

| Name      | Type     | Required | Description            |
|-----------|----------|----------|------------------------|
| `site_id` | `number` | yes      | Site ID from config    |
| `url`     | `string` | yes      | Full URL of the page   |

**Returns**

```json
{
  "site_id": 1,
  "url": "https://lifecircle.in/home-care/",
  "impressions": 1200,
  "clicks": 45,
  "ctr": 0.0375,
  "position": 5.2,
  "date_range": { "startDate": "2026-03-02", "endDate": "2026-03-30" }
}
```

---

#### `update_page_meta`

Update a WordPress page's title and Rank Math meta description via the REST API.

> **PUBLISH GUARD** — This tool never sets `post_status` to `"publish"`. The guard is enforced at both the MCP handler level and inside the function. Any attempt to inject `status: "publish"` will throw an error.

**Parameters**

| Name          | Type     | Required | Description                    |
|---------------|----------|----------|--------------------------------|
| `site_id`     | `number` | yes      | Site ID from config            |
| `url`         | `string` | yes      | Full URL of the page to update |
| `title`       | `string` | yes      | New page title                 |
| `description` | `string` | yes      | New meta description           |

**Returns**

```json
{
  "ok": true,
  "id": 42,
  "url": "https://lifecircle.in/home-care/",
  "title": "Updated Home Care Services"
}
```

> Rank Math meta keys written: `rank_math_description` (description) and `rank_math_title` (SEO title override, via the WordPress plugin endpoint).
> The native WP post title is also updated so they stay in sync.

---

#### `get_impressions_vs_ctr`

Return pages where impressions > 100 but CTR < 3%, sorted by impressions descending. These are content improvement opportunities — pages Google is already showing but users aren't clicking.

**Parameters**

| Name      | Type     | Required | Description                           |
|-----------|----------|----------|---------------------------------------|
| `site_id` | `number` | yes      | Site ID from config                   |
| `days`    | `number` | yes      | Lookback window in days (1–90)        |

**Returns**

```json
{
  "site_id": 1,
  "days": 28,
  "threshold": { "min_impressions": 100, "max_ctr": 0.03 },
  "opportunities": [
    {
      "url": "https://lifecircle.in/home-care/",
      "impressions": 2000,
      "clicks": 20,
      "ctr": 0.01,
      "position": 6.0
    },
    {
      "url": "https://lifecircle.in/about/",
      "impressions": 800,
      "clicks": 16,
      "ctr": 0.02,
      "position": 7.5
    }
  ]
}
```

> Results sorted by `impressions` descending (highest missed-click potential first).

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
