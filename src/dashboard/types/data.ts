export interface WebsitesRowConfig {
  rowIndex: number;
  site_id: string;
  domain: string;
  brand_name: string;
  industry: string;
  cities: string;
}

export interface KeywordsRowConfig {
  rowIndex: number;
  site_id: string;
  domain: string;
  target_keywords: string;
}

export interface CompetitorRowConfig {
  rowIndex: number;
  site_id: string;
  domain: string;
  competitors_domain: string;
}

export interface CityRowConfig {
  rowIndex: number;
  site_id: string;
  city: string;
  state: string;
  country: string;
  target_keyword: string;
}