/**
 * LLM Provider Factory
 * 
 * Creates LLM provider instances based on configuration
 * Allows swapping providers without changing business logic
 */

import { OpenAIProvider } from './openai-provider.js';
import { GeminiProvider } from './gemini-provider.js';
import { logger } from '../../utils/logger.js';
import type { LLMProvider } from './types.js';

export type ProviderType = 'openai' | 'gemini';

/**
 * Configuration for LLM provider factory
 */
export interface LLMProviderFactoryConfig {
  // Provider selection
  providerType: ProviderType;
  
  // OpenAI config
  openaiApiKey?: string;
  openaiModel?: string;
  openaiTemperature?: number;

  // Gemini config
  geminiApiKey?: string;
  geminiModel?: string;
  geminiTemperature?: number;
}

/**
 * LLM Provider Factory
 * 
 * Creates appropriate provider based on configuration
 */
export class LLMProviderFactory {
  /**
   * Create LLM provider instance
   * 
   * @param config - Provider configuration
   * @returns LLM provider instance
   * @throws Error if provider type is unsupported or required config is missing
   */
  static create(config: LLMProviderFactoryConfig): LLMProvider {
    switch (config.providerType) {
      case 'openai':
        if (!config.openaiApiKey) {
          throw new Error('OPENAI_API_KEY required for OpenAI provider');
        }
        
        logger.info('Initializing OpenAI provider', {
          model: config.openaiModel || 'gpt-4o-mini',
          temperature: config.openaiTemperature ?? 0.2,
        });
        
        return new OpenAIProvider({
          apiKey: config.openaiApiKey,
          model: config.openaiModel,
          temperature: config.openaiTemperature,
        });

      case 'gemini':
        if (!config.geminiApiKey) {
          throw new Error('GEMINI_API_KEY required for Gemini provider');
        }

        logger.info('Initializing Gemini provider', {
          model: config.geminiModel || 'gemini-1.5-flash',
          temperature: config.geminiTemperature ?? 0.2,
        });

        return new GeminiProvider({
          apiKey: config.geminiApiKey,
          model: config.geminiModel,
          temperature: config.geminiTemperature,
        });

      default:
        throw new Error(`Unsupported LLM provider: ${config.providerType}`);
    }
  }
}

