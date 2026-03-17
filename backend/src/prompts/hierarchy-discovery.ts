/**
 * Hierarchy Discovery Prompts - V2 Enhanced
 * 
 * This is a CRITICAL prompt for new product onboarding.
 * The AI MUST return hierarchy that EXACTLY matches the retailer's taxonomy.
 * 
 * Key Requirements:
 * - Department: MANDATORY (must match exactly)
 * - Subclass: MANDATORY (must match exactly) 
 * - Class: REQUIRED but may be omitted if subclass is clear
 * - Short Description: MANDATORY (30 chars, merchandising-ready)
 * 
 * The prompt uses several techniques:
 * 1. Few-shot examples for the specific retailer
 * 2. Strict ID validation instructions
 * 3. Apparel-specific classification hints
 * 4. Gender/age detection logic
 * 5. Pattern/color identification
 */

import { FlatHierarchyItem } from '../services/hierarchy-cache.service.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// TYPES
// ============================================================================

interface HierarchyDiscoveryContext {
  retailerName: string;
  retailerDomain: string;
  availableHierarchy: FlatHierarchyItem[];
  imageName?: string;
}

interface HierarchyDiscoveryResult {
  department: { id: string; name: string; confidence: number };
  class: { id: string; name: string; confidence: number };
  subclass: { id: string; name: string; confidence: number };
  shortDescription: string;
  primaryColor: string;
  reasoning: string;
}

// ============================================================================
// MAIN PROMPT BUILDER
// ============================================================================

export function buildHierarchyDiscoveryPrompt(context: HierarchyDiscoveryContext): {
  systemPrompt: string;
  userPrompt: string;
} {
  const hierarchyTree = buildHierarchyTree(context.availableHierarchy);
  const deptCount = hierarchyTree.departments.length;
  
  logger.info('Building hierarchy prompt', { 
    totalOptions: context.availableHierarchy.length,
    departments: deptCount,
    sampleDepts: hierarchyTree.departments.slice(0, 5).map(d => d.name)
  });

  const systemPrompt = `You are an EXPERT product classifier for ${context.retailerName}, a ${context.retailerDomain} retailer.

════════════════════════════════════════════════════════════════════════════════
⚠️  CRITICAL: YOU MUST USE ONLY THE EXACT IDs FROM THE LIST BELOW  ⚠️
════════════════════════════════════════════════════════════════════════════════

Your task is to analyze a product image and classify it into the retailer's EXACT product hierarchy.

🚨 STRICT RULES:
- You MUST return IDs that EXACTLY MATCH the options listed below
- DO NOT invent department names like "Boys", "Girls", "Womens" - use the EXACT IDs like "CHAP", "WNAP"
- If you don't see a perfect match, pick the CLOSEST match from the list
- The "id" field MUST be one of the IDs shown in [ID: XXX] format

═══════════════════════════════════════════════════════════════════════════════
CLASSIFICATION RULES (FOLLOW PRECISELY)
═══════════════════════════════════════════════════════════════════════════════

1. DEPARTMENT (MANDATORY - Required)
   - Identify the broad product category
   - For apparel: Consider gender (Mens, Womens, Girls, Boys, Unisex)
   - For a pink floral dress → likely "Womens Apparel" or "Girls" (NOT "Boys")
   
2. CLASS (REQUIRED)
   - Identify the product type within department
   - Examples: Dresses, Tops, Bottoms, Outerwear, Footwear
   
3. SUBCLASS (MANDATORY - Required)  
   - Most specific classification
   - Examples: Casual Dress, Evening Gown, Midi Skirt, Polo Shirt
   - This is REQUIRED - always provide your best match

4. COLOR DETECTION
   - Identify the PRIMARY/dominant color
   - Use standard retail color names: Pink, Blue, Red, Black, White, Navy, etc.
   - For multi-color: identify the most prominent one

5. GENDER/AGE DETECTION (Critical for Apparel)
   - CHILDREN'S products: Smaller proportions, playful designs, character prints
   - WOMEN'S products: Adult sizing, sophisticated cuts, women's fashion trends
   - MEN'S products: Adult men's cuts, typically less ornate
   - Look for: Size labels, style cues, pattern complexity

═══════════════════════════════════════════════════════════════════════════════
AVAILABLE HIERARCHY OPTIONS (USE THESE EXACT IDs)
═══════════════════════════════════════════════════════════════════════════════
${hierarchyTree.formatted}

═══════════════════════════════════════════════════════════════════════════════
EXAMPLE CLASSIFICATIONS (Using actual IDs from common retail hierarchies)
═══════════════════════════════════════════════════════════════════════════════

Example 1: Pink floral girls dress with ruffles
{
  "department": {"id": "CHAP", "name": "Childrens Apparel", "confidence": 0.95},
  "class": {"id": "ONEP", "name": "One Piece", "confidence": 0.90},
  "subclass": {"id": "DRES", "name": "Dress", "confidence": 0.88},
  "shortDescription": "Girls Pink Floral Dress",
  "primaryColor": "Pink"
}
→ Key insight: Pink floral dress with playful design = Children's (CHAP), NOT Womens (WNAP)

Example 2: Men's navy polo shirt
{
  "department": {"id": "MNAP", "name": "Mens Apparel", "confidence": 0.95},
  "class": {"id": "TOPS", "name": "Top", "confidence": 0.92},
  "subclass": {"id": "POLO", "name": "Polo", "confidence": 0.90},
  "shortDescription": "Mens Navy Polo Shirt",
  "primaryColor": "Navy"
}

Example 3: Women's running shoes
{
  "department": {"id": "WMFT", "name": "Womens Footwear", "confidence": 0.93},
  "class": {"id": "RUNN", "name": "Running", "confidence": 0.88},
  "subclass": {"id": "TRAI", "name": "Training", "confidence": 0.85},
  "shortDescription": "Womens Running Shoes",
  "primaryColor": "White"
}

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT (STRICT JSON - NO MARKDOWN)
═══════════════════════════════════════════════════════════════════════════════

Return ONLY this JSON structure (no code blocks, no explanations):

{
  "department": {
    "id": "CHAP",           ← SHORT CODE from [ID: CHAP], NOT the full name!
    "name": "Childrens Apparel",
    "confidence": 0.95
  },
  "class": {
    "id": "TOPS",           ← SHORT CODE from [ID: TOPS], NOT the full name!
    "name": "Top",
    "confidence": 0.90
  },
  "subclass": {
    "id": "DRES",           ← SHORT CODE from [ID: DRES], NOT the full name!
    "name": "Dress",
    "confidence": 0.85
  },
  "shortDescription": "Girls Pink Floral Dress",
  "primaryColor": "Pink",
  "reasoning": "Pink floral dress with child proportions → Childrens Apparel"
}

⚠️ Common mistake: "id": "M ATHLETIC SHOES" is WRONG - use "id": "7150" (the short code)

🚨🚨🚨 CRITICAL REMINDERS 🚨🚨🚨
1. The "id" fields MUST use the SHORT CODE IDs from [ID: XXX] format, NOT the full name
   ✅ CORRECT: "id": "70FW"  (the short code)
   ❌ WRONG: "id": "Active Shoes"  (this is the name, not the ID!)
   ❌ WRONG: "id": "M ATHELTIC SHOES"  (this is a name, not a code!)
2. Look for IDs in brackets like [ID: 70FW], [ID: 715A], [ID: 7150]
3. For children's apparel (dresses, cute patterns, small proportions) → Use "CHAP" (Childrens Apparel)
4. For women's apparel (adult sizing, sophisticated styles) → Use "WNAP" (Womens Apparel)
5. DO NOT use generic names like "Boys", "Girls", "Women" as IDs
6. shortDescription: 30 chars max, merchandising-ready title`;

  const userPrompt = `Analyze this product image and classify it into ${context.retailerName}'s product hierarchy.

${context.imageName ? `📎 Filename hint: "${context.imageName}" (may contain product info)` : ''}

REQUIRED OUTPUT:
1. Department ID and name (MANDATORY)
2. Class ID and name (REQUIRED)
3. Subclass ID and name (MANDATORY)
4. Short description (30 chars max, merchandising title)
5. Primary color
6. Your reasoning

Remember: Use ONLY the exact IDs from the hierarchy list provided. Do not invent new IDs.
For dresses/apparel: Carefully determine if it's for Children, Women, or Men based on proportions and style.`;

  return { systemPrompt, userPrompt };
}

// ============================================================================
// HIERARCHY TREE BUILDER
// ============================================================================

interface HierarchyTreeNode {
  id: string;
  name: string;
  classes: {
    id: string;
    name: string;
    subclasses: { id: string; name: string }[];
  }[];
}

interface HierarchyTree {
  departments: HierarchyTreeNode[];
  formatted: string;
}

function buildHierarchyTree(hierarchy: FlatHierarchyItem[]): HierarchyTree {
  if (!hierarchy || hierarchy.length === 0) {
    return {
      departments: [],
      formatted: '⚠️ No hierarchy data available - classify based on general retail categories.'
    };
  }

  // Build tree structure
  const deptMap = new Map<string, HierarchyTreeNode>();
  
  for (const item of hierarchy) {
    if (!item.departmentId) continue;
    
    // Get or create department
    if (!deptMap.has(item.departmentId)) {
      deptMap.set(item.departmentId, {
        id: item.departmentId,
        name: item.departmentName || item.departmentId,
        classes: []
      });
    }
    
    const dept = deptMap.get(item.departmentId)!;
    
    // Add class if present
    if (item.classId) {
      let cls = dept.classes.find(c => c.id === item.classId);
      if (!cls) {
        cls = {
          id: item.classId,
          name: item.className || item.classId,
          subclasses: []
        };
        dept.classes.push(cls);
      }
      
      // Add subclass if present
      if (item.subclassId && !cls.subclasses.find(s => s.id === item.subclassId)) {
        cls.subclasses.push({
          id: item.subclassId,
          name: item.subclassName || item.subclassId
        });
      }
    }
  }

  const departments = Array.from(deptMap.values());
  
  // Sort for consistency
  departments.sort((a, b) => a.name.localeCompare(b.name));
  departments.forEach(d => {
    d.classes.sort((a, b) => a.name.localeCompare(b.name));
    d.classes.forEach(c => c.subclasses.sort((a, b) => a.name.localeCompare(b.name)));
  });

  // Format for prompt - prioritize apparel departments
  const apparelKeywords = ['apparel', 'clothing', 'wear', 'mens', 'womens', 'boys', 'girls', 'children', 'kids'];
  const apparelDepts = departments.filter(d => 
    apparelKeywords.some(k => d.name.toLowerCase().includes(k))
  );
  const otherDepts = departments.filter(d => 
    !apparelKeywords.some(k => d.name.toLowerCase().includes(k))
  );
  
  // Reorder: Apparel first, then others
  const sortedDepts = [...apparelDepts, ...otherDepts];

  let formatted = '';
  
  for (const dept of sortedDepts) {
    // Highlight apparel departments
    const isApparel = apparelKeywords.some(k => dept.name.toLowerCase().includes(k));
    const icon = isApparel ? '👔' : '📦';
    
    formatted += `\n${icon} DEPARTMENT: "${dept.name}" [ID: ${dept.id}]\n`;
    
    if (dept.classes.length === 0) {
      formatted += `   └─ (no classes defined)\n`;
    } else {
      for (const cls of dept.classes) {
        formatted += `   ├─ CLASS: "${cls.name}" [ID: ${cls.id}]\n`;
        
        if (cls.subclasses.length === 0) {
          formatted += `   │  └─ (no subclasses)\n`;
        } else {
          for (let i = 0; i < cls.subclasses.length; i++) {
            const sub = cls.subclasses[i];
            const isLast = i === cls.subclasses.length - 1;
            const prefix = isLast ? '└─' : '├─';
            formatted += `   │  ${prefix} SUBCLASS: "${sub.name}" [ID: ${sub.id}]\n`;
          }
        }
      }
    }
  }

  // Add summary at the top
  const summary = `
📊 HIERARCHY SUMMARY
   • ${departments.length} Departments
   • ${departments.reduce((sum, d) => sum + d.classes.length, 0)} Classes
   • ${departments.reduce((sum, d) => sum + d.classes.reduce((s, c) => s + c.subclasses.length, 0), 0)} Subclasses
   
🔍 SEARCH TIP: For apparel, look for departments containing "Apparel", "Mens", "Womens", "Boys", "Girls", "Children"
`;

  return {
    departments,
    formatted: summary + formatted
  };
}

// ============================================================================
// STEP 2: ATTRIBUTE EXTRACTION WITH HIERARCHY CONTEXT
// ============================================================================

interface AttributeExtractionContext {
  retailerName: string;
  identifiedHierarchy: {
    department: { id: string; name: string };
    class: { id: string; name: string };
    subclass?: { id: string; name: string };
  };
  applicableAttributes: {
    typeId: string;
    typeName: string;
    isMandatory: boolean;
    validValues?: { id: string; name: string }[];
  }[];
  existingProduct?: {
    description?: string;
    brand?: string;
    vendor?: string;
  };
}

export function buildAttributeExtractionPrompt(context: AttributeExtractionContext): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `You are a product attribute specialist for ${context.retailerName}.

===== YOUR TASK =====
Extract product attributes from the image for a ${context.identifiedHierarchy.subclass?.name || context.identifiedHierarchy.class.name} product.

===== PRODUCT CLASSIFICATION (ALREADY IDENTIFIED) =====
• Department: ${context.identifiedHierarchy.department.name}
• Class: ${context.identifiedHierarchy.class.name}
${context.identifiedHierarchy.subclass ? `• Subclass: ${context.identifiedHierarchy.subclass.name}` : ''}

===== ATTRIBUTES TO EXTRACT =====
${formatAttributeList(context.applicableAttributes)}

===== OUTPUT FORMAT =====
Return ONLY valid JSON:
{
  "short_description": "Concise product title (30 chars max)",
  "long_description": "Marketing-ready description (150-200 words)",
  "attributes": [
    {
      "type_id": "ATTR_TYPE_ID",
      "type_name": "Attribute Name",
      "value_id": "MATCHED_VALUE_ID",
      "value": "Attribute Value",
      "confidence": 0.95,
      "source": "visual" | "inferred" | "filename"
    }
  ],
  "additional_attributes": {
    "detected_brand": "Brand if visible",
    "color_family": "Primary color group",
    "material": "Primary material",
    "pattern": "Pattern type if any",
    "style_keywords": ["keyword1", "keyword2"]
  }
}`;

  let userPrompt = `Analyze this ${context.identifiedHierarchy.class.name} product and extract all applicable attributes.`;
  
  if (context.existingProduct?.brand) {
    userPrompt += `\n\nKnown Brand: ${context.existingProduct.brand}`;
  }
  if (context.existingProduct?.vendor) {
    userPrompt += `\nVendor: ${context.existingProduct.vendor}`;
  }
  if (context.existingProduct?.description) {
    userPrompt += `\nExisting Description: ${context.existingProduct.description}`;
  }

  return { systemPrompt, userPrompt };
}

function formatAttributeList(attributes: AttributeExtractionContext['applicableAttributes']): string {
  const mandatory = attributes.filter(a => a.isMandatory);
  const optional = attributes.filter(a => !a.isMandatory);
  
  let result = '';
  
  if (mandatory.length > 0) {
    result += '\n🔴 MANDATORY ATTRIBUTES:\n';
    for (const attr of mandatory) {
      result += `  • ${attr.typeName} (ID: ${attr.typeId})`;
      if (attr.validValues && attr.validValues.length > 0) {
        const values = attr.validValues.slice(0, 10).map(v => v.name).join(', ');
        result += `\n    Valid values: ${values}${attr.validValues.length > 10 ? '...' : ''}`;
      }
      result += '\n';
    }
  }
  
  if (optional.length > 0) {
    result += '\n🟡 OPTIONAL ATTRIBUTES:\n';
    for (const attr of optional.slice(0, 20)) {
      result += `  • ${attr.typeName} (ID: ${attr.typeId})`;
      if (attr.validValues && attr.validValues.length > 0) {
        const values = attr.validValues.slice(0, 5).map(v => v.name).join(', ');
        result += ` [${values}${attr.validValues.length > 5 ? '...' : ''}]`;
      }
      result += '\n';
    }
    if (optional.length > 20) {
      result += `  ... and ${optional.length - 20} more optional attributes\n`;
    }
  }
  
  return result;
}

// ============================================================================
// BATCH DISCOVERY - For multiple images
// ============================================================================

export interface BatchDiscoveryResult {
  imageName: string;
  hierarchy: {
    department: { id: string; name: string; confidence: number };
    class: { id: string; name: string; confidence: number };
    subclass?: { id: string; name: string; confidence: number };
  };
  reasoning: string;
  error?: string;
}

export function buildBatchHierarchyPrompt(
  retailerName: string,
  hierarchyOptions: string,
  imageCount: number
): string {
  return `You are classifying ${imageCount} product images for ${retailerName}.

For EACH image, identify the product hierarchy.

HIERARCHY OPTIONS:
${hierarchyOptions}

Return a JSON array with one entry per image:
[
  {
    "image_index": 0,
    "department": {"id": "ID", "name": "Name", "confidence": 0.9},
    "class": {"id": "ID", "name": "Name", "confidence": 0.85},
    "subclass": {"id": "ID", "name": "Name", "confidence": 0.8}
  }
]`;
}
