export const SITES: Record<number, { name: string; url: string }> = {
  1: { name: "LifeCircle", url: "https://lifecircle.in" },
};

export function getSiteName(siteId: number): string {
  return SITES[siteId]?.name ?? `Site ${siteId}`;
}
