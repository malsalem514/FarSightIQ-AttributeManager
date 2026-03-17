import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Database, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { fetchSyncProgress } from '../../src/api/client';

interface SyncProgress {
  TENANT_ID: string;
  BUSINESS_UNIT_ID: number;
  OP_NAME: string;
  STATUS: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PENDING';
  TOTAL_RECORDS: number;
  PROCESSED: number;
  PROGRESS_PCT: number;
  UPDATED: string;
  ERROR_MSG?: string;
  CURRENT_ITEM?: string;
}

/**
 * SyncProgressBanner - Enterprise Glass Box Monitor
 * 
 * Follows vanilla boring code standards with robust visibility management.
 * Disappears automatically when not needed, supports manual dismissal.
 */
export const SyncProgressBanner: React.FC = () => {
  const [activeSyncs, setActiveSyncs] = useState<SyncProgress[]>([]);
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to generate unique key for a sync task
  const getSyncId = (s: SyncProgress) => `${s.TENANT_ID}-${s.BUSINESS_UNIT_ID}-${s.OP_NAME}-${s.UPDATED}`;

  const fetchProgress = useCallback(async () => {
    try {
      const response = await fetchSyncProgress();
      if (response.success && response.data) {
        const syncs = response.data as SyncProgress[];
        const now = new Date();
        
        // Filter: Keep if RUNNING, or if COMPLETED/FAILED and recent, AND not acknowledged by user
        const relevant = syncs.filter(s => {
          const syncId = getSyncId(s);
          if (acknowledgedIds.has(syncId)) return false;

          if (s.STATUS === 'RUNNING') return true;
          
          const updated = new Date(s.UPDATED);
          const diffSeconds = (now.getTime() - updated.getTime()) / 1000;
          
          // COMPLETED: show for 15s | FAILED: show for 60s
          const maxAge = s.STATUS === 'FAILED' ? 60 : 15;
          return diffSeconds < maxAge;
        });

        setActiveSyncs(relevant);
      }
    } catch (e) {
      console.error('[SyncProgress] Polling error', e);
    }
  }, [acknowledgedIds]);

  // Adaptive polling: Faster when syncing, slower when idle
  useEffect(() => {
    fetchProgress();
    
    // Start with slower polling (10s), speed up if active sync detected
    const getPollInterval = () => {
      const hasActiveSync = activeSyncs.some(s => s.STATUS === 'RUNNING');
      return hasActiveSync ? 5000 : 15000; // 5s during sync, 15s when idle
    };
    
    const schedulePoll = () => {
      pollTimerRef.current = setTimeout(() => {
        fetchProgress();
        schedulePoll();
      }, getPollInterval());
    };
    
    schedulePoll();
    
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [fetchProgress, activeSyncs.length]);

  const handleDismiss = () => {
    // Add current syncs to acknowledged set so they disappear
    setAcknowledgedIds(prev => {
      const next = new Set(prev);
      activeSyncs.forEach(s => next.add(getSyncId(s)));
      return next;
    });
  };

  if (activeSyncs.length === 0) return null;

  const mainSync = activeSyncs.find(s => s.STATUS === 'RUNNING') || activeSyncs[0];
  const otherCount = activeSyncs.length - 1;

  return (
    <div 
      className="fixed bottom-6 right-6 z-50 transition-all duration-500 transform translate-y-0 opacity-100"
      data-testid="sync-progress-banner"
    >
      <div className={`bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ${isExpanded ? 'w-80' : 'w-72'}`}>
        
        {/* Header - Dynamically themed */}
        <div className={`px-4 py-3 flex items-center justify-between border-b border-gray-50 ${
          mainSync.STATUS === 'FAILED' ? 'bg-rose-50' : 
          mainSync.STATUS === 'COMPLETED' ? 'bg-emerald-50' : 'bg-indigo-50'
        }`}>
          <div className="flex items-center gap-2">
            {mainSync.STATUS === 'RUNNING' ? (
              <Loader2 size={16} className="text-indigo-600 animate-spin" />
            ) : mainSync.STATUS === 'COMPLETED' ? (
              <CheckCircle2 size={16} className="text-emerald-600" />
            ) : (
              <AlertCircle size={16} className="text-rose-600" />
            )}
            <span className={`text-[11px] font-bold uppercase tracking-wider ${
              mainSync.STATUS === 'FAILED' ? 'text-rose-700' : 
              mainSync.STATUS === 'COMPLETED' ? 'text-emerald-700' : 'text-indigo-700'
            }`}>
              {mainSync.STATUS === 'RUNNING' ? 'Syncing Catalog' : 
               mainSync.STATUS === 'COMPLETED' ? 'Sync Complete' : 'Sync Failed'}
            </span>
          </div>
          <button 
            onClick={handleDismiss} 
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-gray-50 flex items-center justify-center text-gray-400">
                <Database size={12} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase leading-none mb-1">{mainSync.TENANT_ID}</p>
                <p className="text-xs font-bold text-gray-700">Business Unit {mainSync.BUSINESS_UNIT_ID}</p>
              </div>
            </div>
            {mainSync.STATUS === 'RUNNING' && mainSync.TOTAL_RECORDS > 0 && (
              <span className="text-xs font-black text-gray-900 tabular-nums">{mainSync.PROGRESS_PCT || 0}%</span>
            )}
          </div>

          {/* Detailed Progress for Active Syncs */}
          {mainSync.STATUS === 'RUNNING' && mainSync.TOTAL_RECORDS > 0 && (
            <div className="mt-3 animate-in fade-in slide-in-from-top-1 duration-300">
              <p className="text-[10px] font-bold text-indigo-600 mb-1 animate-pulse truncate">
                {mainSync.CURRENT_ITEM || 'Processing style records...'}
              </p>
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-600 transition-all duration-1000 ease-out"
                  style={{ width: `${mainSync.PROGRESS_PCT || 0}%` }}
                />
              </div>
              <div className="flex justify-between mt-2">
                <p className="text-[10px] font-medium text-gray-500 tabular-nums">
                  {mainSync.PROCESSED.toLocaleString()} / {mainSync.TOTAL_RECORDS.toLocaleString()}
                </p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                  {mainSync.OP_NAME.replace('_', ' ')}
                </p>
              </div>
            </div>
          )}

          {/* Failure Feedback */}
          {mainSync.STATUS === 'FAILED' && mainSync.ERROR_MSG && (
            <div className="mt-3 p-2 bg-rose-50 rounded text-[10px] text-rose-700 font-medium break-words border border-rose-100 animate-in shake-in duration-300">
              {mainSync.ERROR_MSG}
            </div>
          )}

          {/* Expansion Toggle for Multiple Ops */}
          {otherCount > 0 && !isExpanded && (
            <button 
              onClick={() => setIsExpanded(true)}
              className="mt-3 w-full py-1 text-[9px] font-bold text-gray-400 uppercase border-t border-gray-50 hover:text-indigo-600 transition-colors"
            >
              +{otherCount} more operation{otherCount > 1 ? 's' : ''}
            </button>
          )}

          {/* Expanded View for Queue */}
          {isExpanded && activeSyncs.slice(1).map((sync, idx) => (
            <div key={idx} className="mt-3 pt-3 border-t border-gray-50 animate-in slide-in-from-top-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-gray-600">{sync.OP_NAME.replace('_', ' ')} (BU {sync.BUSINESS_UNIT_ID})</span>
                <span className={`text-[9px] font-black uppercase ${
                  sync.STATUS === 'COMPLETED' ? 'text-emerald-500' : 'text-gray-400'
                }`}>{sync.STATUS}</span>
              </div>
              <div className="w-full h-1 bg-gray-50 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${sync.STATUS === 'COMPLETED' ? 'bg-emerald-400' : 'bg-gray-300'}`} 
                  style={{ width: `${sync.PROGRESS_PCT || 100}%` }} 
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

