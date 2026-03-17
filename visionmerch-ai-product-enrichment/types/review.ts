/**
 * Review Tab Types
 * 
 * Shared types for Review components (~20 LOC)
 */

export interface Attribute {
  name: string;
  erp: string;
  ai: string;
  conf: number;
  mapped: string;
  status: 'accepted' | 'pending' | 'rejected';
  error?: string;
  required: boolean;
}

export interface EditValues {
  ai: string;
  mapped: string;
}

