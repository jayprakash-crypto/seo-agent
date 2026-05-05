import { configureStore } from '@reduxjs/toolkit';
import configReducer from './sheetsConfig/configSlice';

export const makeStore = () => {
  return configureStore({
    reducer: {
      config: configReducer,
      // Add other feature reducers here
    },
    // Development tools are enabled by default
    devTools: process.env.NODE_ENV !== 'production',
  });
};

// Infer types for the store, state, and dispatch
export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];