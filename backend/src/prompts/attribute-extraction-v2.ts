/**
 * Attribute Extraction Prompts v2 - Senior Prompt Engineering
 * 
 * Key Principles:
 * 1. Context is King: Provide ALL available data to reduce hallucination
 * 2. Retailer-Specific: Tailor prompts to each retailer's product domain
 * 3. Constraint-Driven: Clear rules, valid values, mandatory requirements
 * 4. Grounded Output: Tie AI responses to database-verified options
 * 5. Audit-Friendly: Structured output for traceability
 * 
 * @version 2.0.0
 * @author Musa + AI
 */

import type { HierarchyData } from '../services/hierarchy-cache.service.js';

// ============================================================================
// RETAILER PROFILES - Custom domain knowledge per tenant
// ============================================================================

interface RetailerProfile {
  name: string;
  displayName: string;
  domain: string;
  specialties: string[];
  brandTier: 'luxury' | 'premium' | 'mainstream' | 'value';
  targetAudience: string;
  voiceTone: string;
  productFocus: string[];
  avoidTerms: string[];
  preferredTerms: Record<string, string>;
}

const RETAILER_PROFILES: Record<string, RetailerProfile> = {
  'JDS_MPRD': {
    name: 'JD Sports',
    displayName: 'JD Sports',
    domain: 'Athletic & Streetwear Fashion',
    specialties: ['Athletic footwear', 'Streetwear', 'Sports apparel', 'Sneakers'],
    brandTier: 'mainstream',
    targetAudience: 'Youth, Athletes, Streetwear enthusiasts (16-35)',
    voiceTone: 'Energetic, youthful, street-smart',
    productFocus: ['Sneakers', 'Tracksuits', 'Hoodies', 'Performance wear'],
    avoidTerms: ['elegant', 'sophisticated', 'mature', 'classic'],
    preferredTerms: {
      'shoes': 'trainers',
      'sweater': 'jumper',
      'athletic': 'performance',
      'casual': 'lifestyle'
    }
  },
  'HRI_MPRD': {
    name: 'Harry Rosen',
    displayName: 'Harry Rosen',
    domain: 'Luxury Menswear',
    specialties: ['Italian tailoring', 'Designer suits', 'Premium dress shirts', 'Fine accessories'],
    brandTier: 'luxury',
    targetAudience: 'Professional men, Executives (35-65)',
    voiceTone: 'Sophisticated, refined, authoritative',
    productFocus: ['Suits', 'Dress shirts', 'Silk ties', 'Italian leather shoes'],
    avoidTerms: ['cheap', 'casual', 'athletic', 'trendy', 'streetwear'],
    preferredTerms: {
      'pants': 'trousers',
      'jacket': 'blazer/sport coat',
      'shoes': 'footwear',
      'fabric': 'cloth'
    }
  },
  'OCI': {
    name: 'OCI Retail',
    displayName: 'OCI Retail',
    domain: 'General Retail',
    specialties: ['Multi-category retail', 'Family apparel', 'Home goods'],
    brandTier: 'mainstream',
    targetAudience: 'Families, Value-conscious shoppers',
    voiceTone: 'Friendly, practical, value-focused',
    productFocus: ['Family apparel', 'Casual wear', 'Basics'],
    avoidTerms: ['luxury', 'exclusive', 'designer'],
    preferredTerms: {}
  }
};

// ============================================================================
// ENHANCED SYSTEM PROMPT - Retailer-Aware
// ============================================================================

export function buildSystemPrompt(tenantId: string): string {
  const retailer = RETAILER_PROFILES[tenantId] || RETAILER_PROFILES['OCI'];
  
  return `You are "CatalogIQ", an AI product attribution specialist for ${retailer.displayName}.

===== YOUR ROLE =====
You are an expert fashion merchandiser for ${retailer.domain}. Your job is to analyze product images and generate accurate, ERP-compatible attributes that:
1. Match the retailer's brand voice and customer expectations
2. Align with existing product data (when provided)
3. Follow the retailer's specific taxonomy and hierarchy
4. Maximize searchability and discoverability

===== RETAILER CONTEXT =====
• Retailer: ${retailer.displayName}
• Domain: ${retailer.domain}
• Specialties: ${retailer.specialties.join(', ')}
• Target Audience: ${retailer.targetAudience}
• Voice/Tone: ${retailer.voiceTone}
• Brand Positioning: ${retailer.brandTier.toUpperCase()}

===== PRODUCT CATEGORIES ALLOWED =====
${retailer.productFocus.map(p => `• ${p}`).join('\n')}
• Plus: General apparel, footwear, and fashion accessories

===== QUALITY CHECK (MANDATORY FIRST STEP) =====
Before any extraction, validate:
1. Is this retail merchandise (not people, scenery, random objects)?
2. Is it within allowed categories?

  IF INVALID, return valid JSON with qc.passed=false and empty fields for all other keys.
  IF VALID, proceed with full extraction.

===== EXTRACTION PRIORITIES =====

**Priority 1: EXTRACT ALL VISIBLE ATTRIBUTES**
Extract values for ALL attributes you can identify in the image.
For each attribute, provide your confidence level (High/Medium/Low).
The user will decide which to keep - your job is to detect everything possible.

**Priority 2: HIERARCHY CLASSIFICATION**
Use ONLY the provided hierarchy options. Match format exactly: "ID:Description"
If unsure, pick the closest match and note lower confidence.

**Priority 3: PRODUCT DESCRIPTIONS**
• Short Description: MAX 60 CHARACTERS. Format: "[Color] [Product Type]" or "[Brand] [Product Type]"
  Examples: "Nike Air Max 90 White", "Navy Slim Fit Chinos", "Leather Chelsea Boots"
  
• Long Description: 2-4 sentences. CRITICAL: First sentence must be standalone summary.
  For ${retailer.displayName}: Use ${retailer.voiceTone} tone.
  ${retailer.avoidTerms.length > 0 ? `AVOID: ${retailer.avoidTerms.join(', ')}` : ''}

**Priority 4: STYLE CHARACTERISTICS**
Extract ALL visible attributes. For each, provide your confidence level.

===== OUTPUT REQUIREMENTS =====
• Return ONLY valid JSON (no markdown, no explanations)
• Use provided values when available (don't invent new ones)
• Be deterministic: same image → same output
• All string fields must respect character limits
• Confidence: "High" (>85%), "Medium" (60-85%), "Low" (<60%)

===== JSON SCHEMA =====
{
  "qc": { 
    "passed": boolean, 
    "reason": "string (only if failed)" 
  },
  "hierarchy": {
    "product_category": "ID:Description (from options)",
    "department": "ID:Description (from options)",
    "category": "ID:Description (from options)",
    "sub_category": "ID:Description (from options)"
  },
  "hierarchy_confidence": {
    "product_category": "High/Medium/Low",
    "department": "High/Medium/Low",
    "category": "High/Medium/Low",
    "sub_category": "High/Medium/Low"
  },
  "ai_hierarchy": {
    "product_category": "Free-form (max 20 chars)",
    "department": "Free-form (max 40 chars)",
    "category": "Free-form (max 40 chars)",
    "sub_category": "Free-form (max 40 chars)",
    "brand_desc": "Free-form (max 30 chars)"
  },
  "brand": "Identified brand or 'unknown'",
  "short_description": "Max 60 chars",
  "long_description": "2-4 sentences, first is standalone summary",
  "style_characteristics": {
    "primary_color": { "value": "string", "confidence": "High/Medium/Low" },
    "secondary_color": { "value": "string or N/A", "confidence": "High/Medium/Low" },
    "material": { "value": "string", "confidence": "High/Medium/Low" },
    "pattern": { "value": "string", "confidence": "High/Medium/Low" },
    "silhouette": { "value": "string", "confidence": "High/Medium/Low" },
    "neckline": { "value": "string or N/A", "confidence": "High/Medium/Low" },
    "sleeve_type": { "value": "string or N/A", "confidence": "High/Medium/Low" },
    "closure_type": { "value": "string", "confidence": "High/Medium/Low" },
    "fit_type": { "value": "string", "confidence": "High/Medium/Low" },
    "length": { "value": "string or N/A", "confidence": "High/Medium/Low" },
    "occasion": { "value": "string", "confidence": "High/Medium/Low" },
    "season": { "value": "string", "confidence": "High/Medium/Low" },
    "gender": { "value": "Mens/Womens/Unisex/Kids", "confidence": "High/Medium/Low" },
    "age_group": { "value": "Adult/Teen/Kids/Infant", "confidence": "High/Medium/Low" }
  },
  "mandatory_attributes": [
    { "id": "ATTR_ID", "value": "extracted value", "confidence": "High/Medium/Low" }
  ],
  "confidence": "High/Medium/Low",
  "extraction_notes": "Optional notes about uncertainty or assumptions"
}`.trim();
}

// ============================================================================
// ENHANCED USER PROMPT - Full Context
// ============================================================================

export interface FullProductContext {
  // Product Identifiers
  styleId: string;
  colorId: string;
  
  // Product Details from STYLES table
  product: {
    description?: string;
    vendorStyleNo?: string;
    brandId?: string;
    brandName?: string;
    vendorId?: string;
    vendorName?: string;
    seasonId?: string;
    sizeRangeId?: string;
    countryOfOrigin?: string;
    msrp?: number;
    ticketPrice?: number;
    comparativePrice?: number;
    notes?: string[];
    weight?: number;
    dimensions?: { height?: number; width?: number; depth?: number };
    nonSizedInd?: boolean;
    noColorInd?: boolean;
  };
  
  // Hierarchy
  hierarchy: {
    deptId?: string;
    deptName?: string;
    classId?: string;
    className?: string;
    subclassId?: string;
    subclassName?: string;
  };
  
  // Existing Attributes from STYLE_CHARACTERISTICS
  existingAttributes: Array<{
    typeId: string;
    typeName: string;
    valueId: string;
    valueName: string;
  }>;
  
  // Mandatory Rules from Hierarchy Governance
  mandatoryRules: Array<{
    attributeId: string;
    attributeName: string;
    validValues?: string[];
    defaultValue?: string;
    levelType: string;
    levelId: string;
  }>;
  
  // Optional Rules
  optionalRules: Array<{
    attributeId: string;
    attributeName: string;
    validValues?: string[];
  }>;
  
  // Valid Values for Key Attributes (from CHARACTERISTIC_VALUES)
  validValues?: Record<string, Array<{ id: string; name: string }>>;
  
  // Available Hierarchy Options
  hierarchyOptions?: HierarchyData;
  
  // User-specified focus attributes
  focusedAttributes?: string[];
}

export function buildUserPrompt(context: FullProductContext): string {
  const sections: string[] = [];
  
  // ========== HEADER ==========
  sections.push('Analyze this product image and extract attributes.\n');
  
  // ========== PRODUCT IDENTITY ==========
  const productLines: string[] = [
    `Style ID: ${context.styleId}`,
    `Color ID: ${context.colorId}`
  ];
  
  if (context.product.description) {
    productLines.push(`Current Description: ${context.product.description}`);
  }
  if (context.product.brandName || context.product.brandId) {
    productLines.push(`Brand: ${context.product.brandName || context.product.brandId}`);
  }
  if (context.product.vendorStyleNo) {
    productLines.push(`Vendor Style#: ${context.product.vendorStyleNo}`);
  }
  if (context.product.vendorName || context.product.vendorId) {
    productLines.push(`Vendor: ${context.product.vendorName || context.product.vendorId}`);
  }
  if (context.product.seasonId) {
    productLines.push(`Season: ${context.product.seasonId}`);
  }
  if (context.product.countryOfOrigin) {
    productLines.push(`Country of Origin: ${context.product.countryOfOrigin}`);
  }
  
  sections.push(`===== PRODUCT IDENTITY =====\n${productLines.join('\n')}`);
  
  // ========== PRODUCT HIERARCHY (EXISTING) ==========
  if (context.hierarchy.deptId) {
    const hierLines = [
      `Department: ${context.hierarchy.deptId}${context.hierarchy.deptName ? ` - ${context.hierarchy.deptName}` : ''}`,
    ];
    if (context.hierarchy.classId) {
      hierLines.push(`Class: ${context.hierarchy.classId}${context.hierarchy.className ? ` - ${context.hierarchy.className}` : ''}`);
    }
    if (context.hierarchy.subclassId) {
      hierLines.push(`Subclass: ${context.hierarchy.subclassId}${context.hierarchy.subclassName ? ` - ${context.hierarchy.subclassName}` : ''}`);
    }
    sections.push(`===== PRODUCT HIERARCHY =====\n${hierLines.join('\n')}`);
  }
  
  // ========== PRICING & SIZING ==========
  const pricingLines: string[] = [];
  if (context.product.msrp) {
    pricingLines.push(`MSRP: $${context.product.msrp.toFixed(2)}`);
  }
  if (context.product.ticketPrice) {
    pricingLines.push(`Ticket Price: $${context.product.ticketPrice.toFixed(2)}`);
  }
  if (context.product.sizeRangeId && !context.product.nonSizedInd) {
    pricingLines.push(`Size Range: ${context.product.sizeRangeId}`);
  }
  if (context.product.nonSizedInd) {
    pricingLines.push(`Sizing: Non-sized item (one-size)`);
  }
  if (context.product.dimensions?.height || context.product.dimensions?.width || context.product.dimensions?.depth) {
    const dims = [];
    if (context.product.dimensions.height) dims.push(`H:${context.product.dimensions.height}`);
    if (context.product.dimensions.width) dims.push(`W:${context.product.dimensions.width}`);
    if (context.product.dimensions.depth) dims.push(`D:${context.product.dimensions.depth}`);
    pricingLines.push(`Dimensions: ${dims.join(' × ')}`);
  }
  if (context.product.weight) {
    pricingLines.push(`Weight: ${context.product.weight}`);
  }
  
  if (pricingLines.length > 0) {
    sections.push(`===== PRICING & SIZING =====\n${pricingLines.join('\n')}`);
  }
  
  // ========== EXISTING ERP ATTRIBUTES ==========
  if (context.existingAttributes.length > 0) {
    const attrLines = context.existingAttributes
      .filter(a => a.valueName && a.valueName !== a.valueId) // Only show meaningful values
      .slice(0, 15) // Limit to prevent token bloat
      .map(a => `• ${a.typeName || a.typeId}: ${a.valueName || a.valueId}`);
    
    if (attrLines.length > 0) {
      sections.push(`===== EXISTING ERP ATTRIBUTES (Reference) =====\n${attrLines.join('\n')}${
        context.existingAttributes.length > 15 ? `\n... and ${context.existingAttributes.length - 15} more` : ''
      }`);
    }
  }
  
  // ========== ATTRIBUTES TO EXTRACT ==========
  // Combine mandatory and optional - AI extracts everything it can see with confidence
  const allRules = [...context.mandatoryRules, ...context.optionalRules];
  if (allRules.length > 0) {
    const attrLines = allRules.slice(0, 25).map(r => {
      let line = `• ${r.attributeName || r.attributeId}`;
      if (r.validValues && r.validValues.length > 0 && r.validValues.length <= 10) {
        line += ` → Valid: ${r.validValues.join(', ')}`;
      }
      return line;
    });
    
    sections.push(`===== ATTRIBUTES TO EXTRACT =====
Extract values for ALL of these attributes that you can identify in the image.
For each, provide your confidence level (High/Medium/Low).

${attrLines.join('\n')}`);
  }
  
  // ========== VALID VALUES FOR KEY ATTRIBUTES ==========
  if (context.validValues && Object.keys(context.validValues).length > 0) {
    const validValueSections: string[] = [];
    for (const [attrId, values] of Object.entries(context.validValues)) {
      if (values.length > 0 && values.length <= 20) {
        validValueSections.push(`${attrId}: ${values.map(v => v.name || v.id).join(', ')}`);
      }
    }
    if (validValueSections.length > 0) {
      sections.push(`===== VALID ATTRIBUTE VALUES =====
Use these exact values when matching:
${validValueSections.join('\n')}`);
    }
  }
  
  // ========== FOCUS ATTRIBUTES ==========
  if (context.focusedAttributes && context.focusedAttributes.length > 0) {
    sections.push(`===== CRITICAL: FOCUS ON THESE ATTRIBUTES =====
The user has specifically requested accurate values for:
${context.focusedAttributes.map(a => `• ${a}`).join('\n')}

Ensure these are prioritized and clearly identified in your response.`);
  }
  
  // ========== HIERARCHY OPTIONS ==========
  if (context.hierarchyOptions) {
    const hierOptSections: string[] = [];
    
    if (Object.keys(context.hierarchyOptions.groups).length > 0) {
      const groupsList = Object.entries(context.hierarchyOptions.groups)
        .map(([id, desc]) => `${id}:${desc}`)
        .join(', ');
      hierOptSections.push(`**Product Categories**: ${groupsList}`);
    }
    
    if (Object.keys(context.hierarchyOptions.departments).length > 0) {
      const deptsList = Object.entries(context.hierarchyOptions.departments)
        .map(([id, name]) => `${id}:${name}`)
        .join(', ');
      hierOptSections.push(`**Departments**: ${deptsList}`);
    }
    
    if (Object.keys(context.hierarchyOptions.classes).length > 0) {
      const classesList = Object.entries(context.hierarchyOptions.classes)
        .map(([id, desc]) => `${id}:${desc}`)
        .join(', ');
      hierOptSections.push(`**Categories (Classes)**: ${classesList}`);
    }
    
    if (Object.keys(context.hierarchyOptions.subclasses).length > 0) {
      const subclassesList = Object.entries(context.hierarchyOptions.subclasses)
        .slice(0, 50) // Limit subclasses as there can be many
        .map(([id, desc]) => `${id}:${desc}`)
        .join(', ');
      hierOptSections.push(`**Sub-Categories**: ${subclassesList}`);
    }
    
    if (hierOptSections.length > 0) {
      sections.push(`===== AVAILABLE HIERARCHY OPTIONS =====
Select from these EXACT values (format: ID:Description):

${hierOptSections.join('\n\n')}

IMPORTANT: You MUST select from these options. Return in format "ID:Description".`);
    }
  }
  
  // ========== VENDOR NOTES (If Present) ==========
  if (context.product.notes && context.product.notes.filter(n => n).length > 0) {
    const validNotes = context.product.notes.filter(n => n);
    sections.push(`===== VENDOR NOTES =====
${validNotes.map(n => `• ${n}`).join('\n')}`);
  }
  
  // ========== FINAL INSTRUCTION ==========
  sections.push(`===== EXTRACTION INSTRUCTION =====
Analyze the provided image and extract attributes following the schema above.
Prioritize mandatory attributes and use provided valid values when available.
Return ONLY valid JSON - no markdown, no explanations.`);
  
  return sections.join('\n\n');
}

// ============================================================================
// HELPER: Get Retailer Profile
// ============================================================================

export function getRetailerProfile(tenantId: string): RetailerProfile {
  return RETAILER_PROFILES[tenantId] || RETAILER_PROFILES['OCI'];
}

// ============================================================================
// LEGACY COMPATIBILITY: Export old function names
// ============================================================================

export { buildSystemPrompt as SYSTEM_PROMPT_V2 };
export { buildUserPrompt as buildEnrichedUserPromptV2 };
