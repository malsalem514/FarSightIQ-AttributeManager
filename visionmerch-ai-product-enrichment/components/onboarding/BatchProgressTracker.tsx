/**
 * BatchProgressTracker - Real-time batch upload progress
 * 
 * Features:
 * - Live progress bar
 * - Per-image status
 * - Error display
 * - Auto-refresh
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Loader2, CheckCircle2, XCircle, Clock, Image, 
  RefreshCw, AlertCircle, Sparkles, ArrowRight, X
} from 'lucide-react';
import { Button } from '../shared/UI';
import { API_BASE_URL } from '../../src/api/config';

interface BatchItem {
  fileName: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
  result?: {
    sessionId: number;
    predictedDept?: string;
    predictedClass?: string;
    confidence?: number;
  };
}

interface BatchStatus {
  batchId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalFiles: number;
  processedFiles: number;
  successCount: number;
  errorCount: number;
  startedAt?: string;
  completedAt?: string;
  items?: BatchItem[];
}

interface BatchProgressTrackerProps {
  batchId: string;
  onComplete?: (batch: BatchStatus) => void;
  onClose?: () => void;
}

const MAX_PROCESSING_TIME_MS = 5 * 60 * 1000; // 5 minutes timeout warning

export const BatchProgressTracker: React.FC<BatchProgressTrackerProps> = ({
  batchId,
  onComplete,
  onClose
}) => {
  const [batch, setBatch] = useState<BatchStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [pollCount, setPollCount] = useState(0);
  const [isStuck, setIsStuck] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/products/onboard/batch/${batchId}`);
      const data = await response.json();
      
      if (data.success) {
        // Normalize status from API (handles lowercase from DB)
        const normalizedStatus = (data.data.STATUS || data.data.status || 'PENDING').toUpperCase();
        const batchData: BatchStatus = {
          batchId: data.data.BATCH_ID || data.data.batchId || batchId,
          status: normalizedStatus as BatchStatus['status'],
          totalFiles: data.data.TOTAL_IMAGES || data.data.totalFiles || 0,
          processedFiles: data.data.PROCESSED_COUNT || data.data.processedFiles || 0,
          successCount: data.data.SUCCESS_COUNT || data.data.successCount || 0,
          errorCount: data.data.ERROR_COUNT || data.data.errorCount || 0,
          startedAt: data.data.STARTED_AT || data.data.startedAt,
          completedAt: data.data.COMPLETED_AT || data.data.completedAt,
          items: data.data.errors?.map((e: any) => ({
            fileName: e.IMAGE_NAME || e.imageName || 'Unknown',
            status: 'error' as const,
            error: e.ERROR_MESSAGE || e.errorMessage || 'Unknown error'
          })) || []
        };
        
        setBatch(batchData);
        
        // Stop auto-refresh when complete or failed
        if (normalizedStatus === 'COMPLETED' || normalizedStatus === 'FAILED') {
          setAutoRefresh(false);
          onComplete?.(batchData);
        }
      } else {
        setError(data.error?.message || 'Failed to fetch status');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch status');
    }
    setIsLoading(false);
  }, [batchId, onComplete]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-refresh while processing (with timeout detection)
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      setPollCount(prev => prev + 1);
      fetchStatus();
    }, 2000); // Every 2 seconds
    
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStatus]);

  // Detect if batch is stuck (> 5 min in PROCESSING)
  useEffect(() => {
    if (batch?.status === 'PROCESSING' && batch.startedAt) {
      const elapsed = Date.now() - new Date(batch.startedAt).getTime();
      if (elapsed > MAX_PROCESSING_TIME_MS && !isStuck) {
        setIsStuck(true);
      }
    }
  }, [batch, isStuck]);

  const getProgressPct = () => {
    if (!batch || batch.totalFiles === 0) return 0;
    return Math.round((batch.processedFiles / batch.totalFiles) * 100);
  };

  const getStatusColor = () => {
    if (!batch) return 'gray';
    switch (batch.status) {
      case 'COMPLETED': return 'emerald';
      case 'FAILED': return 'rose';
      case 'PROCESSING': return 'purple';
      default: return 'gray';
    }
  };

  const getStatusIcon = () => {
    if (!batch) return <Clock size={16} />;
    switch (batch.status) {
      case 'COMPLETED': return <CheckCircle2 size={16} className="text-emerald-500" />;
      case 'FAILED': return <XCircle size={16} className="text-rose-500" />;
      case 'PROCESSING': return <Loader2 size={16} className="text-purple-500 animate-spin" />;
      default: return <Clock size={16} className="text-gray-400" />;
    }
  };

  const getElapsedTime = () => {
    if (!batch?.startedAt) return '';
    const start = new Date(batch.startedAt).getTime();
    const end = batch.completedAt ? new Date(batch.completedAt).getTime() : Date.now();
    const seconds = Math.round((end - start) / 1000);
    
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSecs = seconds % 60;
    return `${minutes}m ${remainingSecs}s`;
  };

  if (isLoading && !batch) {
    return (
      <div className="p-8 text-center">
        <Loader2 size={32} className="text-purple-500 animate-spin mx-auto mb-4" />
        <p className="text-sm text-gray-500">Loading batch status...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              Batch #{batchId}
            </h3>
            <p className="text-xs text-gray-500">
              {batch?.status || 'Unknown'} • {getElapsedTime()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setAutoRefresh(true); fetchStatus(); }}
            disabled={autoRefresh}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={16} className={autoRefresh ? 'animate-spin' : ''} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
              title="Close"
            >
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            {batch?.processedFiles || 0} / {batch?.totalFiles || 0} images
          </span>
          <span className={`text-sm font-bold text-${getStatusColor()}-600`}>
            {getProgressPct()}%
          </span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div 
            className={`h-full bg-${getStatusColor()}-500 rounded-full transition-all duration-500 ease-out`}
            style={{ width: `${getProgressPct()}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-3 bg-gray-50 rounded-xl text-center">
          <p className="text-2xl font-bold text-gray-900">{batch?.totalFiles || 0}</p>
          <p className="text-[10px] font-bold text-gray-500 uppercase">Total</p>
        </div>
        <div className="p-3 bg-emerald-50 rounded-xl text-center">
          <p className="text-2xl font-bold text-emerald-600">{batch?.successCount || 0}</p>
          <p className="text-[10px] font-bold text-emerald-700 uppercase">Success</p>
        </div>
        <div className="p-3 bg-rose-50 rounded-xl text-center">
          <p className="text-2xl font-bold text-rose-600">{batch?.errorCount || 0}</p>
          <p className="text-[10px] font-bold text-rose-700 uppercase">Errors</p>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-3">
          <AlertCircle size={18} className="text-rose-500 flex-shrink-0" />
          <p className="text-sm text-rose-700">{error}</p>
        </div>
      )}

      {/* Processing Animation */}
      {batch?.status === 'PROCESSING' && (
        <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
              <Sparkles size={20} className="text-purple-600 animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-bold text-purple-700">AI Discovery in Progress</p>
              <p className="text-xs text-purple-600">
                Analyzing images, identifying product hierarchy, and extracting attributes...
              </p>
              <p className="text-[10px] text-purple-500 mt-1">
                Poll #{pollCount} • Elapsed: {getElapsedTime()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stuck Warning */}
      {isStuck && batch?.status === 'PROCESSING' && (
        <div className="mb-6 p-4 bg-amber-50 rounded-xl border border-amber-200">
          <div className="flex items-center gap-3">
            <AlertCircle size={20} className="text-amber-600" />
            <div>
              <p className="text-sm font-bold text-amber-700">Processing Taking Longer Than Expected</p>
              <p className="text-xs text-amber-600">
                The batch has been processing for over 5 minutes. This may be due to large images or API delays.
                You can close this dialog and check back later—the batch will continue processing in the background.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="mt-3 text-xs font-bold text-amber-700 hover:text-amber-800 underline"
          >
            Close & Check Back Later
          </button>
        </div>
      )}

      {/* Completed Summary */}
      {batch?.status === 'COMPLETED' && (
        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={24} className="text-emerald-500" />
            <div>
              <p className="text-sm font-bold text-emerald-700">Batch Complete!</p>
              <p className="text-xs text-emerald-600">
                {batch.successCount} products ready for review. {batch.errorCount > 0 ? `${batch.errorCount} failed.` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="mt-4 w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors"
          >
            View Drafts
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Failed Summary */}
      {batch?.status === 'FAILED' && (
        <div className="p-4 bg-rose-50 rounded-xl border border-rose-100">
          <div className="flex items-center gap-3">
            <XCircle size={24} className="text-rose-500" />
            <div>
              <p className="text-sm font-bold text-rose-700">Batch Failed</p>
              <p className="text-xs text-rose-600">
                {batch.errorCount} errors. {batch.successCount > 0 ? `${batch.successCount} succeeded.` : 'No products processed.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="mt-4 w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors"
          >
            Close & Review Errors
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Error List from Batch */}
      {batch?.items && batch.items.filter(i => i.status === 'error').length > 0 && (
        <div className="mt-4 p-4 bg-rose-50/50 rounded-xl border border-rose-100">
          <h4 className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertCircle size={14} />
            Error Details
          </h4>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {batch.items.filter(i => i.status === 'error').map((item, idx) => (
              <div key={idx} className="p-2 bg-white rounded-lg border border-rose-100 text-xs">
                <p className="font-medium text-rose-800">{item.fileName}</p>
                <p className="text-rose-600 mt-1">{item.error}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Item List (optional, for debugging) */}
      {batch?.items && batch.items.length > 0 && (
        <div className="mt-6 border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              Processing Details
            </span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {batch.items.map((item, idx) => (
              <div key={idx} className="px-4 py-2 border-b border-gray-50 last:border-0 flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Image size={14} className="text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700 truncate">{item.fileName}</p>
                  {item.result?.predictedDept && (
                    <p className="text-[10px] text-gray-500">
                      {item.result.predictedDept} → {item.result.predictedClass}
                    </p>
                  )}
                  {item.error && (
                    <p className="text-[10px] text-rose-500 truncate">{item.error}</p>
                  )}
                </div>
                <div>
                  {item.status === 'pending' && <Clock size={14} className="text-gray-300" />}
                  {item.status === 'processing' && <Loader2 size={14} className="text-purple-500 animate-spin" />}
                  {item.status === 'success' && <CheckCircle2 size={14} className="text-emerald-500" />}
                  {item.status === 'error' && <XCircle size={14} className="text-rose-500" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchProgressTracker;
