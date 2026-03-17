/**
 * Settings Service
 * 
 * Manages application-wide settings: database connections, operational modes,
 * and background resync processes.
 */

import fs from 'fs/promises';
import path from 'path';
import oracledb from 'oracledb';
import { createPool, withConnection } from './oracle-pool.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

export type AppMode = 'READ_ONLY' | 'READ_WRITE_IRI';

export interface DatabaseConfig {
  name: string;
  user: string;
  connectString: string;
  isRemote?: boolean;
}

export interface AppSettings {
  db: {
    user: string;
    connectString: string;
  };
  remoteDb: {
    user: string;
    connectString: string;
  };
  savedDatabases: DatabaseConfig[];
  environments?: Array<{ id: string; name: string; link: string; isActive: boolean; env_type: 'DEV' | 'QA' | 'PROD'; lastSwitched?: string }>;
  mode: AppMode;
  lastResync?: string;
}

const SETTINGS_FILE = path.join(process.cwd(), 'app-settings.json');

export class SettingsService {
  private static instance: SettingsService;
  private settings: AppSettings;
  private cachedTenantId: string | null = null;
  private lastTenantCheck: number = 0;

  private constructor() {
    this.settings = {
      db: {
        user: config.oracle.user,
        connectString: config.oracle.connectString
      },
      remoteDb: {
        user: '', 
        connectString: ''
      },
      savedDatabases: [
        { name: 'Local Instance', user: config.oracle.user, connectString: config.oracle.connectString, isRemote: false }
      ],
      mode: 'READ_WRITE_IRI'
    };
  }

  public static async getInstance(): Promise<SettingsService> {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService();
      await SettingsService.instance.load();
    }
    return SettingsService.instance;
  }

  /**
   * Ensure the active environment is correctly linked on startup
   */
  public async initialize(): Promise<void> {
    try {
      const environments = await this.getEnvironments();
      const active = environments.find(e => e.isActive);
      
      if (active) {
        logger.info(`Initializing active environment link for ${active.id}...`);
        await withConnection(async (conn) => {
          // Repoint synonyms to ensure consistency
          await conn.execute(
            `BEGIN ENV_SWITCHER_PKG.repoint_synonyms(:link); END;`,
            { link: active.link }
          );
          
          // Verify connection
          try {
            await conn.execute(`SELECT 1 FROM STYLES WHERE ROWNUM = 1`);
            logger.info(`Startup verification successful for ${active.id}`);
          } catch (e: any) {
            logger.warn(`Startup verification failed for ${active.id}: ${e.message}. System Link may need manual re-establishment.`);
          }
        });
      }
    } catch (e: any) {
      logger.error('Failed to initialize settings service', { error: e.message });
    }
  }

  private async load() {
    try {
      const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
      const loaded = JSON.parse(data);
      this.settings = { ...this.settings, ...loaded };
      logger.info('Settings loaded from file', { mode: this.settings.mode });
    } catch (e) {
      logger.info('No settings file found, using defaults');
    }
  }

  private async save() {
    try {
      await fs.writeFile(SETTINGS_FILE, JSON.stringify(this.settings, null, 2));
    } catch (e) {
      logger.error('Failed to save settings', { error: (e as Error).message });
    }
  }

  public getSettings(): AppSettings {
    return { ...this.settings };
  }

  /**
   * Get all registered ERP environments
   */
  public async getEnvironments() {
    return withConnection(async (conn) => {
      const res = await conn.execute(
        `SELECT env_id, env_name, db_link_name, is_active, env_type, image_base_url,
                TO_CHAR(last_switched_at, 'YYYY-MM-DD"T"HH24:MI:SS') as last_switched
         FROM APP_ENVIRONMENTS ORDER BY env_id`
      );
      return (res.rows as any[] || []).map(r => ({
        id: r.ENV_ID || r[0],
        name: r.ENV_NAME || r[1],
        link: r.DB_LINK_NAME || r[2],
        isActive: (r.IS_ACTIVE || r[3]) === 'Y',
        env_type: r.ENV_TYPE || r[4],
        image_base_url: r.IMAGE_BASE_URL || r[5],
        lastSwitched: r.LAST_SWITCHED || r[6]
      }));
    });
  }

  /**
   * Atomic switch to a new ERP environment
   */
  public async switchEnvironment(envId: string, username: string = 'ADMIN') {
    logger.info(`Switching environment to ${envId}...`);
    
    return withConnection(async (conn) => {
      // 1. Check environment type
      const envRes = await conn.execute(
        `SELECT env_type FROM APP_ENVIRONMENTS WHERE env_id = :envId`, 
        { envId }
      );
      const rows = envRes.rows as any[];
      const envType = rows?.[0]?.[0] || rows?.[0]?.ENV_TYPE;

      // 2. Call PL/SQL Switcher
      const result = await conn.execute(
        `BEGIN 
          ENV_SWITCHER_PKG.switch_environment(
            p_env_id => :envId,
            p_username => :user,
            p_status => :status,
            p_error_message => :error
          );
        END;`,
        {
          envId,
          user: username,
          status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
          error: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 1000 }
        }
      );

      const status = (result.outBinds as any).status;
      const error = (result.outBinds as any).error;

      if (status === 'ERROR') {
        throw new Error(error || 'Switch failed in PL/SQL');
      }

      // 3. Verify Connection (PAT-ORACLE-PRODUCTION-GRADE-SQL-01)
      try {
        // We query STYLES (which is a synonym to the remote table)
        // This is the "Truth Check" - if this fails, the switch is effectively useless
        const verifyRes = await conn.execute(`SELECT 1 as verified FROM STYLES WHERE ROWNUM = 1`);
        logger.info(`Connection verified for ${envId}. Remote style accessibility confirmed.`);
      } catch (connErr: any) {
        logger.error(`Switch succeeded at PL/SQL level but connection failed verification for ${envId}`, { error: connErr.message });
        throw new Error(`[VERIFICATION_FAILED]: Connected to ${envId} but Merch ERP data is inaccessible. Error: ${connErr.message}. Check VPN or DB Link credentials.`);
      }

      logger.info(`Environment switched successfully to ${envId}`);
      this.cachedTenantId = envId;
      this.lastTenantCheck = Date.now();
      
      // Auto-enforce READ_ONLY for Production
      if (envType === 'PROD') {
        await this.updateMode('READ_ONLY');
        logger.warn(`Production environment ${envId} active. READ_ONLY mode enforced.`);
      }

      // Auto-trigger resync for the new environment
      // We wait for resync and if it fails, we throw to the UI
      try {
        const syncRes = await this.triggerResync();
        return { success: true, syncStats: syncRes.stats };
      } catch (e: any) {
        logger.error('Initial resync after switch failed', { error: e.message });
        throw new Error(`Environment switched but data synchronization failed: ${e.message}`);
      }
    });
  }

  /**
   * Check if write operations are allowed
   */
  public isWriteAllowed(): boolean {
    return this.settings.mode === 'READ_WRITE_IRI';
  }

  /**
   * Update database connection and reconnect the pool
   */
  public async updateDatabase(dbConfig: { user: string; password?: string; connectString: string }) {
    logger.info('Updating database connection...', { user: dbConfig.user, connectString: dbConfig.connectString });
    
    // Attempt to recreate pool with new credentials
    await createPool({
      user: dbConfig.user,
      password: dbConfig.password || config.oracle.password,
      connectString: dbConfig.connectString
    });

    // If successful, update internal state and save
    this.settings.db.user = dbConfig.user;
    this.settings.db.connectString = dbConfig.connectString;
    await this.save();
    
    logger.info('Local database connection updated.');
  }

  /**
   * Add or update a database in the saved list
   */
  public async saveDatabaseToList(db: DatabaseConfig) {
    if (!this.settings.savedDatabases) {
      this.settings.savedDatabases = [];
    }
    const index = this.settings.savedDatabases.findIndex(d => d.name === db.name || d.connectString === db.connectString);
    if (index >= 0) {
      this.settings.savedDatabases[index] = { ...this.settings.savedDatabases[index], ...db };
    } else {
      this.settings.savedDatabases.push(db);
    }
    await this.save();
    logger.info('Database configuration saved to list', { name: db.name });
  }

  /**
   * Update the MERCH_REMOTE database link
   */
  public async updateRemoteDatabase(remoteConfig: { user: string; password?: string; connectString: string }) {
    logger.info('Updating MERCH_REMOTE DB Link...', { user: remoteConfig.user, connectString: remoteConfig.connectString });

    if (!remoteConfig.password) {
      throw new Error('Password is required to create a database link');
    }

    await withConnection(async (conn) => {
      // 1. Drop existing link if it exists
      try {
        await conn.execute(`DROP DATABASE LINK MERCH_REMOTE`);
        logger.info('Existing MERCH_REMOTE DB Link dropped.');
      } catch (e: any) {
        // ORA-02024: database link not found
        if (e.errorNum !== 2024) {
          logger.warn('Error dropping DB link', { error: e.message });
        }
      }

      // 2. Create new link
      // We use double quotes for password to handle special characters
      const sql = `CREATE DATABASE LINK MERCH_REMOTE CONNECT TO ${remoteConfig.user} IDENTIFIED BY "${remoteConfig.password}" USING '${remoteConfig.connectString}'`;
      
      await conn.execute(sql);
      logger.info('New MERCH_REMOTE DB Link created successfully.');
    });

    // Update internal state
    this.settings.remoteDb.user = remoteConfig.user;
    this.settings.remoteDb.connectString = remoteConfig.connectString;
    await this.save();

    // Automatically trigger full resync on new database connection
    await this.triggerResync(); 
  }

  /**
   * Update application mode
   */
  public async updateMode(mode: AppMode) {
    this.settings.mode = mode;
    await this.save();
    logger.info('Application mode updated', { mode });
  }

  /**
   * Get the active tenant ID (Environment ID)
   * Cached for 30 seconds to prevent connection pool exhaustion during image floods
   */
  public async getActiveTenantId(): Promise<string> {
    const now = Date.now();
    if (this.cachedTenantId && (now - this.lastTenantCheck < 30000)) {
      return this.cachedTenantId;
    }

    return withConnection(async (conn) => {
      const res = await conn.execute(
        `SELECT env_id FROM APP_ENVIRONMENTS WHERE is_active = 'Y' AND ROWNUM = 1`
      );
      const tenantId = (res.rows?.[0] as any)?.[0] || (res.rows?.[0] as any)?.ENV_ID || 'DEV';
      
      this.cachedTenantId = tenantId;
      this.lastTenantCheck = now;
      return tenantId;
    });
  }

  /**
   * Get full tenant configuration including display name
   * Used for dynamic prompts and branding
   */
  public async getActiveTenantConfig(): Promise<{
    id: string;
    name: string;
    type: 'DEV' | 'QA' | 'PROD';
    domain?: string;
  }> {
    return withConnection(async (conn) => {
      const res = await conn.execute(
        `SELECT env_id, env_name, env_type FROM APP_ENVIRONMENTS WHERE is_active = 'Y' AND ROWNUM = 1`,
        {},
        { outFormat: 4002 } // OBJECT format
      );
      const row = res.rows?.[0] as any;
      
      if (!row) {
        return { id: 'DEV', name: 'Development', type: 'DEV' as const };
      }

      // Infer domain from environment name/id
      const name = row.ENV_NAME || row.env_name || row[1] || 'Retailer';
      const id = row.ENV_ID || row.env_id || row[0] || 'DEV';
      const type = (row.ENV_TYPE || row.env_type || row[2] || 'DEV') as 'DEV' | 'QA' | 'PROD';
      
      // Infer retail domain from name
      let domain = 'fashion retail';
      const nameLower = name.toLowerCase();
      if (nameLower.includes('sport') || nameLower.includes('jd ')) {
        domain = 'sports fashion and athletic apparel';
      } else if (nameLower.includes('hibbett') || nameLower.includes('hri')) {
        domain = 'athletic footwear and sports apparel';
      } else if (nameLower.includes('oci') || nameLower.includes('demo')) {
        domain = 'multi-category retail';
      }
      
      return { id, name, type, domain };
    });
  }

  /**
   * Update the image base URL for an environment
   */
  public async updateImageBaseUrl(envId: string, imageUrl: string) {
    logger.info(`Updating image base URL for ${envId} to ${imageUrl}...`);
    
    return withConnection(async (conn) => {
      await conn.execute(
        `UPDATE APP_ENVIRONMENTS SET image_base_url = :imageUrl WHERE env_id = :envId`,
        { imageUrl, envId }
      );
      await conn.commit();
      
      // Auto-trigger a media refresh to bake new URLs into the JSON
      // We do this in the background to avoid blocking the UI
      this.getEnvironments().then(envs => {
        const env = envs.find(e => e.id === envId);
        if (env && env.isActive) {
          logger.info(`Active environment image server updated. Triggering media refresh...`);
          // We call REFRESH_CATALOG_MEDIA for the default BU
          withConnection(conn => conn.execute(
            `BEGIN ATTR_MGR.REFRESH_CATALOG_MEDIA(:tenant, :bu); END;`,
            { tenant: envId, bu: 1 }
          )).catch(err => logger.error('Background media refresh failed', { error: err.message }));
        }
      });

      return { success: true };
    });
  }

  /**
   * Trigger a full resync of local caches
   * Returns metadata about the sync operation
   */
  public async triggerResync(buId?: number, forceFull: boolean = false) {
    const tenantId = await this.getActiveTenantId();
    const mode = forceFull ? 'FULL' : 'DELTA';
    logger.info(`Starting multi-tenant resync for tenant ${tenantId} (Mode: ${mode})...`);
    const stats = {
      busProcessed: 0,
      totalStylesSynced: 0,
      errors: [] as string[]
    };
    
    try {
      return await withConnection(async (conn) => {
        // ... identify BUs ...
        let buIds = buId ? [buId] : [];
        
        if (buIds.length === 0) {
          logger.info(`Identifying available business units for tenant ${tenantId}...`);
          try {
            // Try BUSINESS_UNITS synonym first (much faster)
            let buRes;
            try {
              buRes = await conn.execute(`SELECT BUSINESS_UNIT_ID FROM BUSINESS_UNITS`);
              logger.info(`Found business units via BUSINESS_UNITS synonym.`);
            } catch (e) {
              // Fallback to STYLES scan
              logger.warn(`BUSINESS_UNITS synonym failed or empty. Falling back to STYLES scan...`);
              buRes = await conn.execute(`SELECT DISTINCT BUSINESS_UNIT_ID FROM STYLES`);
            }
            
            buIds = (buRes.rows as any[] || []).map(r => {
              const val = r.BUSINESS_UNIT_ID || r.business_unit_id || r.BUSINESS_UNIT || r[0];
              return typeof val === 'number' ? val : parseInt(val, 10);
            }).filter(id => !isNaN(id));
          } catch (e: any) {
            throw new Error(`[SYNC_FAILED]: Failed to query remote business units. Check DB Link and permissions. Details: ${e.message}`);
          }
          
          if (buIds.length === 0) {
            throw new Error(`[SYNC_FAILED]: No business units found in remote system.`);
          }
          logger.info(`Found ${buIds.length} business units to sync: ${buIds.join(', ')}`);
        }

        // 3. Sync each BU
        for (const id of buIds) {
          try {
            logger.info(`Syncing BU ${id} for tenant ${tenantId} (Mode: ${mode})...`);
            // Sync Hierarchy Cache (Multi-tenant procedure)
            await conn.execute(`BEGIN SYNC_HIERARCHY_CACHE(:tenant, :id); END;`, { tenant: tenantId, id });
            // Refresh Catalog Cache (Multi-tenant procedure with Mode)
            await conn.execute(`BEGIN REFRESH_CATALOG_CACHE(:tenant, :id, :mode); END;`, { tenant: tenantId, id, mode });
            
            // Check count for this BU/Tenant
            const countRes = await conn.execute(
              `SELECT COUNT(*) as cnt FROM CATALOG_CACHE_SHADOW WHERE TENANT_ID = :tenant AND BUSINESS_UNIT_ID = :id`, 
              { tenant: tenantId, id }
            );
            const count = (countRes.rows?.[0] as any)?.CNT || (countRes.rows?.[0] as any)?.[0] || 0;
            
            stats.busProcessed++;
            stats.totalStylesSynced += count;
            logger.info(`Successfully synced BU ${id} for tenant ${tenantId} (${count} styles)`);
          } catch (buError: any) {
            const msg = `Failed to sync BU ${id} for tenant ${tenantId}: ${buError.message}`;
            logger.error(msg);
            stats.errors.push(msg);
          }
        }
        
        await conn.commit();
        
        // We no longer throw if 0 styles imported, as DELTA might be empty
        if (stats.totalStylesSynced === 0 && mode === 'FULL') {
          throw new Error(`[SYNC_FAILED]: Full resync completed but 0 styles were imported for tenant ${tenantId}.`);
        }

        this.settings.lastResync = new Date().toISOString();
        await this.save();
        logger.info(`Resync completed successfully for tenant ${tenantId} (${mode})`, stats);
        return { success: true, stats };
      });
    } catch (error: any) {
      logger.error(`Resync failed for tenant ${tenantId}`, { error: error.message });
      throw error;
    }
  }
}
