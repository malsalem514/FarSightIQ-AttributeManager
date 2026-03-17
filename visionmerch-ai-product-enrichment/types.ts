/**
 * Shared Type Definitions for AttrManager Frontend
 */

export type TabType = 'dashboard' | 'review_grid' | 'admin' | 'taxonomy' | 'config' | 'settings';

// Hierarchy types for cascading filters
export interface HierarchyTree {
  departments: DepartmentNode[];
  brands: Array<{ id: string; name: string }>;
  seasons?: Array<{ id: string; name: string }>; 
  vendors?: Array<{ id: string; name: string }>;
  banners?: Array<{ id: string; name: string }>;
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

// =============================================================================
// ATTRIBUTE GROUPING
// =============================================================================

export interface AttributeGroup {
  business_unit_id: number;
  group_id: string;
  group_code: string | null;
  parent_group_id: string | null;
  description: string;
  display_name: string | null;
  group_type: 'STANDARD' | 'TECHNICAL' | 'MARKETING';
  sort_order: number;
  hierarchy_level: number;
  is_collapsible: 'Y' | 'N';
  is_expanded_default: 'Y' | 'N';
  active: 'Y' | 'N';
}

// =============================================================================
// MEDIA & IMAGES
// =============================================================================

export interface MediaItem {
  url: string;
  type: string;    // Qualifier: PRIMARY, DEFAULT, etc.
  view: string;    // View ID: 1 (Front), 2 (Back), etc.
  source?: 'ACTUAL' | 'HIERARCHY';
}

// =============================================================================
// REVIEW GRID (Three-Way Comparison)
// =============================================================================

/**
 * Three-way comparison for one attribute
 * Shows DB | Vendor | AI values side-by-side
 */
export interface AttributeComparison {
  name: string;                    // Display name: "Material"
  type_id: string;                 // DB ID: "MATERIAL"
  
  // Three sources
  db_value: string | null;         // Current value in database
  vendor_value: string | null;     // From vendor file
  ai_value: string | null;         // AI suggestion from extraction
  
  // Metadata
  confidence: number;              // AI confidence score (0-100)
  mandatory: 'Y' | 'N';           // Is this attribute required?
  applicability?: 'REQUIRED' | 'OPTIONAL' | 'NA';
  group_id: string;                
  group_name: string;              
  
  // User decision
  selected_value: string | null;   
  selected_source: 'db' | 'vendor' | 'ai' | 'custom' | null;
  status: 'pending' | 'accepted' | 'rejected' | 'synced' | 'review' | 'approved' | 'ready_to_sync';
  is_focused?: boolean;            // V012: AI Focus Targeting
}

/**
 * Grid row representing one product with summary data for the list view
 * v8.4: Added AI enrichment status fields
 */
export interface ReviewGridRow {
  business_unit_id: number;
  style_id: string;
  color_id: string;
  image_url: string | null;
  media?: MediaItem[];
  style_name: string;
  dept_name: string;
  class_name: string;
  subclass_name: string;
  brand_name: string;
  overall_confidence: number;
  status: 'pending' | 'accepted' | 'rejected' | 'review' | 'ready_to_sync' | 'synced' | 'success' | 'approved' | 'ready';
  grouped_attributes?: GroupedAttributeComparison[];
  existing_preview?: Array<{ name: string; value: string }>;
  short_description?: string;
  long_description?: string;
  existing_short_description?: string;
  existing_long_description?: string;
  ai_description?: string;
  
  // v8.4: AI Enrichment Tracking
  completion_pct?: number;           // 0-100 attribute fill percentage
  enrichment_pct?: number;           // Alias for completion_pct (for backward compat)
  ai_processed_at?: string;          // When AI enrichment completed
  ai_attributes_count?: number;      // Number of AI-suggested attributes
  attribute_completeness?: {         // Summary for progress bar
    filled: number;
    total: number;
  };
  banners?: Array<{ id: string; name: string }>;  // Assigned banners
  vendor_id?: string;
  size_group_id?: string;
}

/**
 * Grouped attributes for display in expanded row
 */
export interface GroupedAttributeComparison {
  group_id: string;
  group_name: string;
  is_expanded?: boolean;
  attributes: AttributeComparison[];
  completeness: {
    filled: number;
    total: number;
  };
}

// =============================================================================
// LIBRARY TYPES (for backward compatibility)
// =============================================================================

export interface CharacteristicType {
  id?: string;
  characteristic_type_id?: string;  // Alternative ID field from mock data
  name?: string;
  description?: string;
  data_type?: string;
  sub_type?: string;
  is_active?: boolean;
  business_unit_id?: number;
}

export interface CharacteristicValue {
  id?: string;
  characteristic_value_id?: string;  // Alternative ID field from mock data
  type_id?: string;
  characteristic_type_id?: string;   // Alternative type ID from mock data
  value?: string;
  description?: string;
  display_value?: string;
  sort_order?: number;
  business_unit_id?: number;
}

export interface CategoryTemplate {
  id: string;
  name: string;
  description?: string;
  attributes?: string[];
  characteristic_type_ids?: string[];  // Alternative from mock data
  target_category?: string;
}

export interface GroupedAttribute {
  group_id: string;
  group_name: string;
  attributes: AttributeComparison[];
}

export interface Product {
  business_unit_id: number;
  style_id: string;
  style_name?: string;
  style_desc?: string;
  color_id?: string;
  color_desc?: string;
  dept_name?: string;
  department?: string;
  dept_id?: string;
  class_name?: string;
  category?: string;
  class_id?: string;
  subclass_name?: string;
  sub_category?: string;
  sub_class_id?: string;
  brand_name?: string;
  brand?: string;
  brand_id?: string;
  image_url?: string;
  image_id?: string | number;
  thumbnail_base64?: string;
  original_name?: string;
  group_id?: string;
  product_category?: string;
  long_style_desc?: string;
  short_style_desc?: string;
  color_ai_desc?: string;
  additional_attributes?: string;
  vendor_composition?: string;
  vendor_care?: string;
  vendor_origin?: string;
  last_sync_timestamp?: string;
  status?: string;
  // Dynamic sty_char fields
  [key: `sty_char${number}`]: string | undefined;
}

// =============================================================================
// BATCH PROGRESS & EXTRACTION
// =============================================================================

export interface BatchProgress {
  batch_id: string;
  total: number;
  processed: number;
  processedCount?: number;  // Alias for backward compat
  failed: number;
  status: string;
  started_at?: string;
  completed_at?: string;
}

export interface BatchExtractionResult {
  success: boolean;
  batch_id?: string;
  results?: any[];
  error?: string;
}
