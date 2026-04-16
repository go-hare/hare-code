import React from 'react';
import { FpsMetricsProvider } from '../context/fpsMetrics.js';
import {
  CliRuntimeHostProvider,
  CliRuntimeHostSync,
  type CliRuntimeHostAdapter,
} from '../cli/index.js';
import { StatsProvider, type StatsStore } from '../context/stats.js';
import { type AppState, AppStateProvider } from '../state/AppState.js';
import { onChangeAppState } from '../state/onChangeAppState.js';
import type { FpsMetrics } from '../utils/fpsTracker.js';
type Props = {
  getFpsMetrics: () => FpsMetrics | undefined;
  stats?: StatsStore;
  initialState: AppState;
  runtimeHostAdapter?: CliRuntimeHostAdapter;
  children: React.ReactNode;
};

/**
 * Top-level wrapper for interactive sessions.
 * Provides FPS metrics, stats context, and app state to the component tree.
 */
export function App({
  getFpsMetrics,
  stats,
  initialState,
  runtimeHostAdapter,
  children,
}: Props): React.ReactNode {
  return (
    <FpsMetricsProvider getFpsMetrics={getFpsMetrics}>
      <StatsProvider store={stats}>
        <CliRuntimeHostProvider adapter={runtimeHostAdapter}>
          <AppStateProvider
            initialState={initialState}
            onChangeAppState={onChangeAppState}
          >
            <CliRuntimeHostSync adapter={runtimeHostAdapter} />
            {children}
          </AppStateProvider>
        </CliRuntimeHostProvider>
      </StatsProvider>
    </FpsMetricsProvider>
  );
}
