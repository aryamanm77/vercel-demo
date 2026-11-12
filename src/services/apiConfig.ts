import { ApiResponse } from '../types';

const env = (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, string | undefined> }).env) || {};

export const API_CONFIG = {
  baseUrl: env.VITE_API_BASE_URL || '/api/v1',
  useMockAdapter: env.VITE_USE_MOCK_ADAPTER !== 'false',
  SimulatedLatencyMs: 180,
};

export async function withAdapterDelay<T>(resolver: () => T): Promise<ApiResponse<T>> {
  if (API_CONFIG.useMockAdapter) {
    await new Promise((resolve) => setTimeout(resolve, API_CONFIG.SimulatedLatencyMs));
  }
  const data = resolver();
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}
