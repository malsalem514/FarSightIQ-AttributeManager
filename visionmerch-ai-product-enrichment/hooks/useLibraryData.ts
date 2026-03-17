/**
 * Library Data Hook
 * 
 * API fetch & mutation logic for Library tab (~90 LOC)
 */

import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL, BUSINESS_UNIT_ID } from '../src/api/config';
import { CharacteristicType, CharacteristicValue, CategoryTemplate } from '../types';
import { MappingRule, ApiCharType, ApiCharValue, ApiMapping, ApiTemplate } from '../types/library';

export function useLibraryData() {
  const [charTypes, setCharTypes] = useState<CharacteristicType[]>([]);
  const [charValues, setCharValues] = useState<Record<string, CharacteristicValue[]>>({});
  const [mappingRules, setMappingRules] = useState<MappingRule[]>([]);
  const [templates, setTemplates] = useState<CategoryTemplate[]>([]);
  
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [loadingValues, setLoadingValues] = useState(false);
  const [loadingMappings, setLoadingMappings] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCharTypes = useCallback(async () => {
    setLoadingTypes(true);
    try {
      const res = await fetch(`${API_BASE_URL}/library/types?business_unit_id=${BUSINESS_UNIT_ID}&sub_type=STYL`);
      const json = await res.json();
      if (json.success && json.data) {
        setCharTypes(json.data.map((t: ApiCharType) => ({
          characteristic_type_id: t.typeId, description: t.description, sub_type: t.subType, value_count: t.valueCount
        })));
      }
    } catch (err: any) { setError(`Failed to load types: ${err.message}`); }
    finally { setLoadingTypes(false); }
  }, []);

  const fetchCharValues = useCallback(async (typeId: string) => {
    if (!typeId || charValues[typeId]) return;
    setLoadingValues(true);
    try {
      const res = await fetch(`${API_BASE_URL}/library/values?business_unit_id=${BUSINESS_UNIT_ID}&type_id=${typeId}`);
      const json = await res.json();
      if (json.success && json.data) {
        const mapped = json.data.map((v: ApiCharValue) => ({
          characteristic_type_id: v.typeId, characteristic_value_id: v.valueId, description: v.description
        }));
        setCharValues(prev => ({ ...prev, [typeId]: mapped }));
      }
    } catch (err: any) { console.error('Failed to load values:', err); }
    finally { setLoadingValues(false); }
  }, [charValues]);

  const fetchMappings = useCallback(async () => {
    setLoadingMappings(true);
    try {
      const res = await fetch(`${API_BASE_URL}/library/mappings?business_unit_id=${BUSINESS_UNIT_ID}`);
      const json = await res.json();
      if (json.success && json.data) {
        setMappingRules(json.data.map((m: ApiMapping) => ({
          id: String(m.mappingId), llmInput: m.llmInput, targetTypeId: m.targetTypeId, 
          targetValueId: m.targetValueId, targetValueDesc: m.targetValueDesc || m.targetValueId
        })));
      }
    } catch (err: any) { console.error('Failed to load mappings:', err); }
    finally { setLoadingMappings(false); }
  }, []);

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch(`${API_BASE_URL}/library/templates?business_unit_id=${BUSINESS_UNIT_ID}`);
      const json = await res.json();
      if (json.success && json.data) {
        setTemplates(json.data.map((t: ApiTemplate) => ({
          id: String(t.templateId), name: t.templateName, target_category: t.targetCategory, characteristic_type_ids: []
        })));
      }
    } catch (err: any) { console.error('Failed to load templates:', err); }
    finally { setLoadingTemplates(false); }
  }, []);

  useEffect(() => { fetchCharTypes(); fetchMappings(); fetchTemplates(); }, []);

  return {
    charTypes, charValues, mappingRules, templates, setCharValues, setMappingRules, setTemplates,
    loadingTypes, loadingValues, loadingMappings, loadingTemplates, error, setError,
    fetchCharTypes, fetchCharValues, fetchMappings, fetchTemplates
  };
}

