"use client";

import { useEffect, useRef } from "react";
import { Provider } from "react-redux";
import { makeStore, AppStore } from "./store";
import { proxyFetch } from "../api";
import {
  retrieveTabData,
  structureToCitiesRowConfig,
  structureToCompetitorsRowConfig,
  structureToKeywordsRowConfig,
  structureToWebsitesRowConfig,
} from "../sheets";
import {
  setCities,
  setCompetitors,
  setKeywords,
  setWebsites,
  toggleIsLoading,
} from "./sheetsConfig/configSlice";

export default function StoreProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const storeRef = useRef<AppStore>(null);
  if (!storeRef.current) {
    // Create the store instance the first time this renders
    storeRef.current = makeStore();
  }

  const fetchSheet = async () => {
    const res = await proxyFetch("/api/config/google-sheet");
    const json = await res.json();
    const data = json.map((s: any) => retrieveTabData(s));

    if (storeRef.current) {
      storeRef.current.dispatch(
        setWebsites(structureToWebsitesRowConfig(data)),
      );
      storeRef.current.dispatch(
        setKeywords(structureToKeywordsRowConfig(data)),
      );
      storeRef.current.dispatch(
        setCompetitors(structureToCompetitorsRowConfig(data)),
      );
      storeRef.current.dispatch(setCities(structureToCitiesRowConfig(data)));

      storeRef.current.dispatch(toggleIsLoading());
    }
  };

  useEffect(() => {
    try {
      void fetchSheet();
    } catch (err) {
      console.error("Fetch Google Sheet : ", err);
    }
  }, [storeRef.current]);

  return <Provider store={storeRef.current}>{children}</Provider>;
}
