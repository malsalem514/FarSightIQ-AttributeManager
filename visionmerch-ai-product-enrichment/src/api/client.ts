/**
 * API Client
 *
 * Fetch wrapper with timeout, retry, and structured error handling.
 */

import { API_BASE_URL } from './config';

const DEFAULT_TIMEOUT_MS = 30000; // 30s
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  total?: number;
}

/** Determine if an HTTP status is retryable */
function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Simple fetch wrapper with timeout, retry, and error handling */
async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  retries = MAX_RETRIES
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Retry on server errors / rate limits (only for GET/idempotent)
      if (isRetryable(response.status) && attempt < retries && options.method !== 'POST') {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || { code: 'HTTP_ERROR', message: `HTTP ${response.status}` }
        };
      }

      return data;
    } catch (error: any) {
      clearTimeout(timeoutId);

      const isTimeout = error.name === 'AbortError';
      const code = isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR';

      // Retry network errors on non-mutating requests
      if (attempt < retries && options.method !== 'POST') {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }

      return {
        success: false,
        error: { code, message: isTimeout ? `Request timed out after ${DEFAULT_TIMEOUT_MS}ms` : error.message }
      };
    }
  }

  // Should never reach here, but TypeScript needs it
  return { success: false, error: { code: 'NETWORK_ERROR', message: 'Max retries exceeded' } };
}

// =============================================================================
// HIERARCHY API
// =============================================================================

export async function fetchHierarchy(businessUnitId: number) {
  return request<{
    departments: any[];
    brands: any[];
    seasons: any[];
    vendors: any[];
    banners: any[];
  }>(`/products/hierarchy?business_unit_id=${businessUnitId}`);
}

// =============================================================================
// ATTRIBUTES API (AI Extraction)
// =============================================================================

export interface BatchExtractionResult {
  success: boolean;
  data: any[];
  batchId?: string;
  error?: string;
}

export async function extractAttributesBatch(
  businessUnitId: number,
  batch: Array<{ style_id: string; color_id: string; image_url: string; focused_attributes?: string[] }>
): Promise<BatchExtractionResult> {
  const response = await request<{ data: any[]; batchId?: string }>('/attributes/extract/batch', {
    method: 'POST',
    body: JSON.stringify({
      business_unit_id: businessUnitId,
      images: batch
    })
  });
  return {
    success: response.success,
    data: response.data?.data || [],
    batchId: response.data?.batchId,
    error: response.error?.message
  };
}

export interface BatchProgress {
  batchId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'ERROR' | 'CANCELLED';
  totalItems: number;
  processedItems: number;
  processedCount?: number;  // Alias for processedItems (backward compat)
  successCount: number;
  errorCount: number;
  progressPercent: number;
  currentStyleId?: string;
  startedAt?: string;
  completedAt?: string;
}

/**
 * Get batch progress (v8.3 - P1)
 */
export async function fetchBatchProgress(batchId: string) {
  return request<BatchProgress>(`/attributes/extract/batch/${batchId}/progress`);
}

/**
 * Get active batches (v8.3 - P1)
 */
export async function fetchActiveBatches(businessUnitId?: number) {
  const params = businessUnitId ? `?business_unit_id=${businessUnitId}` : '';
  return request<BatchProgress[]>(`/attributes/extract/batches/active${params}`);
}

export async function rewriteDescription(
  businessUnitId: number,
  styleId: string,
  attributes: Record<string, string>,
  tone: 'professional' | 'engaging' | 'seo' | 'concise',
  currentDescription?: string
) {
  return request<{ shortDescription: string; longDescription: string }>('/attributes/rewrite', {
    method: 'POST',
    body: JSON.stringify({
      business_unit_id: businessUnitId,
      style_id: styleId,
      attributes,
      tone,
      current_description: currentDescription
    })
  });
}

export async function updateProductAttribute(
  businessUnitId: number,
  styleId: string,
  typeId: string,
  value: string
) {
  return request<any>('/attributes/update', {
    method: 'POST',
    body: JSON.stringify({
      business_unit_id: businessUnitId,
      style_id: styleId,
      type_id: typeId,
      value
    })
  });
}

// =============================================================================
// SETTINGS API
// =============================================================================

export async function fetchAppSettings() {
  return request<{
    db: { user: string; connectString: string };
    remoteDb: { user: string; connectString: string };
    savedDatabases: Array<{ name: string; user: string; connectString: string; isRemote?: boolean }>;
    mode: 'READ_ONLY' | 'READ_WRITE_IRI';
    lastResync?: string;
  }>('/settings');
}

export async function saveDatabaseConfig(data: { name: string; user: string; connect_string: string; is_remote?: boolean }) {
  return request<any>('/settings/save-database', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function updateDatabaseConfig(data: { user: string; password?: string; connect_string: string }) {
  return request<any>('/settings/database', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function updateRemoteDatabaseConfig(data: { user: string; password?: string; connect_string: string }) {
  return request<any>('/settings/remote-database', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function updateAppMode(mode: 'READ_ONLY' | 'READ_WRITE_IRI') {
  return request<any>('/settings/mode', {
    method: 'POST',
    body: JSON.stringify({ mode })
  });
}

export async function triggerResync(businessUnitId: number = 1, forceFull: boolean = false) {
  return request<any>('/settings/resync', {
    method: 'POST',
    body: JSON.stringify({ business_unit_id: businessUnitId, force_full: forceFull })
  });
}

export async function fetchSyncProgress(businessUnitId?: number) {
  const params = new URLSearchParams();
  if (businessUnitId) params.set('business_unit_id', String(businessUnitId));
  return request<any[]>(`/sync/progress?${params}`);
}

export async function fetchLLMConfigs() {
  return request<any[]>('/settings/llm');
}

export async function updateLLMConfig(providerId: string, data: any) {
  return request<any>(`/settings/llm/${providerId}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

// Batch Processing Configuration (v8.4)
export interface BatchConfig {
  maxConcurrentRequests: number;
  batchChunkSize: number;
  requestTimeoutMs: number;
  retryAttempts: number;
}

export async function fetchBatchConfig() {
  return request<BatchConfig>('/settings/llm/batch-config');
}

export async function updateBatchConfig(config: Partial<BatchConfig>) {
  return request<any>('/settings/llm/batch-config', {
    method: 'PUT',
    body: JSON.stringify(config)
  });
}

export async function fetchEnvironments() {
  return request<Array<{ id: string; name: string; link: string; isActive: boolean; env_type: 'DEV' | 'QA' | 'PROD'; lastSwitched?: string; image_base_url?: string }>>('/settings/environments');
}

export async function switchEnvironment(envId: string) {
  return request<any>('/settings/switch-environment', {
    method: 'POST',
    body: JSON.stringify({ env_id: envId, username: 'ADMIN' })
  });
}

export async function updateImageServer(envId: string, imageUrl: string) {
  return request<any>('/settings/image-server', {
    method: 'POST',
    body: JSON.stringify({ env_id: envId, image_url: imageUrl })
  });
}

// =============================================================================
// DASHBOARD API
// =============================================================================

export async function fetchDashboardPulse(businessUnitId: number) {
  return request<any>(`/dashboard/pulse?business_unit_id=${businessUnitId}`);
}

// =============================================================================
// REVIEW GRID API (Bulk Comparison for Scale)
// =============================================================================

export async function fetchReviewGridProducts(
  businessUnitId: number,
  filters: {
    department_id?: string | string[];
    class_id?: string | string[];
    subclass_id?: string | string[];
    brand_id?: string | string[];
    season_id?: string | string[];
    vendor_id?: string | string[];
    section_id?: string | string[];
    banner_id?: string | string[];
    date_range?: string;
    status?: string;
    step?: string; // Backend uses 'step' for funnel filtering
    has_images?: boolean;
  },
  pagination: {
    page: number;
    pageSize: number;
  }
) {
  const params = new URLSearchParams();
  params.set('business_unit_id', String(businessUnitId));
  params.set('page', String(pagination.page));
  params.set('page_size', String(pagination.pageSize));
  
  const appendParam = (key: string, val: any) => {
    if (val === undefined || val === null || val === '') return;
    if (Array.isArray(val)) {
      val.forEach(v => {
        if (v) params.append(key, String(v));
      });
    } else {
      params.set(key, String(val));
    }
  };

  appendParam('department_id', filters.department_id);
  appendParam('class_id', filters.class_id);
  appendParam('subclass_id', filters.subclass_id);
  appendParam('brand_id', filters.brand_id);
  appendParam('status', filters.status);
  appendParam('step', filters.step); // Backend filter by step
  if (filters.has_images !== undefined) params.set('has_images', String(filters.has_images));
  appendParam('season_id', filters.season_id);
  appendParam('vendor_id', filters.vendor_id);
  appendParam('section_id', filters.section_id);
  appendParam('banner_id', filters.banner_id);
  if (filters.date_range) params.set('date_range', filters.date_range);
  
  return request<{
    products: any[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    funnel: any;
  }>(`/attributes/review/grid?${params}`);
}

/** Fetch full attributes for a batch of styles (for lazy loading) */
export async function fetchBulkAttributeComparison(businessUnitId: number, styleIds: string[], colorId = '000') {
  return request<any[]>('/attributes/compare/bulk', {
    method: 'POST',
    body: JSON.stringify({
      business_unit_id: businessUnitId,
      style_ids: styleIds,
      color_id: colorId
    })
  });
}

export async function validateBeforeSync(businessUnitId: number, styleId: string) {
  return request<{ isValid: boolean; missingAttributes: Array<{ typeId: string; name: string; level: string }> }>(
    `/attributes/review/validate/${styleId}?business_unit_id=${businessUnitId}`
  );
}

export async function acceptReview(businessUnitId: number, styleId: string, colorId = '000', skipValidation = false) {
  return request<any>('/attributes/review/accept', {
    method: 'POST',
    body: JSON.stringify({
      business_unit_id: businessUnitId,
      style_id: styleId,
      color_id: colorId,
      skip_validation: skipValidation
    })
  });
}

export async function rejectReview(businessUnitId: number, styleId: string, colorId = '000') {
  return request<any>('/attributes/review/reject', {
    method: 'POST',
    body: JSON.stringify({
      business_unit_id: businessUnitId,
      style_id: styleId,
      color_id: colorId
    })
  });
}

export async function acceptBulkReview(businessUnitId: number, styleIds: string[]) {
  return request<any>('/attributes/review/accept-bulk', {
    method: 'POST',
    body: JSON.stringify({
      business_unit_id: businessUnitId,
      style_ids: styleIds
    })
  });
}

/** P1: Reject AI suggestions for multiple styles, revert to ERP values */
export async function rejectBulkReview(businessUnitId: number, styleIds: string[]) {
  return request<any>('/attributes/review/reject-bulk', {
    method: 'POST',
    body: JSON.stringify({
      business_unit_id: businessUnitId,
      style_ids: styleIds
    })
  });
}

/** Fetch all possible values for a characteristic type */
export async function fetchAttributeValues(businessUnitId: number, typeId: string) {
  return request<any[]>(`/attributes/values/${typeId}?business_unit_id=${businessUnitId}`);
}

// =============================================================================
// BUSINESS UNITS API
// =============================================================================

export async function fetchBusinessUnits() {
  return request<Array<{ id: number; name: string; productCount: number }>>('/business-units');
}

// =============================================================================
// TAXONOMY API
// =============================================================================

export async function searchTaxonomyCategories(query: string, versionTag: string = 'v1') {
  return request<any[]>(`/taxonomy/categories/search?q=${query}&version_tag=${versionTag}`, {
    headers: { 'X-TENANT-ID': 'JDS_MPRD' }
  });
}

export async function upsertTenantMapping(
  businessUnitId: number,
  deptId: string,
  classId: string,
  subclassId: string | null,
  versionTag: string,
  extCategoryId: string
) {
  return request<any>('/taxonomy/mappings', {
    method: 'POST',
    headers: { 'X-TENANT-ID': 'JDS_MPRD' },
    body: JSON.stringify({
      business_unit_id: businessUnitId,
      dept_id: deptId,
      class_id: classId,
      subclass_id: subclassId,
      version_tag: versionTag,
      ext_category_id: extCategoryId,
      confidence: 100,
      source: 'manual'
    })
  });
}

export async function seedTemplatesFromMapping(
  businessUnitId: number,
  deptId: string,
  classId: string,
  subclassId: string | null,
  seedMode: 'advisory' | 'enforced'
) {
  return request<any>('/taxonomy/seed-templates', {
    method: 'POST',
    headers: { 'X-TENANT-ID': 'JDS_MPRD' },
    body: JSON.stringify({
      business_unit_id: businessUnitId,
      dept_id: deptId,
      class_id: classId,
      subclass_id: subclassId,
      seed_mode: seedMode
    })
  });
}

// =============================================================================
// HIERARCHY RULES API (Governance)
// =============================================================================

export async function fetchHierarchyRules(
  businessUnitId: number,
  levelType: 'DEPT' | 'CLASS' | 'SUBCLASS',
  levelId: string,
  includeChildren: boolean = false
) {
  const params = new URLSearchParams({
    business_unit_id: String(businessUnitId),
    level_type: levelType,
    level_id: levelId,
    include_children: String(includeChildren)
  });
  return request<any[]>(`/attributes/config/hierarchy?${params}`);
}

export async function saveHierarchyRule(rule: {
  businessUnitId: number;
  levelType: 'DEPT' | 'CLASS' | 'SUBCLASS' | 'STYLE';
  levelId: string;
  characteristicTypeId: string;
  isMandatory: boolean;
  applicability: 'REQUIRED' | 'OPTIONAL' | 'NA';
  defaultValueId?: string;
}) {
  return request<any>('/attributes/config/hierarchy', {
    method: 'POST',
    body: JSON.stringify(rule)
  });
}

export async function deleteHierarchyRule(ruleId: number) {
  return request<any>(`/attributes/config/hierarchy/${ruleId}`, {
    method: 'DELETE'
  });
}

export async function fetchRuleImpactPreview(
  businessUnitId: number,
  levelType: 'DEPT' | 'CLASS' | 'SUBCLASS',
  levelId: string
) {
  const params = new URLSearchParams({
    business_unit_id: String(businessUnitId),
    level_type: levelType,
    level_id: levelId
  });
  return request<{ totalProducts: number; compliantProducts: number; nonCompliantProducts: number }>(
    `/attributes/config/hierarchy/preview?${params}`
  );
}

// =============================================================================
// ATTRIBUTE GROUPS API
// =============================================================================

export async function fetchApplicableGroups(
  deptId: string,
  classId: string,
  subclassId: string
) {
  const params = new URLSearchParams({
    dept_id: deptId,
    class_id: classId,
    subclass_id: subclassId
  });
  return request<any[]>(`/attributes/groups/applicable?${params}`);
}

// =============================================================================
// USER SESSION (Persistence)
// =============================================================================

export interface UserSessionState {
  session_id: string;
  selected_items: string[];
  processed_items: Array<{
    styleId: string;
    processedAt: string;
  }>;
  filters_state?: any;
  last_active: string;
}

export async function saveUserSession(
  userId: string,
  businessUnitId: number,
  sessionType: string,
  selectedItems: string[],
  processedItems: Array<{ styleId: string; processedAt: Date }>,
  filtersState?: any
) {
  return request<{ session_id: string }>('/session/save', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      business_unit_id: businessUnitId,
      session_type: sessionType,
      selected_items: selectedItems,
      processed_items: processedItems,
      filters_state: filtersState
    })
  });
}

export async function loadUserSession(
  userId: string,
  businessUnitId: number,
  sessionType: string
) {
  const params = new URLSearchParams({
    user_id: userId,
    business_unit_id: businessUnitId.toString(),
    session_type: sessionType
  });
  return request<UserSessionState | null>(`/session/load?${params}`);
}

export async function clearUserSession(sessionId: string) {
  return request(`/session/${sessionId}`, {
    method: 'DELETE'
  });
}

// =============================================================================
// HEALTH
// =============================================================================

export async function checkHealth() {
  return request<{ status: string; timestamp: string }>('/health');
}
