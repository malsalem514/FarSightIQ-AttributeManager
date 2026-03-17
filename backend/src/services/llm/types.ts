/**
 * LLM Provider Types
 * 
 * Common interface for LLM providers (OpenAI, Gemini)
 * Allows swapping providers without changing business logic
 */

/**
 * LLM Provider interface
 * 
 * All providers must implement this interface
 */
export interface LLMProvider {
  /** Provider name (for logging) */
  readonly name: string;
  
  /**
   * Extract attributes from single product image
   * 
   * @param input - Image + context
   * @returns Structured attribute extraction result
   * @throws Error if extraction fails
   */
  extractAttributes(input: ExtractAttributesInput): Promise<AttributeExtractionResult>;
  
  /**
   * Health check (verify API connectivity)
   * 
   * @returns true if provider is healthy, false otherwise
   */
  healthCheck(): Promise<boolean>;

  /**
   * Rewrite product description (Optional implementation)
   */
  rewriteDescription?(input: RewriteDescriptionInput): Promise<RewriteDescriptionResult>;

  /**
   * Execute a generic prompt (for mapping, etc.)
   */
  executePrompt(prompt: string, options?: { json?: boolean }): Promise<string | any>;
}

/**
 * Input for description rewrite
 */
export interface RewriteDescriptionInput {
  styleId: string;
  currentDescription?: string;
  attributes: Record<string, string>;
  tone: 'professional' | 'engaging' | 'seo' | 'concise';
  maxLength?: number;
}

/**
 * Result from description rewrite
 */
export interface RewriteDescriptionResult {
  shortDescription: string;
  longDescription: string;
}

/**
 * Input for attribute extraction
 */
export interface ExtractAttributesInput {
  /** Base64-encoded image data */
  imageBase64: string;
  
  /** Style ID (for tracking) */
  styleId: string;
  
  /** Color ID (for tracking) */
  colorId: string;
  
  /** Business unit ID (for hierarchy cache lookup) */
  businessUnitId?: number;
  
  /** Optional context hints from ERP */
  context?: {
    productCategory?: string;
    department?: string;
    category?: string;
    subCategory?: string;
    brand?: string;
  };

  /** Specific attributes AI should focus on (V012) */
  focusedAttributes?: string[];
}

/**
 * Result from attribute extraction
 * 
 * Standardized format across all providers
 */
export interface AttributeExtractionResult {
  /** Style ID (echoed from input) */
  styleId: string;
  
  /** Color ID (echoed from input) */
  colorId: string;
  
  // ── Quality Check ──────────────────────────────────────
  
  /** Whether image passed quality check */
  qcPassed: boolean;
  
  /** Reason for QC failure (if applicable) */
  qcReason?: string;
  
  // ── Product Hierarchy (Database-Selected) ─────────────
  
  /** Product category description */
  productCategory: string;
  
  /** Product category ID (for database FK) */
  productCategoryId: string;
  
  /** Department description */
  department: string;
  
  /** Department ID (for database FK) */
  departmentId: string;
  
  /** Category/class description */
  category: string;
  
  /** Category/class ID (for database FK) */
  categoryId: string;
  
  /** Sub-category/subclass description */
  subCategory: string;
  
  /** Sub-category/subclass ID (for database FK) */
  subCategoryId: string;
  
  /** Brand name or "unknown" */
  brand: string;
  
  // ── Product Hierarchy (AI-Generated) ──────────────────
  
  /** AI-generated product category (free-form, max 20 chars) */
  aiProductCategory?: string;
  
  /** AI-generated department (free-form, max 40 chars) */
  aiDepartment?: string;
  
  /** AI-generated category (free-form, max 40 chars) */
  aiCategory?: string;
  
  /** AI-generated sub-category (free-form, max 40 chars) */
  aiSubCategory?: string;
  
  /** AI-generated brand description (free-form, max 30 chars) */
  aiBrandDesc?: string;
  
  // ── Hierarchy Confidence ───────────────────────────────
  
  /** Confidence scores for each hierarchy level */
  hierarchyConfidence?: {
    productCategory?: string;
    department?: string;
    category?: string;
    subCategory?: string;
  };
  
  // ── Descriptions ───────────────────────────────────────
  
  /** Detailed 2-3 sentence description (≤500 chars) */
  longStyleDesc: string;
  
  /** Concise 1-sentence summary (≤200 chars) */
  shortStyleDesc: string;
  
  /** AI-generated color description */
  colorAiDesc: string;
  
  // ── Style Characteristics ──────────────────────────────
  
  /** Dynamic key-value pairs (primary_color, material, etc.) */
  additionalAttributes: Record<string, string>;
  
  // ── Metadata ───────────────────────────────────────────
  
  /** Extraction confidence (High, Medium, Low) */
  confidence: string;
  
  /** Processing time in milliseconds */
  processingTimeMs: number;
  
  /** Raw JSON response (for audit log) */
  rawResponse: string;
  
  /** Provider-specific metadata (optional) */
  llmMetadata?: {
    model: string;
    tokensInput?: number;
    tokensOutput?: number;
    estimatedCostUsd?: number;
  };
  
  // v8.3: Audit Trail Fields
  /** Full prompt text sent to LLM (for audit) */
  promptText?: string;
  
  /** Enriched context JSON used for prompt building */
  enrichedContext?: {
    erpAttributes?: number;
    mandatoryRules?: number;
  };
}

