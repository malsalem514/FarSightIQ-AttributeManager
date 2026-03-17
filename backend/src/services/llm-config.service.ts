/**
 * LLM Configuration Service (v8.4 - Scalability Settings)
 * 
 * Manages LLM provider settings stored in LLM_CONFIG table.
 * Includes batch processing scalability configuration.
 */

import oracledb from 'oracledb';
import { withConnection } from './oracle-pool.js';
import { logger } from '../utils/logger.js';

export interface LLMConfig {
  providerId: 'openai' | 'gemini';
  isActive: boolean;
  apiKey?: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
}

export interface BatchConfig {
  maxConcurrentRequests: number;
  batchChunkSize: number;
  requestTimeoutMs: number;
  retryAttempts: number;
}

// Runtime configuration cache (avoids DB read on every batch)
let batchConfigCache: BatchConfig | null = null;
let batchConfigCacheTime = 0;
const BATCH_CONFIG_CACHE_TTL_MS = 60000; // 1 minute

export class LLMConfigService {
  /**
   * Get all LLM configurations (with masked API keys for display)
   */
  async getAllConfigs(): Promise<LLMConfig[]> {
    return withConnection(async (conn) => {
      const res = await conn.execute(
        `SELECT PROVIDER_ID, IS_ACTIVE, API_KEY, MODEL_NAME, TEMPERATURE, MAX_TOKENS 
         FROM LLM_CONFIG 
         ORDER BY PROVIDER_ID`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      return (res.rows as any[]).map(r => ({
        providerId: r.PROVIDER_ID,
        isActive: r.IS_ACTIVE === 'Y',
        apiKey: r.API_KEY ? '****' + r.API_KEY.slice(-4) : undefined, // Mask key
        modelName: r.MODEL_NAME,
        temperature: r.TEMPERATURE,
        maxTokens: r.MAX_TOKENS
      }));
    });
  }

  /**
   * Get active provider config with full API key (for internal use only)
   */
  async getActiveProviderConfig(): Promise<{ provider: string; apiKey: string; model: string } | null> {
    return withConnection(async (conn) => {
      const res = await conn.execute(
        `SELECT PROVIDER_ID, API_KEY, MODEL_NAME 
         FROM LLM_CONFIG 
         WHERE IS_ACTIVE = 'Y' AND API_KEY IS NOT NULL
         FETCH FIRST 1 ROW ONLY`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const row = (res.rows as any[])?.[0];
      if (!row || !row.API_KEY) return null;

      return {
        provider: row.PROVIDER_ID,
        apiKey: row.API_KEY,
        model: row.MODEL_NAME || 'gpt-4o'
      };
    });
  }

  /**
   * Update an LLM configuration
   */
  async updateConfig(config: Partial<LLMConfig> & { providerId: string }): Promise<void> {
    return withConnection(async (conn) => {
      // 1. If this provider is being set to active, deactivate others
      if (config.isActive === true) {
        await conn.execute(
          `UPDATE LLM_CONFIG SET IS_ACTIVE = 'N' WHERE PROVIDER_ID != :pid`,
          { pid: config.providerId }
        );
      }

      // 2. Build dynamic update
      const updates = [];
      const binds: any = { pid: config.providerId };

      if (config.isActive !== undefined) {
        updates.push(`IS_ACTIVE = :active`);
        binds.active = config.isActive ? 'Y' : 'N';
      }
      if (config.apiKey !== undefined && !config.apiKey.includes('****')) {
        updates.push(`API_KEY = :key`);
        binds.key = config.apiKey;
      }
      if (config.modelName !== undefined) {
        updates.push(`MODEL_NAME = :model`);
        binds.model = config.modelName;
      }
      if (config.temperature !== undefined) {
        updates.push(`TEMPERATURE = :temp`);
        binds.temp = config.temperature;
      }
      if (config.maxTokens !== undefined) {
        updates.push(`MAX_TOKENS = :tokens`);
        binds.tokens = config.maxTokens;
      }

      if (updates.length > 0) {
        const sql = `UPDATE LLM_CONFIG SET ${updates.join(', ')}, MODIFIED_AT = CURRENT_TIMESTAMP WHERE PROVIDER_ID = :pid`;
        await conn.execute(sql, binds);
      }

      await conn.commit();
      logger.info(`LLM configuration updated for ${config.providerId}`);
    });
  }

  /**
   * Get active LLM configuration with full API key
   */
  async getActiveConfigInternal(): Promise<any> {
    return withConnection(async (conn) => {
      const res = await conn.execute(
        `SELECT PROVIDER_ID, API_KEY, MODEL_NAME, TEMPERATURE, MAX_TOKENS 
         FROM LLM_CONFIG 
         WHERE IS_ACTIVE = 'Y' AND ROWNUM = 1`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      return (res.rows as any[])[0];
    });
  }

  /**
   * Get gateway routing rule for a specific task (v8.0)
   */
  async getRoutingRule(tenantId: string, taskType: string): Promise<any> {
    return withConnection(async (conn) => {
      const res = await conn.execute(
        `SELECT PRIMARY_PROVIDER, FALLBACK_PROVIDER, CONFIDENCE_GATE 
         FROM LLM_GATEWAY_RULES 
         WHERE (TENANT_ID = :tenant OR TENANT_ID = 'DEFAULT') 
           AND TASK_TYPE = :task 
           AND IS_ACTIVE = 'Y'
         ORDER BY CASE WHEN TENANT_ID = :tenant THEN 1 ELSE 2 END
         FETCH FIRST 1 ROWS ONLY`,
        { tenant: tenantId, task: taskType },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return (res.rows as any[])[0];
    });
  }

  /**
   * Get provider credentials (v8.0)
   */
  async getProviderConfig(providerId: string): Promise<any> {
    return withConnection(async (conn) => {
      const res = await conn.execute(
        `SELECT API_KEY, MODEL_NAME, TEMPERATURE FROM LLM_CONFIG WHERE PROVIDER_ID = :pid`,
        { pid: providerId.toLowerCase() },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return (res.rows as any[])[0];
    });
  }

  /**
   * Get batch processing configuration (v8.4)
   * Uses cache to avoid DB round-trip on every batch
   */
  async getBatchConfig(): Promise<BatchConfig> {
    // Return cached value if fresh
    if (batchConfigCache && Date.now() - batchConfigCacheTime < BATCH_CONFIG_CACHE_TTL_MS) {
      return batchConfigCache;
    }

    try {
      const config = await withConnection(async (conn) => {
        const res = await conn.execute(
          `SELECT SETTING_KEY, SETTING_VALUE 
           FROM APP_SETTINGS 
           WHERE SETTING_GROUP = 'BATCH_PROCESSING'`,
          [],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const settings: Record<string, string> = {};
        for (const row of (res.rows as any[])) {
          settings[row.SETTING_KEY] = row.SETTING_VALUE;
        }
        return settings;
      });

      batchConfigCache = {
        maxConcurrentRequests: parseInt(config['MAX_CONCURRENT_REQUESTS'] || '5', 10),
        batchChunkSize: parseInt(config['BATCH_CHUNK_SIZE'] || '50', 10),
        requestTimeoutMs: parseInt(config['REQUEST_TIMEOUT_MS'] || '30000', 10),
        retryAttempts: parseInt(config['RETRY_ATTEMPTS'] || '2', 10)
      };
      batchConfigCacheTime = Date.now();

      return batchConfigCache;
    } catch (e: any) {
      // If table doesn't exist, return defaults
      logger.warn('Failed to load batch config, using defaults', { error: e.message });
      return {
        maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_LLM_REQUESTS || '5', 10),
        batchChunkSize: parseInt(process.env.BATCH_CHUNK_SIZE || '50', 10),
        requestTimeoutMs: 30000,
        retryAttempts: 2
      };
    }
  }

  /**
   * Update batch processing configuration (v8.4)
   */
  async updateBatchConfig(updates: Partial<BatchConfig>): Promise<void> {
    const mapping: Record<keyof BatchConfig, string> = {
      maxConcurrentRequests: 'MAX_CONCURRENT_REQUESTS',
      batchChunkSize: 'BATCH_CHUNK_SIZE',
      requestTimeoutMs: 'REQUEST_TIMEOUT_MS',
      retryAttempts: 'RETRY_ATTEMPTS'
    };

    await withConnection(async (conn) => {
      for (const [jsKey, dbKey] of Object.entries(mapping)) {
        const value = updates[jsKey as keyof BatchConfig];
        if (value !== undefined) {
          // MERGE/UPSERT pattern (use skey to avoid Oracle reserved word 'key')
          await conn.execute(
            `MERGE INTO APP_SETTINGS t
             USING (SELECT 'BATCH_PROCESSING' as SG, :skey as SK FROM DUAL) s
             ON (t.SETTING_GROUP = s.SG AND t.SETTING_KEY = s.SK)
             WHEN MATCHED THEN UPDATE SET SETTING_VALUE = :val, MODIFIED_AT = CURRENT_TIMESTAMP
             WHEN NOT MATCHED THEN INSERT (SETTING_GROUP, SETTING_KEY, SETTING_VALUE, CREATED_AT) 
                                   VALUES (s.SG, s.SK, :val, CURRENT_TIMESTAMP)`,
            { skey: dbKey, val: String(value) }
          );
        }
      }
      await conn.commit();
    });

    // Invalidate cache
    batchConfigCache = null;
    logger.info('Batch configuration updated', { updates });
  }

  /**
   * Invalidate the batch config cache (call when env changes)
   */
  invalidateBatchConfigCache(): void {
    batchConfigCache = null;
  }
}

export const llmConfigService = new LLMConfigService();

