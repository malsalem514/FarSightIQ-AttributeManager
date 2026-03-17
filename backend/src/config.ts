/**
 * Application Configuration
 * 
 * Environment-based configuration with sensible defaults
 */

import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3002', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Oracle Database (HARD-02: Pool hardening)
  oracle: {
    user: process.env.ORACLE_USER || '',
    password: process.env.ORACLE_PASSWORD || '',
    connectString: process.env.ORACLE_CONNECT_STRING || '',
    clientPath: process.env.ORACLE_CLIENT_PATH || undefined, // Nullable to allow Linux/System-managed Instant Client
    // Pool sizing
    poolMin: parseInt(process.env.ORACLE_POOL_MIN || '2', 10),
    poolMax: parseInt(process.env.ORACLE_POOL_MAX || '100', 10),
    poolIncrement: 5,
    poolTimeout: 300,        // Idle connection timeout (seconds)
    // Queue settings (prevent exhaustion)
    queueMax: parseInt(process.env.ORACLE_QUEUE_MAX || '500', 10),
    queueTimeout: 60000,     // Wait for connection (ms)
    // Statement cache
    stmtCacheSize: 30
  },
  
  // LLM Provider Configuration
  llm: {
    provider: (process.env.LLM_PROVIDER || 'openai') as 'openai' | 'gemini',
    
    // OpenAI Configuration
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    openaiTemperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.2'),

    // Gemini Configuration
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3-flash',
    geminiTemperature: parseFloat(process.env.GEMINI_TEMPERATURE || '0.2'),
    
    // Cache Configuration
    cacheEnabled: process.env.LLM_CACHE_ENABLED !== 'false', // Default: enabled
    cacheTtlSeconds: parseInt(process.env.LLM_CACHE_TTL_SECONDS || '2592000', 10), // 30 days
  },
  
  // CORS (HARD-03: Lockdown - use explicit origins in production)
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
  
  // Rate Limiting (HARD-01)
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 min
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10)
  }
};

/**
 * Parse CORS origins with validation
 */
function parseCorsOrigins(envValue?: string): string[] {
  if (!envValue) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CORS_ORIGINS must be explicitly set in production. Example: CORS_ORIGINS=https://your-domain.com');
    }
    return ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175']; // Dev defaults
  }

  const origins = envValue.split(',').map(o => o.trim()).filter(Boolean);

  // Block wildcard in production
  if (origins.includes('*') && process.env.NODE_ENV === 'production') {
    throw new Error('CORS wildcard (*) is not allowed in production. Set explicit origins in CORS_ORIGINS.');
  }

  return origins;
}

/**
 * Validate required configuration
 */
export function validateConfig(): { valid: boolean; missing: string[] } {
  const required = ['ORACLE_USER', 'ORACLE_PASSWORD', 'ORACLE_CONNECT_STRING'];
  const missing = required.filter(key => !process.env[key]);
  
  // Check LLM provider-specific requirements
  if (config.llm.provider === 'openai' && !config.llm.openaiApiKey) {
    missing.push('OPENAI_API_KEY (required for LLM_PROVIDER=openai)');
  } else if (config.llm.provider === 'gemini' && !config.llm.geminiApiKey) {
    missing.push('GEMINI_API_KEY (required for LLM_PROVIDER=gemini)');
  }
  
  return {
    valid: missing.length === 0,
    missing
  };
}

