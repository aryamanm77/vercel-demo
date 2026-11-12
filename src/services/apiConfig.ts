import { ApiResponse } from '../types';

export const API_CONFIG = {
  baseUrl: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  useMockAdapter: import.meta.env.VITE_USE_MOCK_ADAPTER !== 'false',
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
