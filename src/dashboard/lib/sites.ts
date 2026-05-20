import { useMemo } from "react";
import { useAppSelector } from "./store/hooks";

export function useGetSite(
  siteId: number,
): { name: string; url: string; id: number } | null {
  const { websites } = useAppSelector((state) => state.config);
  const site = useMemo(() => {
    return websites.find((w) => Number(w.site_id) === siteId) ?? null;
  }, [websites, siteId]);

  return site
    ? { name: site.brand_name, url: site.domain, id: Number(site.site_id) }
    : null;
}

export function useGetSites(): Array<{
  name: string;
  url: string;
  id: number;
}> {
  const { websites } = useAppSelector((state) => state.config);
  return useMemo(() => {
    return websites.map((w) => ({
      name: w.brand_name,
      url: w.domain,
      id: Number(w.site_id),
    }));
  }, [websites]);
}

export function useGetSiteName(siteId: number): string {
  const { websites } = useAppSelector((state) => state.config);
  const siteName = useMemo(() => {
    const site = websites.find((w) => Number(w.site_id) === siteId);
    return site ? site.brand_name : `Site ${siteId}`;
  }, [websites, siteId]);

  return siteName;
}
