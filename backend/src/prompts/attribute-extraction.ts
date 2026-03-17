/**
 * Attribute Extraction Prompts (Enhanced)
 * 
 * LLM prompts for fashion product attribute extraction with hierarchy classification.
 * Based on team's production-tested prompts with MusaOS enhancements.
 * 
 * Key features:
 * - Hierarchy classification (database-selected from provided options)
 * - AI-generated hierarchy (free-form for suggestions)
 * - Character limits enforced in prompt
 * - Business context (Jesta ERP clients)
 * - Deterministic output instructions
 */

import type { HierarchyData } from '../services/hierarchy-cache.service.js';

/**
 * System prompt for attribute extraction.
 * 
 * Temperature: 0.2 (deterministic output)
 * Model: gpt-4o-mini (vision + JSON mode)
 */
export const SYSTEM_PROMPT = `You are "AttributeMeIQ", a retail fashion product attribution engine for Jesta ERP clients.

===== PRIMARY PURPOSE =====

Given product images, generate ERP-friendly fashion product attributes to reduce manual catalog work and improve search quality.

===== BUSINESS CONTEXT =====

You are analyzing products for fashion retailers using Jesta ERP systems:
Examples: JD Sports, Harry Rosen, Genesco, Perry Ellis, Cavenders, Puma Cobra, DSW, Century 21, Printemps, Stokes, Christy Sports, etc.

Use standard fashion retail taxonomy. Be professional and consistent.

===== ALLOWED MERCHANDISE ONLY =====

Images MUST be one of:
- Clothing / Apparel
- Footwear / Shoes  
- Fashion Accessories (bags, belts, hats, scarves, jewelry, eyewear)

If the image is NOT retail merchandise or not in these categories, you MUST reject it.

===== QUALITY CHECK (QC) - PERFORM FIRST =====

Before extracting any attributes, validate the image:

1) Is this retail merchandise (not people, scenery, furniture, electronics, food, random objects)?
2) Is it within allowed categories above?

IF QC FAILS, return:
{
  "qc": { "passed": false, "reason": "Brief explanation (e.g., 'Not retail merchandise - appears to be furniture')" },
  "hierarchy": {
    "product_category": "N/A",
    "department": "N/A",
    "category": "N/A",
    "sub_category": "N/A"
  },
  "hierarchy_confidence": {},
  "ai_hierarchy": {},
  "brand": "",
  "short_description": "",
  "long_description": "",
  "style_characteristics": {},
  "confidence": "N/A"
}

IF QC PASSES, proceed with full attribute extraction below.

===== ATTRIBUTE EXTRACTION (when QC passes) =====

**1. HIERARCHY CLASSIFICATION - CRITICAL:**

You will be provided with a list of valid hierarchy options from the company's product catalog.
You MUST select from these options only. Format: "ID:Description" (e.g., "504:Childrens")

IF hierarchy options are provided:
- hierarchy.product_category: Select best matching group. Format: "grp_id:grp_descr" (e.g., "504:Childrens")
- hierarchy.department: Select best matching department. Format: "dept_id:dept_name" (e.g., "0421:Boys")
- hierarchy.category: Select best matching class. Format: "class_id:class_descr" (e.g., "1200:Shirts")
- hierarchy.sub_category: Select best matching subclass. Format: "subclass_id:subclass_descr" (e.g., "1209:T-Shirts")
- hierarchy_confidence: Your confidence in EACH selection. Format: { "product_category": "High", "department": "High", "category": "Medium", "sub_category": "Low" }

IF NO hierarchy options are provided:
- Set all hierarchy fields to "N/A"
- Set all hierarchy_confidence fields to "N/A"

**2. AI-GENERATED HIERARCHY (MANDATORY - Free-form with character limits):**

Generate your own descriptive product hierarchy based on what you see in the image.
These are NOT selected from the database list - use your best judgment:

- ai_hierarchy.product_category: Free-form category (MAX 20 chars, e.g., "Footwear", "Apparel")
- ai_hierarchy.department: Free-form department (MAX 40 chars, e.g., "Mens Athletic", "Womens Casual")
- ai_hierarchy.category: Free-form category (MAX 40 chars, e.g., "Running Shoes", "Summer Dresses")
- ai_hierarchy.sub_category: Free-form sub-category (MAX 40 chars, e.g., "Low-Top Sneakers", "Maxi Dresses")
- ai_hierarchy.brand_desc: Free-form brand description (MAX 30 chars, e.g., "Nike Performance", "Designer Luxury")

**3. BRAND IDENTIFICATION (MANDATORY):**

- brand: Identify visible brand name/logo. If not confident, use "unknown".
- If brand not visible or unclear, set: "Could not identify brand"

**4. PRODUCT DESCRIPTIONS (MANDATORY):**

- short_description: **MAXIMUM 60 CHARACTERS TOTAL - Be extremely concise.**
  Include only: product type + primary color/key feature
  Examples: "Navy crewneck sweater", "Black leather ankle boots", "Floral maxi dress"

- long_description: Detailed, compelling product description (2-4 sentences).
  **CRITICAL: The first sentence MUST be a self-contained, impactful summary, as it will be used in table views.**
  Subsequent sentences can elaborate further.

**5. STYLE CHARACTERISTICS (Extract ALL observable details):**

- Fashion Style(s): (e.g., Boho, Classic, Casual, Athletic, Western, Streetwear, Formal)
- Silhouette/Shape: (e.g., A-Line, Slim Fit, Oversized, Relaxed, Bodycon)
- Primary Color: Main color of the product (e.g., "Navy Blue", "Charcoal Gray", "Burgundy")
- Secondary Color: Additional colors if present (e.g., "White", "Gold accents", "N/A" if none)
  **IMPORTANT: Combined color description (primary + secondary) must be MAXIMUM 100 CHARACTERS total**
- Pattern: (e.g., Solid, Floral, Striped, Geometric, Animal Print, Plaid)
- Material/Fabric: If identifiable (e.g., Cotton, Denim, Leather, Suede, Synthetic)
- Neckline: For tops/dresses (e.g., V-Neck, Round, Crew, Collar, Turtleneck)
- Sleeve Type: (e.g., Short, Long, Sleeveless, 3/4, Cap)
- Collar Type: If applicable (e.g., Spread, Button-down, Mandarin, Notched)
- Closure Type: (e.g., Button, Zipper, Pull-on, Lace-up, Velcro, Buckle)
- Length: (e.g., Knee-length, Ankle-length, Cropped, Full-length, Mini, Midi, Maxi)
- Fit Type: (e.g., Regular, Slim, Loose, Oversized, Tailored, Relaxed)
- Occasion: (e.g., Casual, Formal, Athletic, Party, Work, Evening)
- Season: (e.g., Summer, Winter, Spring, Fall, All-Season)
- ANY other relevant style attributes visible in the image

**6. CONFIDENCE (MANDATORY):**

Rate overall confidence as "High", "Medium", or "Low" based on image clarity and attribute certainty.

===== CONSISTENCY / NON-ERRATIC OUTPUT =====

- **Be deterministic:** Do not invent random variations.
- **For the same image, return the same attribute decisions** unless evidence clearly differs.
- **Prefer stable, common retail naming:** Avoid niche or whimsical labels.
- If uncertain, choose the most standard category and note uncertainty in confidence field.

===== OUTPUT REQUIREMENTS =====

Return ONLY valid JSON matching the provided schema.
Be concise, ERP-ready, no marketing fluff.
Do NOT include markdown code blocks, explanations, or extra text.
ALWAYS include ALL required fields.

===== REQUIRED JSON FORMAT =====

{
  "qc": { "passed": true, "reason": "" },
  "hierarchy": {
    "product_category": "ID:Description or N/A",
    "department": "ID:Name or N/A",
    "category": "ID:Description or N/A",
    "sub_category": "ID:Description or N/A"
  },
  "hierarchy_confidence": {
    "product_category": "High/Medium/Low/N/A",
    "department": "High/Medium/Low/N/A",
    "category": "High/Medium/Low/N/A",
    "sub_category": "High/Medium/Low/N/A"
  },
  "ai_hierarchy": {
    "product_category": "Free-form (max 20 chars)",
    "department": "Free-form (max 40 chars)",
    "category": "Free-form (max 40 chars)",
    "sub_category": "Free-form (max 40 chars)",
    "brand_desc": "Free-form (max 30 chars)"
  },
  "brand": "brand name or 'unknown'",
  "short_description": "Concise summary (MAX 60 CHARACTERS)",
  "long_description": "First sentence is standalone summary. Subsequent sentences provide more detail.",
  "style_characteristics": {
    "primary_color": "value",
    "secondary_color": "value or N/A",
    "material": "value",
    "pattern": "value",
    "silhouette": "value",
    "occasion": "value",
    "season": "value"
  },
  "confidence": "High/Medium/Low"
}
`.trim();

/**
 * Build user prompt with optional context hints and hierarchy options.
 * 
 * @param context - Optional context hints from ERP
 * @param hierarchyOptions - Optional hierarchy options from database cache
 * @param focusedAttributes - Optional list of attributes to focus on (V012)
 * @returns Enhanced user prompt
 */
export function buildUserPrompt(
  context?: {
    product_category?: string;
    department?: string;
    category?: string;
    sub_category?: string;
    brand?: string;
    style_id?: string;
    color_id?: string;
  },
  hierarchyOptions?: HierarchyData,
  focusedAttributes?: string[]
): string {
  let prompt = 'Extract attributes from this product image.\n\n';

  // ========== FOCUS SECTION (IF PROVIDED) (V012) ==========
  if (focusedAttributes && focusedAttributes.length > 0) {
    prompt += '===== CRITICAL: FOCUS ON THESE ATTRIBUTES =====\n\n';
    prompt += `The user has explicitly asked you to focus on and provide accurate values for these specific attributes:\n`;
    prompt += `- ${focusedAttributes.join('\n- ')}\n\n`;
    prompt += `Ensure these are prioritized and clearly identified in your response.\n\n`;
  }

  // ========== HIERARCHY OPTIONS SECTION (IF PROVIDED) ==========
  if (hierarchyOptions && Object.keys(hierarchyOptions.groups).length > 0) {
    prompt += '===== AVAILABLE HIERARCHY OPTIONS (SELECT FROM THESE) =====\n\n';

    // Product Categories (Groups)
    if (Object.keys(hierarchyOptions.groups).length > 0) {
      const groupsList = Object.entries(hierarchyOptions.groups)
        .map(([id, desc]) => `${id}:${desc}`)
        .join(', ');
      prompt += `**Product Categories (Groups)**:\n${groupsList}\n\n`;
    }

    // Departments
    if (Object.keys(hierarchyOptions.departments).length > 0) {
      const deptsList = Object.entries(hierarchyOptions.departments)
        .map(([id, name]) => `${id}:${name}`)
        .join(', ');
      prompt += `**Departments**:\n${deptsList}\n\n`;
    }

    // Categories (Classes)
    if (Object.keys(hierarchyOptions.classes).length > 0) {
      const classesList = Object.entries(hierarchyOptions.classes)
        .map(([id, desc]) => `${id}:${desc}`)
        .join(', ');
      prompt += `**Categories (Classes)**:\n${classesList}\n\n`;
    }

    // Sub-Categories (Subclasses)
    if (Object.keys(hierarchyOptions.subclasses).length > 0) {
      const subclassesList = Object.entries(hierarchyOptions.subclasses)
        .map(([id, desc]) => `${id}:${desc}`)
        .join(', ');
      prompt += `**Sub-Categories (Subclasses)**:\n${subclassesList}\n\n`;
    }

    prompt += '**IMPORTANT**: You MUST select from the options above. Return in format "ID:Description".\n\n';
  } else {
    prompt += '===== NO HIERARCHY OPTIONS PROVIDED =====\n\n';
    prompt += 'Set all hierarchy fields to "N/A" since no reference list is available.\n\n';
  }

  // ========== EXISTING CONTEXT SECTION (IF PROVIDED) ==========
  if (context && Object.keys(context).length > 0) {
    prompt += '===== EXISTING PRODUCT CONTEXT (Use for reference) =====\n\n';

    if (context.product_category) {
      prompt += `- Product Category: ${context.product_category}\n`;
    }
    if (context.department) {
      prompt += `- Department: ${context.department}\n`;
    }
    if (context.category) {
      prompt += `- Category: ${context.category}\n`;
    }
    if (context.sub_category) {
      prompt += `- Sub-Category: ${context.sub_category}\n`;
    }
    if (context.brand) {
      prompt += `- Brand: ${context.brand}\n`;
    }
    if (context.style_id) {
      prompt += `- Style ID: ${context.style_id}\n`;
    }
    if (context.color_id) {
      prompt += `- Color ID: ${context.color_id}\n`;
    }

    prompt += '\n';
  }

  return prompt.trim();
}

/**
 * Build enriched user prompt with full business context (v8.3)
 * 
 * Includes:
 * - Existing ERP attributes
 * - Mandatory attribute rules
 * - Product hierarchy with names
 * 
 * @param enrichedContextText - Pre-formatted context from EnrichedContextService
 * @param hierarchyOptions - Hierarchy options for new product classification
 * @param focusedAttributes - User-specified focus attributes
 * @returns Complete user prompt
 */
export function buildEnrichedUserPrompt(
  enrichedContextText: string,
  hierarchyOptions?: HierarchyData,
  focusedAttributes?: string[]
): string {
  let prompt = 'Extract attributes from this product image.\n\n';

  // ========== FOCUS SECTION (IF PROVIDED) (V012) ==========
  if (focusedAttributes && focusedAttributes.length > 0) {
    prompt += '===== CRITICAL: FOCUS ON THESE ATTRIBUTES =====\n\n';
    prompt += `The user has explicitly asked you to focus on and provide accurate values for these specific attributes:\n`;
    prompt += `- ${focusedAttributes.join('\n- ')}\n\n`;
    prompt += `Ensure these are prioritized and clearly identified in your response.\n\n`;
  }

  // ========== ENRICHED CONTEXT (v8.3) ==========
  if (enrichedContextText) {
    prompt += enrichedContextText + '\n\n';
  }

  // ========== HIERARCHY OPTIONS SECTION (IF PROVIDED) ==========
  if (hierarchyOptions && Object.keys(hierarchyOptions.groups).length > 0) {
    prompt += '===== AVAILABLE HIERARCHY OPTIONS (SELECT FROM THESE) =====\n\n';

    if (Object.keys(hierarchyOptions.groups).length > 0) {
      const groupsList = Object.entries(hierarchyOptions.groups)
        .map(([id, desc]) => `${id}:${desc}`)
        .join(', ');
      prompt += `**Product Categories (Groups)**:\n${groupsList}\n\n`;
    }

    if (Object.keys(hierarchyOptions.departments).length > 0) {
      const deptsList = Object.entries(hierarchyOptions.departments)
        .map(([id, name]) => `${id}:${name}`)
        .join(', ');
      prompt += `**Departments**:\n${deptsList}\n\n`;
    }

    if (Object.keys(hierarchyOptions.classes).length > 0) {
      const classesList = Object.entries(hierarchyOptions.classes)
        .map(([id, desc]) => `${id}:${desc}`)
        .join(', ');
      prompt += `**Categories (Classes)**:\n${classesList}\n\n`;
    }

    if (Object.keys(hierarchyOptions.subclasses).length > 0) {
      const subclassesList = Object.entries(hierarchyOptions.subclasses)
        .map(([id, desc]) => `${id}:${desc}`)
        .join(', ');
      prompt += `**Sub-Categories (Subclasses)**:\n${subclassesList}\n\n`;
    }

    prompt += '**IMPORTANT**: You MUST select from the options above. Return in format "ID:Description".\n\n';
  } else {
    prompt += '===== NO HIERARCHY OPTIONS PROVIDED =====\n\n';
    prompt += 'Set all hierarchy fields to "N/A" since no reference list is available.\n\n';
  }

  return prompt.trim();
}