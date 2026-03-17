/**
 * Mapping Engine
 * 
 * Semantic mapping from LLM output to ERP characteristic values
 * Priority: Rule-based (100%) > Fuzzy (variable)
 */

import type { MappingRule, CharValue, MappedAttribute } from '../types/index.js';
import { SemanticMappingService } from './attributes/semantic-mapping.service.js';
import { logger } from '../utils/logger.js';

export interface MappedResult {
  typeId: string;
  valueId: string;
  valueDesc: string;
  confidence: number;
  source: 'rule' | 'fuzzy' | 'embedding';
}

/**
 * Per-type confidence thresholds
 * Reference: https://en.wikipedia.org/wiki/Precision_and_recall
 */
export interface TypeThreshold {
  typeId: string;
  minConfidence: number;  // Minimum score to accept fuzzy match
  description?: string;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score (0-100) between two strings
 */
function similarity(a: string, b: string): number {
  const aLower = a.toLowerCase().trim();
  const bLower = b.toLowerCase().trim();
  
  // Exact match
  if (aLower === bLower) return 100;
  
  // Contains match (higher weight)
  if (aLower.includes(bLower) || bLower.includes(aLower)) {
    const containRatio = Math.min(aLower.length, bLower.length) / Math.max(aLower.length, bLower.length);
    return Math.round(70 + containRatio * 25);
  }
  
  // Word overlap
  const aWords = new Set(aLower.split(/\s+/));
  const bWords = new Set(bLower.split(/\s+/));
  const intersection = [...aWords].filter(w => bWords.has(w));
  if (intersection.length > 0) {
    const overlapRatio = intersection.length / Math.max(aWords.size, bWords.size);
    return Math.round(50 + overlapRatio * 40);
  }
  
  // Levenshtein distance based
  const maxLen = Math.max(aLower.length, bLower.length);
  if (maxLen === 0) return 100;
  
  const distance = levenshtein(aLower, bLower);
  return Math.round((1 - distance / maxLen) * 100);
}

export class MappingEngine {
  private rules: MappingRule[];
  private charValues: CharValue[];
  private ruleIndex: Map<string, MappingRule>;
  private typeThresholds: Map<string, number>;
  private defaultThreshold: number;
  
  constructor(
    rules: MappingRule[], 
    charValues: CharValue[],
    typeThresholds: TypeThreshold[] = [],
    defaultThreshold = 50
  ) {
    this.rules = rules.filter(r => r.isActive);
    this.charValues = charValues;
    this.defaultThreshold = defaultThreshold;
    
    // Build index for fast rule lookup (lowercase key)
    this.ruleIndex = new Map();
    for (const rule of this.rules) {
      this.ruleIndex.set(rule.llmInput.toLowerCase().trim(), rule);
    }
    
    // Build threshold index by type
    this.typeThresholds = new Map();
    for (const tt of typeThresholds) {
      this.typeThresholds.set(tt.typeId, tt.minConfidence);
    }
  }
  
  /**
   * Get threshold for a specific type (or default)
   */
  getThreshold(typeId: string): number {
    return this.typeThresholds.get(typeId) ?? this.defaultThreshold;
  }
  
  /**
   * Set threshold for a specific type
   */
  setThreshold(typeId: string, minConfidence: number): void {
    this.typeThresholds.set(typeId, Math.max(0, Math.min(100, minConfidence)));
  }
  
  /**
   * Get all type thresholds
   */
  getAllThresholds(): TypeThreshold[] {
    return Array.from(this.typeThresholds.entries()).map(([typeId, minConfidence]) => ({
      typeId,
      minConfidence
    }));
  }

  /**
   * Enhanced Map with Semantic Magic
   */
  async map(llmValue: string, forTypeId?: string): Promise<MappedResult | null> {
    const normalized = llmValue.toLowerCase().trim();
    
    // 1. Try rule-based match (exact) - always 100%
    const rule = this.ruleIndex.get(normalized);
    if (rule) {
      return {
        typeId: rule.targetTypeId,
        valueId: rule.targetValueId,
        valueDesc: rule.targetValueDesc,
        confidence: 100,
        source: 'rule'
      };
    }
    
    // 2. Try fuzzy match against char values
    let bestMatch: MappedResult | null = null;
    let bestScore = 0;
    
    // Filter candidates if type specified
    const candidates = forTypeId 
      ? this.charValues.filter(cv => cv.typeId === forTypeId)
      : this.charValues;
    
    for (const cv of candidates) {
      const score = similarity(llmValue, cv.description);
      const threshold = this.getThreshold(cv.typeId);
      
      // Use per-type threshold
      if (score > bestScore && score >= threshold) {
        bestScore = score;
        bestMatch = {
          typeId: cv.typeId,
          valueId: cv.valueId,
          valueDesc: cv.description,
          confidence: score,
          source: 'fuzzy'
        };
      }
    }
    
    // 3. Magic Stage: Semantic Mapping (Embeddings)
    // If fuzzy didn't get a very high score, try semantic
    if (bestScore < 85) {
      const semanticService = new SemanticMappingService();
      const semanticMatch = await semanticService.findBestMatch(
        llmValue, 
        candidates.map(c => ({ id: `${c.typeId}|${c.valueId}`, description: c.description }))
      );

      if (semanticMatch && semanticMatch.similarity * 100 > bestScore) {
        const [typeId, valueId] = semanticMatch.targetId.split('|');
        return {
          typeId,
          valueId,
          valueDesc: semanticMatch.targetDesc,
          confidence: Math.round(semanticMatch.similarity * 100),
          source: 'embedding'
        };
      }
    }
    
    return bestMatch;
  }

  /**
   * Map all attributes from AI result
   * Uses per-type thresholds for each attribute
   */
  async mapAll(aiAttributes: Record<string, string>, allowedTypeIds?: Set<string>): Promise<MappedAttribute[]> {
    const results: MappedAttribute[] = [];
    
    for (const [name, value] of Object.entries(aiAttributes)) {
      // If we have allowed types (from hierarchy), prioritize them
      const mapped = await this.map(value);
      
      // Magic logic: if mapped type is not in allowed types, maybe lower confidence or skip
      let finalMapped = mapped;
      if (allowedTypeIds && mapped && !allowedTypeIds.has(mapped.typeId)) {
        // Try to find a match specifically within allowed types
        let bestContextualMatch = null;
        let bestContextualScore = 0;
        
        for (const typeId of allowedTypeIds) {
          const match = await this.map(value, typeId);
          if (match && match.confidence > bestContextualScore) {
            bestContextualScore = match.confidence;
            bestContextualMatch = match;
          }
        }
        
        if (bestContextualMatch && bestContextualMatch.confidence > (mapped.confidence - 20)) {
          finalMapped = bestContextualMatch;
        }
      }

      results.push({
        name,
        aiValue: value,
        erpTypeId: finalMapped?.typeId || null,
        erpValueId: finalMapped?.valueId || null,
        erpValueDesc: finalMapped?.valueDesc || null,
        confidence: finalMapped?.confidence || 0,
        mappingSource: finalMapped?.source || 'none',
        isRequired: false,
        status: 'pending'
      });
    }
    
    return results;
  }

  /**
   * Map all attributes with per-attribute AI confidence preserved
   * The AI confidence is used as the base, then combined with mapping confidence:
   * - Rule match: Uses AI confidence (100% mapping accuracy)
   * - Fuzzy/Semantic: Uses average of AI confidence and mapping confidence
   */
  async mapAllWithConfidence(
    aiAttributes: Record<string, { value: string; confidence: number }>,
    allowedTypeIds?: Set<string>
  ): Promise<MappedAttribute[]> {
    const results: MappedAttribute[] = [];
    
    for (const [name, { value, confidence: aiConfidence }] of Object.entries(aiAttributes)) {
      if (!value || value.trim() === '') continue;
      
      // Try to map the value to ERP
      const mapped = await this.map(value);
      
      // Check if mapped type is in allowed types (hierarchy-aware)
      let finalMapped = mapped;
      if (allowedTypeIds && mapped && !allowedTypeIds.has(mapped.typeId)) {
        let bestContextualMatch = null;
        let bestContextualScore = 0;
        
        for (const typeId of allowedTypeIds) {
          const match = await this.map(value, typeId);
          if (match && match.confidence > bestContextualScore) {
            bestContextualScore = match.confidence;
            bestContextualMatch = match;
          }
        }
        
        if (bestContextualMatch && bestContextualMatch.confidence > (mapped.confidence - 20)) {
          finalMapped = bestContextualMatch;
        }
      }

      // Calculate final confidence:
      // - AI confidence = how certain the LLM is about the extracted value
      // - Mapping confidence = how well the value maps to ERP
      // Combined: For rule matches (100%), use AI confidence directly
      // For fuzzy/semantic, average them
      let finalConfidence = aiConfidence;
      if (finalMapped) {
        if (finalMapped.source === 'rule') {
          // Perfect mapping - use AI's confidence
          finalConfidence = aiConfidence;
        } else {
          // Fuzzy/semantic - combine AI and mapping confidence
          finalConfidence = Math.round((aiConfidence + finalMapped.confidence) / 2);
        }
      }

      results.push({
        name,
        aiValue: value,
        suggestedValue: value, // For display in UI
        erpTypeId: finalMapped?.typeId || null,
        erpValueId: finalMapped?.valueId || null,
        erpValueDesc: finalMapped?.valueDesc || null,
        confidence: finalConfidence,
        mappingSource: finalMapped?.source || 'none',
        isRequired: false,
        status: 'pending'
      });
    }
    
    return results;
  }

  /**
   * Add a new rule (for learning from user corrections)
   */
  addRule(rule: MappingRule): void {
    this.rules.push(rule);
    this.ruleIndex.set(rule.llmInput.toLowerCase().trim(), rule);
  }

  /**
   * Get statistics about rule coverage
   */
  getStats(): { ruleCount: number; valueCount: number; coverage: number } {
    const mappedTypes = new Set(this.rules.map(r => r.targetTypeId));
    const allTypes = new Set(this.charValues.map(cv => cv.typeId));
    
    return {
      ruleCount: this.rules.length,
      valueCount: this.charValues.length,
      coverage: allTypes.size > 0 ? Math.round((mappedTypes.size / allTypes.size) * 100) : 0
    };
  }

  /**
   * Get top N suggestions for an unmapped LLM value
   * Returns ranked ERP values by similarity score
   */
  getSuggestions(llmValue: string, typeId?: string, topN = 5): MappedResult[] {
    const results: MappedResult[] = [];
    const candidates = typeId 
      ? this.charValues.filter(cv => cv.typeId === typeId)
      : this.charValues;
    
    for (const cv of candidates) {
      const score = similarity(llmValue, cv.description);
      if (score >= 30) { // Lower threshold for suggestions
        results.push({
          typeId: cv.typeId,
          valueId: cv.valueId,
          valueDesc: cv.description,
          confidence: score,
          source: 'fuzzy'
        });
      }
    }
    
    return results
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, topN);
  }

  /**
   * Get all unmapped attributes from a mapping result
   */
  getUnmapped(mapped: MappedAttribute[]): MappedAttribute[] {
    return mapped.filter(attr => 
      !attr.erpValueId || attr.mappingSource === 'none'
    );
  }

  /**
   * Calculate mapping coverage percentage
   */
  getCoverage(mapped: MappedAttribute[]): number {
    if (mapped.length === 0) return 100;
    const mappedCount = mapped.filter(a => a.erpValueId).length;
    return Math.round((mappedCount / mapped.length) * 100);
  }
}

