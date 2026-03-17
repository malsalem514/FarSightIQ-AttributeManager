/**
 * Attribute Groups Hook
 * 
 * Fetches grouped attributes for product hierarchy
 * Pattern: Vanilla React hooks, no clever abstractions
 */

import { useState, useCallback } from 'react';
import * as api from '../src/api/client';
import { GroupedAttribute } from '../types';

export function useAttributeGroups(businessUnitId: number) {
  const [groups, setGroups] = useState<GroupedAttribute[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch applicable groups for a product hierarchy
   */
  const fetchApplicableGroups = useCallback(async (
    deptId: string,
    classId: string,
    subclassId: string
  ) => {
    if (!deptId || !classId || !subclassId) {
      setGroups([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await api.fetchApplicableGroups(deptId, classId, subclassId);
      
      if (result.success && result.data) {
        // Transform backend data to frontend format
        const mapped: GroupedAttribute[] = result.data.map((g: any) => ({
          group_id: g.group_id || g.groupId,
          group_name: g.display_name || g.description,
          sort_order: g.sort_order || 0,
          is_expanded: g.is_expanded_default === 'Y',
          attributes: g.characteristic_types?.map((t: any) => ({
            name: t.description,
            type_id: t.characteristic_type_id,
            value_id: null,
            description: t.description,
            current_value: null,
            ai_value: null,
            confidence: 0,
            mandatory: t.mandatory || 'N',
            status: 'pending' as const
          })) || [],
          completeness: {
            filled: 0,
            total: g.characteristic_types?.length || 0,
            mandatory_filled: 0,
            mandatory_total: g.characteristic_types?.filter((t: any) => t.mandatory === 'Y').length || 0
          }
        }));

        setGroups(mapped);
      } else {
        setError(result.error?.message || 'Failed to fetch groups');
        setGroups([]);
      }
    } catch (err: any) {
      setError(err.message);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Clear groups
   */
  const clearGroups = useCallback(() => {
    setGroups([]);
    setError(null);
  }, []);

  return {
    groups,
    loading,
    error,
    fetchApplicableGroups,
    clearGroups,
    setGroups
  };
}

