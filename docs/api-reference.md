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
