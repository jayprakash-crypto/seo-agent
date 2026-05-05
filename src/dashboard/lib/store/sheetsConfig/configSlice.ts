import {
  CityRowConfig,
  CompetitorRowConfig,
  KeywordsRowConfig,
  WebsitesRowConfig,
} from "@/types/data";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface ConfigState {
  websites: WebsitesRowConfig[];
  keywords: KeywordsRowConfig[];
  competitors: CompetitorRowConfig[];
  cities: CityRowConfig[];
  isLoading: boolean;
}

const initialState: ConfigState = {
  websites: [],
  keywords: [],
  competitors: [],
  cities: [],
  isLoading: true,
};

export const configSlice = createSlice({
  name: "config",
  initialState,
  reducers: {
    toggleIsLoading: (state) => {
      state.isLoading = false;
    },

    /**
     * Initial or update with original data
     */
    // Set initial data for websites
    setWebsites: (state, action: PayloadAction<WebsitesRowConfig[]>) => {
      state.websites = action.payload;
    },

    // Set initial data for keywords
    setKeywords: (state, action: PayloadAction<KeywordsRowConfig[]>) => {
      state.keywords = action.payload;
    },

    // Set initial data for competitors
    setCompetitors: (state, action: PayloadAction<CompetitorRowConfig[]>) => {
      state.competitors = action.payload;
    },

    // Set initial data for cities
    setCities: (state, action: PayloadAction<CityRowConfig[]>) => {
      state.cities = action.payload;
    },

    /**
     * Add row
     */
    // Add row in website
    addWebsiteRow: (state, action: PayloadAction<WebsitesRowConfig>) => {
      state.websites.push(action.payload);
    },

    // Add row in keyword
    addKeywordsRow: (state, action: PayloadAction<KeywordsRowConfig>) => {
      state.keywords.push(action.payload);
    },

    // Add row in competitor
    addCompetitorsRow: (state, action: PayloadAction<CompetitorRowConfig>) => {
      state.competitors.push(action.payload);
    },

    // Add row in city
    addCitiesRow: (state, action: PayloadAction<CityRowConfig>) => {
      state.cities.push(action.payload);
    },

    /**
     * Update row
     */
    // Update row in websites
    updateWebsiteRow: (
      state,
      action: PayloadAction<{ index: number; data: WebsitesRowConfig }>,
    ) => {
      state.websites[action.payload.index] = action.payload.data;
    },

    // Update row in keywords
    updateKeywordsRow: (
      state,
      action: PayloadAction<{ index: number; data: KeywordsRowConfig }>,
    ) => {
      state.keywords[action.payload.index] = action.payload.data;
    },

    // Update row in competitors
    updateCompetitorsRow: (
      state,
      action: PayloadAction<{ index: number; data: CompetitorRowConfig }>,
    ) => {
      state.competitors[action.payload.index] = action.payload.data;
    },

    // Update row in cities
    updateCitiesRow: (
      state,
      action: PayloadAction<{ index: number; data: CityRowConfig }>,
    ) => {
      state.cities[action.payload.index] = action.payload.data;
    },

    /**
     * Delete row
     */
    // Delete row from websites
    deleteWebsiteRow: (state, action: PayloadAction<number>) => {
      state.websites = state.websites.filter(
        (_, index) => index !== action.payload,
      );
    },

    // Delete row from keywords
    deleteKeywordsRow: (state, action: PayloadAction<number>) => {
      state.keywords = state.keywords.filter(
        (_, index) => index !== action.payload,
      );
    },

    // Delete row from competitors
    deleteCompetitorsRow: (state, action: PayloadAction<number>) => {
      state.competitors = state.competitors.filter(
        (_, index) => index !== action.payload,
      );
    },

    // Delete row from cities
    deleteCitiesRow: (state, action: PayloadAction<number>) => {
      state.cities = state.cities.filter(
        (_, index) => index !== action.payload,
      );
    },
  },
});

export const {
  toggleIsLoading,

  setWebsites,
  setKeywords,
  setCompetitors,
  setCities,

  addWebsiteRow,
  addKeywordsRow,
  addCompetitorsRow,
  addCitiesRow,

  updateWebsiteRow,
  updateKeywordsRow,
  updateCompetitorsRow,
  updateCitiesRow,

  deleteWebsiteRow,
  deleteKeywordsRow,
  deleteCompetitorsRow,
  deleteCitiesRow,
} = configSlice.actions;
export default configSlice.reducer;
