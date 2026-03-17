/**
 * Provider Factory Tests
 * 
 * Unit tests for LLM provider factory
 */

import { describe, it, expect } from 'vitest';
import { LLMProviderFactory } from '../provider-factory.js';
import { OpenAIProvider } from '../openai-provider.js';
import { GeminiProvider } from '../gemini-provider.js';

describe('LLMProviderFactory', () => {
  describe('create - OpenAI provider', () => {
    it('should create OpenAI provider with valid config', () => {
      const provider = LLMProviderFactory.create({
        providerType: 'openai',
        openaiApiKey: 'test-key',
        openaiModel: 'gpt-4o-mini',
        openaiTemperature: 0.2,
      });

      expect(provider).toBeInstanceOf(OpenAIProvider);
      expect(provider.name).toBe('openai');
    });

    it('should throw error if OpenAI API key is missing', () => {
      expect(() =>
        LLMProviderFactory.create({
          providerType: 'openai',
          openaiApiKey: undefined,
        })
      ).toThrow('OPENAI_API_KEY required for OpenAI provider');
    });
  });

  describe('create - Gemini provider', () => {
    it('should create Gemini provider with valid config', () => {
      const provider = LLMProviderFactory.create({
        providerType: 'gemini',
        geminiApiKey: 'test-key',
        geminiModel: 'gemini-1.5-flash',
        geminiTemperature: 0.2,
      });

      expect(provider).toBeInstanceOf(GeminiProvider);
      expect(provider.name).toBe('gemini');
    });

    it('should throw error if Gemini API key is missing', () => {
      expect(() =>
        LLMProviderFactory.create({
          providerType: 'gemini',
          geminiApiKey: undefined,
        })
      ).toThrow('GEMINI_API_KEY required for Gemini provider');
    });
  });

  describe('create - invalid provider', () => {
    it('should throw error for unsupported provider type', () => {
      expect(() =>
        LLMProviderFactory.create({
          providerType: 'invalid' as any,
        })
      ).toThrow('Unsupported LLM provider: invalid');
    });
  });

  describe('provider interface compliance', () => {
    it('OpenAI provider should implement LLMProvider interface', () => {
      const provider = LLMProviderFactory.create({
        providerType: 'openai',
        openaiApiKey: 'test-key',
      });

      expect(provider).toHaveProperty('name');
      expect(provider).toHaveProperty('extractAttributes');
      expect(provider).toHaveProperty('healthCheck');
    });

    it('Gemini provider should implement LLMProvider interface', () => {
      const provider = LLMProviderFactory.create({
        providerType: 'gemini',
        geminiApiKey: 'test-key',
      });

      expect(provider).toHaveProperty('name');
      expect(provider).toHaveProperty('extractAttributes');
      expect(provider).toHaveProperty('healthCheck');
    });
  });
});
