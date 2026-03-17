import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the config module before importing client
vi.mock('../config', () => ({
  API_BASE_URL: 'http://test-api',
}));

import {
  checkHealth,
  fetchBusinessUnits,
  fetchHierarchy,
  extractAttributesBatch,
  fetchAppSettings,
  fetchBatchProgress,
} from '../client';

// ---------------------------------------------------------------------------
// Global fetch mock
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Helper to build a minimal Response-like object
function mockResponse(status: number, body: any, ok?: boolean) {
  return {
    ok: ok ?? (status >= 200 && status < 300),
    status,
    json: () => Promise.resolve(body),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('API Client', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // 1. Successful GET returns parsed JSON
  // =========================================================================
  it('should return parsed data on a successful GET (checkHealth)', async () => {
    const payload = { success: true, data: { status: 'ok', timestamp: '2026-01-01T00:00:00Z' } };
    mockFetch.mockResolvedValueOnce(mockResponse(200, payload));

    const result = await checkHealth();

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ status: 'ok', timestamp: '2026-01-01T00:00:00Z' });
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      'http://test-api/health',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('should return parsed data on a successful GET (fetchBusinessUnits)', async () => {
    const payload = {
      success: true,
      data: [
        { id: 1, name: 'BU1', productCount: 100 },
        { id: 2, name: 'BU2', productCount: 200 },
      ],
    };
    mockFetch.mockResolvedValueOnce(mockResponse(200, payload));

    const result = await fetchBusinessUnits();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
  });

  // =========================================================================
  // 2. HTTP error (non-retryable, e.g. 400) returns error immediately
  // =========================================================================
  it('should return error object on 400 without retrying', async () => {
    const errorBody = { error: { code: 'BAD_REQUEST', message: 'Invalid params' } };
    mockFetch.mockResolvedValueOnce(mockResponse(400, errorBody, false));

    const result = await checkHealth();

    expect(result.success).toBe(false);
    expect(result.error).toEqual({ code: 'BAD_REQUEST', message: 'Invalid params' });
    // No retry for 400
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  // =========================================================================
  // 3. HTTP 500 on GET triggers retries, then returns error
  // =========================================================================
  it('should retry on 500 for GET requests and eventually return error', async () => {
    const errorBody = { error: { code: 'SERVER_ERROR', message: 'Internal error' } };

    // 3 calls total: initial + 2 retries. All return 500.
    mockFetch
      .mockResolvedValueOnce(mockResponse(500, errorBody, false))
      .mockResolvedValueOnce(mockResponse(500, errorBody, false))
      .mockResolvedValueOnce(mockResponse(500, errorBody, false));

    // The request uses setTimeout for retry delays. We need to advance timers.
    const resultPromise = checkHealth();

    // Advance past retry delay for attempt 1 (1000ms)
    await vi.advanceTimersByTimeAsync(1500);
    // Advance past retry delay for attempt 2 (2000ms)
    await vi.advanceTimersByTimeAsync(2500);

    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SERVER_ERROR');
    // Initial + 2 retries = 3 fetch calls
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  // =========================================================================
  // 4. HTTP 500 on GET with eventual recovery
  // =========================================================================
  it('should succeed after retry when server recovers', async () => {
    const errorBody = { error: { code: 'SERVER_ERROR', message: 'Internal error' } };
    const successBody = { success: true, data: { status: 'ok', timestamp: 'now' } };

    mockFetch
      .mockResolvedValueOnce(mockResponse(500, errorBody, false))
      .mockResolvedValueOnce(mockResponse(200, successBody));

    const resultPromise = checkHealth();
    await vi.advanceTimersByTimeAsync(1500);
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // =========================================================================
  // 5. POST requests do NOT retry on 500
  // =========================================================================
  it('should NOT retry POST requests on 500', async () => {
    const errorBody = { error: { code: 'SERVER_ERROR', message: 'Internal error' } };
    mockFetch.mockResolvedValueOnce(mockResponse(500, errorBody, false));

    const result = await extractAttributesBatch(1, [
      { style_id: 'S1', color_id: 'C1', image_url: 'http://img.jpg' },
    ]);

    expect(result.success).toBe(false);
    // POST should not retry — only 1 fetch call
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  // =========================================================================
  // 6. Network error returns NETWORK_ERROR
  // =========================================================================
  it('should return NETWORK_ERROR on fetch failure (after retries for GET)', async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const resultPromise = fetchBusinessUnits();

    await vi.advanceTimersByTimeAsync(1500);
    await vi.advanceTimersByTimeAsync(2500);

    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NETWORK_ERROR');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  // =========================================================================
  // 7. Network error on POST does NOT retry
  // =========================================================================
  it('should return NETWORK_ERROR on POST without retrying', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    // extractAttributesBatch wraps the response — its `error` is a string (message), not an object.
    // We test via a simpler POST wrapper instead: saveDatabaseConfig uses request() directly.
    const { saveDatabaseConfig } = await import('../client');
    const result = await saveDatabaseConfig({ name: 'test', user: 'u', connect_string: 'cs' });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NETWORK_ERROR');
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  // =========================================================================
  // 8. Abort/Timeout returns TIMEOUT error code
  // =========================================================================
  it('should return TIMEOUT when AbortError is thrown (after retries for GET)', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');

    mockFetch
      .mockRejectedValueOnce(abortError)
      .mockRejectedValueOnce(abortError)
      .mockRejectedValueOnce(abortError);

    const resultPromise = checkHealth();

    await vi.advanceTimersByTimeAsync(1500);
    await vi.advanceTimersByTimeAsync(2500);

    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('TIMEOUT');
    expect(result.error?.message).toContain('timed out');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  // =========================================================================
  // 9. AbortSignal is passed to fetch
  // =========================================================================
  it('should pass an AbortSignal to fetch', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { success: true, data: {} }));

    await checkHealth();

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].signal).toBeInstanceOf(AbortSignal);
  });

  // =========================================================================
  // 10. Correct URL construction
  // =========================================================================
  it('should construct correct URL with query params (fetchHierarchy)', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(200, { success: true, data: { departments: [], brands: [], seasons: [], vendors: [], banners: [] } }),
    );

    await fetchHierarchy(42);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://test-api/products/hierarchy?business_unit_id=42',
      expect.any(Object),
    );
  });

  // =========================================================================
  // 11. POST sends correct body
  // =========================================================================
  it('should send JSON body on POST (extractAttributesBatch)', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(200, { success: true, data: { data: [{ result: 'ok' }], batchId: 'b1' } }),
    );

    const result = await extractAttributesBatch(1, [
      { style_id: 'S1', color_id: 'C1', image_url: 'http://img.jpg' },
    ]);

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.business_unit_id).toBe(1);
    expect(body.images).toHaveLength(1);
    expect(body.images[0].style_id).toBe('S1');

    // Verify return shape of extractAttributesBatch wrapper
    expect(result.success).toBe(true);
    expect(result.data).toEqual([{ result: 'ok' }]);
    expect(result.batchId).toBe('b1');
  });

  // =========================================================================
  // 12. HTTP error with no `error` field in body falls back to generic
  // =========================================================================
  it('should fall back to generic HTTP_ERROR when body has no error field', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(403, {}, false));

    const result = await checkHealth();

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('HTTP_ERROR');
    expect(result.error?.message).toBe('HTTP 403');
  });

  // =========================================================================
  // 13. Retry on 429 (rate limit) for GET
  // =========================================================================
  it('should retry on 429 for GET requests', async () => {
    const rateLimitBody = { error: { code: 'RATE_LIMITED', message: 'Too many requests' } };
    const successBody = { success: true, data: { status: 'ok', timestamp: 'now' } };

    mockFetch
      .mockResolvedValueOnce(mockResponse(429, rateLimitBody, false))
      .mockResolvedValueOnce(mockResponse(200, successBody));

    const resultPromise = checkHealth();
    await vi.advanceTimersByTimeAsync(1500);
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // =========================================================================
  // 14. fetchBatchProgress builds correct URL
  // =========================================================================
  it('should call correct endpoint for fetchBatchProgress', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(200, { success: true, data: { batchId: 'abc', status: 'RUNNING' } }),
    );

    await fetchBatchProgress('abc');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://test-api/attributes/extract/batch/abc/progress',
      expect.any(Object),
    );
  });
});
