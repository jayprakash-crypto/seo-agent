import {
  CityRowConfig,
  CompetitorRowConfig,
  KeywordsRowConfig,
  WebsitesRowConfig,
} from "@/types/data";

export function retrieveTabData(data: any) {
  const tabName = data.range.split("!")[0];
  const rows = data.values;

  return {
    tabName,
    rows,
  };
}

export function structureToWebsitesRowConfig(data: any): WebsitesRowConfig[] {
  let rows: WebsitesRowConfig[] = [];
  let temp = data.find((sheet: any) => sheet.tabName === "'Sites Config'").rows;

  rows = temp.slice(1).map((sheet: any, index: number) => ({
    rowIndex: index + 2,
    site_id: sheet[0],
    domain: sheet[1],
    brand_name: sheet[2],
    industry: sheet[3],
    cities: sheet[4],
  }));

  return rows;
}

export function structureToKeywordsRowConfig(data: any): KeywordsRowConfig[]{
  let rows: KeywordsRowConfig[] = [];
  let temp = data.find((sheet: any) => sheet.tabName === "Keywords").rows;

  rows = temp.slice(1).map((sheet: any, index: number) => ({
    rowIndex: index + 2,
    site_id: sheet[0],
    domain: sheet[1],
    target_keywords: sheet[2],
  }));

  return rows;
}

export function structureToCompetitorsRowConfig(data: any): CompetitorRowConfig[] {
  let rows: CompetitorRowConfig[] = [];
  let temp = data.find(
    (sheet: any) => sheet.tabName === "'Competitors Config'",
  ).rows;

  rows = temp.slice(1).map((sheet: any, index: number) => ({
    rowIndex: index + 2,
    site_id: sheet[0],
    domain: sheet[1],
    competitors_domain: sheet[2],
  }));

  return rows;
}

export function structureToCitiesRowConfig(data: any): CityRowConfig[] {
  let rows: CityRowConfig[] = [];
  let temp = data.find(
    (sheet: any) => sheet.tabName === "'Cities Config'",
  ).rows;

  rows = temp.slice(1).map((sheet: any, index: number) => ({
    rowIndex: index + 2,
    site_id: sheet[0],
    city: sheet[1],
    state: sheet[2],
    country: sheet[3],
    target_keyword: sheet[4],
  }));

  return rows;
}
