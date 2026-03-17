/**
 * Attribute Manager Types
 * 
 * TypeScript interfaces for the API
 */

// ============================================================================
// PRODUCTS
// ============================================================================

export interface ProductsQuery {
  businessUnitId: number;
  mode?: 'existing' | 'new';
  step?: string;
  search?: string;
  productCategories?: string[];
  departments?: string[];
  categories?: string[];
  subCategories?: string[];
  brands?: string[];
  seasons?: string[];
  vendors?: string[];
  banners?: string[];
  dateRange?: string;
  missingDesc?: boolean;
  hasImages?: boolean;
  noAttributes?: boolean;
  completenessMax?: number;
  limit?: number;
  offset?: number;
}

export interface Product {
  styleId: string;
  colorId: string;
  imageId: number;
  thumbnailBase64: string | null;
  imageUrl: string | null; // Merch IMG_URL column (D87927)
  originalName: string;
  productCategory: string;
  // Hierarchy IDs for cascading filters
  deptId: string | null;
  classId: string | null;
  subclassId: string | null;
  brandId: string | null;
  // Hierarchy names for display
  department: string;
  category: string;     // Class name
  subCategory: string;  // Subclass name
  brand: string;
  banners?: Array<{ id: string; name: string }>;
  styleDesc: string;
  colorDesc: string;
  longStyleDesc: string;
  shortStyleDesc: string;
  vendorComposition?: string;
  vendorCare?: string;
  vendorOrigin?: string;
  styCharCount: number;
}

export interface FilterOptions {
  productCategories: string[];
  departments: string[];
  categories: string[];
  subCategories: string[];
  brands: string[];
}

/** Hierarchy tree for cascading filters */
export interface HierarchyTree {
  departments: DepartmentNode[];
  brands: Array<{ id: string; name: string }>;
  seasons: Array<{ id: string; name: string }>;
  vendors: Array<{ id: string; name: string }>;
  banners: Array<{ id: string; name: string }>;
}

export interface DepartmentNode {
  id: string;
  name: string;
  classes: ClassNode[];
}

export interface ClassNode {
  id: string;
  name: string;
  subclasses: SubclassNode[];
}

export interface SubclassNode {
  id: string;
  name: string;
}

/** Internal helper for building hierarchy */
export interface HierarchyNode {
  id: string;
  name: string;
  children: Map<string, HierarchyNode>;
}

// ============================================================================
// CHARACTERISTICS
// ============================================================================

export interface CharType {
  businessUnitId: number;
  typeId: string;
  description: string;
  subType: 'STYL' | 'VENDOR' | 'COLOR';
  valueCount: number;
  usageCount: number;
}

export interface CharValue {
  businessUnitId: number;
  typeId: string;
  valueId: string;
  description: string;
}

export interface CreateCharTypeInput {
  businessUnitId: number;
  typeId: string;
  description: string;
  subType: 'STYL' | 'VENDOR' | 'COLOR';
}

export interface CreateCharValueInput {
  businessUnitId: number;
  typeId: string;
  valueId: string;
  description: string;
  origin?: string;
}

// ============================================================================
// MAPPING
// ============================================================================

export interface MappingRule {
  mappingId: number;
  businessUnitId: number;
  llmInput: string;
  targetTypeId: string;
  targetValueId: string;
  targetValueDesc: string;
  confidenceThreshold: number;
  isActive: boolean;
  createdBy: string;
  createdDate: string;
}

export interface CreateMappingInput {
  businessUnitId: number;
  llmInput: string;
  targetTypeId: string;
  targetValueId: string;
  confidenceThreshold?: number;
}

export interface MappedAttribute {
  name: string;
  aiValue: string;
  suggestedValue?: string; // Display value for UI (AI's raw suggestion)
  llmValue?: string; // For backward compatibility / onboarding
  erpTypeId: string | null;
  erpValueId: string | null;
  erpValueDesc: string | null;
  confidence: number; // 0-100 percentage (from AI + mapping combined)
  mappingSource: 'rule' | 'fuzzy' | 'embedding' | 'none';
  isRequired: boolean;
  status: 'accepted' | 'pending' | 'rejected';
}

// ============================================================================
// TEMPLATES
// ============================================================================

export interface CharTemplate {
  templateId: number;
  businessUnitId: number;
  templateName: string;
  targetCategory: string;
  isActive: boolean;
  enforceOnSync: boolean;
  typeIds: string[];
  typeCount: number;
  createdBy: string;
  createdDate: string;
}

export interface CreateTemplateInput {
  businessUnitId: number;
  templateName: string;
  targetCategory: string;
  typeIds: string[];
  enforceOnSync?: boolean;
}

// ============================================================================
// SYNC
// ============================================================================

export interface SyncRequest {
  businessUnitId: number;
  styles: SyncStyle[];
}

export interface SyncStyle {
  styleId: string;
  colorId: string;
  longStyleDesc?: string;
  shortStyleDesc?: string;
  colorAiDesc?: string;
  characteristics: Array<{
    typeId: string;
    valueId: string;
  }>;
}

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  timestamp: string;
  errors?: Array<{
    styleId: string;
    error: string;
  }>;
}

export interface CompletenessResult {
  styleId: string;
  productTypeId: number;
  productTypeName: string;
  mandatoryChars: Array<{
    typeId: string;
    typeDesc: string;
    isPresent: boolean;
    currentValueId?: string;
    currentValueDesc?: string;
  }>;
  completenessPct: number;
  isSyncReady: boolean;
  missingCount: number;
}

// ============================================================================
// API RESPONSES
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: string;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  limit: number;
  offset: number;
  totalPages: number;
}

