/**
 * Simple API Hooks
 * 
 * Vanilla React hooks for data fetching - no clever abstractions
 */

import { useState, useEffect, useCallback } from 'react';

interface UseQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Simple data fetching hook
 * 
 * Usage:
 *   const { data, loading, error, refetch } = useQuery(() => fetchProducts());
 */
export function useQuery<T>(
  fetcher: () => Promise<{ success: boolean; data?: T; error?: { message: string } }>,
  deps: any[] = []
): UseQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await fetcher();
      if (result.success && result.data) {
        setData(result.data);
      } else {
        setError(result.error?.message || 'Failed to fetch');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

interface UseMutationResult<T, P> {
  mutate: (params: P) => Promise<boolean>;
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Simple mutation hook
 * 
 * Usage:
 *   const { mutate, loading, error } = useMutation((data) => createType(data));
 *   await mutate({ typeId: 'NEW01', description: 'New Type' });
 */
export function useMutation<T, P>(
  mutator: (params: P) => Promise<{ success: boolean; data?: T; error?: { message: string } }>
): UseMutationResult<T, P> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = async (params: P): Promise<boolean> => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await mutator(params);
      if (result.success && result.data) {
        setData(result.data);
        return true;
      } else {
        setError(result.error?.message || 'Mutation failed');
        return false;
      }
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { mutate, data, loading, error };
}

