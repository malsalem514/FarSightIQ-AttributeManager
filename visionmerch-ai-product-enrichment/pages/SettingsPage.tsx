/**
 * SettingsPage - Admin Configuration
 * 
 * Manage database connections, operational modes, and cache resync.
 */

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  Image as ImageIcon,
  RefreshCw,
  Shield,
  Unplug
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Select } from '../components/shared/UI';
import { fetchAppSettings, fetchEnvironments, switchEnvironment, updateAppMode, triggerResync, updateImageServer } from '../src/api/client';

export const SettingsPage: React.FC<{ onHome?: () => void }> = () => {
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isEditingImageServer, setIsEditingImageServer] = useState(false);
  const [tempImageServer, setTempImageServer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [environments, setEnvironments] = useState<any[]>([]);
  const [selectedEnvId, setSelectedEnvId] = useState<string>('');
  const [isReadOnly, setIsReadOnly] = useState(true);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const [settingsRes, envsRes] = await Promise.all([
        fetchAppSettings(),
        fetchEnvironments()
      ]);
      
      if (envsRes.success && envsRes.data) {
        setEnvironments(envsRes.data);
        const active = envsRes.data.find((e: any) => e.isActive);
        if (active) {
          setSelectedEnvId(active.id);
          setTempImageServer(active.image_base_url || '');
          // If active is PROD, readOnly is enforced
          setIsReadOnly(active.env_type === 'PROD' || settingsRes.data?.mode === 'READ_ONLY');
        }
      }

      if (settingsRes.success && settingsRes.data) {
        setLastSync(settingsRes.data.lastResync || null);
      }
    } catch (err: any) {
      setError('Failed to initialize system settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSettings(); }, []);

  const selectedEnv = environments.find(e => e.id === selectedEnvId);
  const isProd = selectedEnv?.env_type === 'PROD';

  // Update tempImageServer when environment selection changes
  useEffect(() => {
    if (selectedEnv) {
      setTempImageServer(selectedEnv.image_base_url || '');
      setIsEditingImageServer(false);
    }
  }, [selectedEnvId]);

  // Auto-set read only for production
  useEffect(() => {
    if (isProd) setIsReadOnly(true);
  }, [isProd]);

  const handleSaveImageServer = async () => {
    if (!selectedEnvId) return;
    setProcessing(true);
    try {
      const res = await updateImageServer(selectedEnvId, tempImageServer);
      if (res.success) {
        setSuccess('Image server updated. Background refresh started.');
        setIsEditingImageServer(false);
        await loadSettings();
      } else {
        throw new Error(res.error?.message || 'Failed to update image server');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleConnectAndSync = async () => {
    if (!selectedEnvId) return;
    
    setProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      // 1. Switch Mode if changed
      const targetMode = isReadOnly ? 'READ_ONLY' : 'READ_WRITE_IRI';
      await updateAppMode(targetMode);

      // 2. Switch Environment (Now includes Resync & Verification in Backend)
      const switchRes = await switchEnvironment(selectedEnvId);
      if (!switchRes.success) throw new Error(switchRes.error?.message || 'Switch failed');

      // 3. Success Verification (TDD: Trust but Verify)
      // The backend now returns sync stats if successful
      const stylesCount = switchRes.data?.syncStats?.totalStylesSynced || 0;
      setSuccess(`System successfully linked to ${selectedEnvId}. ${stylesCount} records verified and synchronized.`);
      
      window.dispatchEvent(new CustomEvent('musa:env-switched'));
      await loadSettings();
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#F9FAFB]">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="animate-spin text-indigo-600" size={40} strokeWidth={2.5} />
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Initializing System...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#F9FAFB] overflow-y-auto select-none">
      <div className="max-w-4xl mx-auto space-y-8 pt-4 pb-12">
        
        {/* Environment Link Section - LLM Settings moved to Admin → AI Providers */}
        <div className="w-full">
          {(
            /* Environment Link Card */
            <Card className="overflow-hidden border-none shadow-2xl shadow-indigo-100/50 rounded-[2.5rem] bg-white">
              <div className="p-10">
                
                {/* Minimalist Header */}
                <div className="flex items-center gap-4 mb-10">
                  <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                    <Database size={24} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight leading-none">Environment Link</h1>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1.5">System Configuration</p>
                  </div>
                </div>

                {/* Dropdown Section */}
                <div className="space-y-8">
                  <Select 
                    label="Target ERP System"
                    value={selectedEnvId}
                    onChange={(e) => setSelectedEnvId(e.target.value)}
                    disabled={processing}
                    className="h-16 pl-6 pr-12 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-3xl text-sm font-bold text-gray-900 outline-none transition-all appearance-none cursor-pointer disabled:opacity-50"
                    placeholder="Select Environment..."
                    options={environments.map(env => ({
                      value: env.id,
                      label: `${env.id} — ${env.name.split('(')[0].trim()}`
                    }))}
                  />
                    
                    <div className="mt-4 bg-gray-50/50 rounded-2xl p-4 border border-gray-100">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          <ImageIcon size={12} className="text-indigo-400" />
                          <span>Image Server Configuration</span>
                        </div>
                        {!isEditingImageServer ? (
                          <button 
                            onClick={() => setIsEditingImageServer(true)}
                            className="text-[9px] font-bold text-indigo-600 uppercase hover:text-indigo-700 transition-colors"
                          >
                            Edit URL
                          </button>
                        ) : (
                          <div className="flex gap-3">
                            <button 
                              onClick={handleSaveImageServer}
                              className="text-[9px] font-bold text-emerald-600 uppercase hover:text-emerald-700 transition-colors"
                            >
                              Save
                            </button>
                            <button 
                              onClick={() => {
                                setTempImageServer(selectedEnv?.image_base_url || '');
                                setIsEditingImageServer(false);
                              }}
                              className="text-[9px] font-bold text-gray-400 uppercase hover:text-gray-600 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                      
                      {isEditingImageServer ? (
                        <input 
                          type="text"
                          value={tempImageServer}
                          onChange={(e) => setTempImageServer(e.target.value)}
                          className="w-full h-10 px-4 bg-white border border-indigo-100 rounded-xl text-xs font-bold text-gray-700 focus:border-indigo-500 outline-none transition-all"
                          placeholder="http://server/images/"
                        />
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-gray-600 truncate mr-4">
                            {selectedEnv?.image_base_url || 'Not configured'}
                          </span>
                          {selectedEnv?.image_base_url && (
                            <div className="flex-shrink-0 px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[8px] font-black uppercase tracking-tighter">
                              Active
                            </div>
                          )}
                        </div>
                      )}
                      <p className="mt-2 text-[9px] text-gray-400 leading-relaxed italic">
                        All image URLs in the catalog are relative to this server.
                      </p>
                    </div>
                  </div>

                  {/* Read Only Toggle */}
                  <div 
                    onClick={() => !isProd && !processing && setIsReadOnly(!isReadOnly)}
                    className={`group flex items-center justify-between p-6 rounded-3xl border-2 transition-all cursor-pointer ${
                      isReadOnly 
                        ? 'bg-emerald-50/30 border-emerald-100' 
                        : 'bg-white border-gray-100 hover:border-indigo-100'
                    } ${isProd || processing ? 'cursor-not-allowed opacity-80' : ''}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                        isReadOnly ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'
                      }`}>
                        <Shield size={20} strokeWidth={2.5} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900 leading-none">Read-Only Protection</p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight mt-1">
                          {isProd ? 'Enforced for Production' : 'Prevent changes to Merch ERP'}
                        </p>
                      </div>
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                      isReadOnly ? 'bg-emerald-500 border-emerald-500' : 'border-gray-200 group-hover:border-indigo-200'
                    }`}>
                      {isReadOnly && <CheckCircle2 size={14} className="text-white" />}
                    </div>
                  </div>

                  {/* Status & Errors */}
                  {error && (
                    <div className="p-5 bg-rose-50 border border-rose-100 rounded-3xl flex gap-3 items-start animate-in zoom-in-95 duration-200">
                      <AlertCircle className="text-rose-500 flex-shrink-0 mt-0.5" size={18} />
                      <p className="text-xs text-rose-700 font-bold leading-relaxed">{error}</p>
                    </div>
                  )}
                  {success && (
                    <div className="p-5 bg-emerald-50 border border-emerald-100 rounded-3xl flex gap-3 items-start animate-in zoom-in-95 duration-200">
                      <CheckCircle2 className="text-emerald-500 flex-shrink-0 mt-0.5" size={18} />
                      <p className="text-xs text-emerald-700 font-bold leading-relaxed">{success}</p>
                    </div>
                  )}

                  {/* Unified Action Button */}
                  <div className="pt-4 space-y-4">
                    <button
                      onClick={handleConnectAndSync}
                      disabled={!selectedEnvId || processing}
                      className={`w-full h-20 rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] shadow-2xl transition-all flex items-center justify-center gap-4 ${
                        !selectedEnvId || processing
                          ? 'bg-gray-100 text-gray-300 shadow-none cursor-not-allowed'
                          : 'bg-indigo-600 text-white shadow-indigo-200 hover:bg-indigo-700 hover:-translate-y-1 active:translate-y-0'
                      }`}
                    >
                      {processing ? (
                        <>
                          <RefreshCw className="animate-spin" size={20} />
                          Connecting & Syncing...
                        </>
                      ) : (
                        <>
                          <Unplug size={20} />
                          Establish System Link
                        </>
                      )}
                    </button>

                    <div className="flex justify-center">
                      <button 
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="text-[9px] font-bold text-gray-400 uppercase tracking-widest hover:text-indigo-500 transition-colors"
                      >
                        {showAdvanced ? 'Hide Advanced Options' : 'Show Advanced Options'}
                      </button>
                    </div>

                    {showAdvanced && (
                      <div className="p-6 bg-gray-50/50 border border-gray-100 rounded-3xl animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center gap-2 mb-4">
                          <AlertCircle size={14} className="text-amber-500" />
                          <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Maintenance Mode</h3>
                        </div>
                        <button
                          onClick={async () => {
                            if (confirm('Warning: This will wipe local cache for this environment and perform a full reload. Continue?')) {
                              setProcessing(true);
                              await triggerResync(1, true);
                              setSuccess('Full resync triggered.');
                              setProcessing(false);
                            }
                          }}
                          disabled={processing}
                          className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:border-rose-200 hover:text-rose-500 transition-all disabled:opacity-50"
                        >
                          Force Full Cache Resync
                        </button>
                      </div>
                    )}
                  </div>
                </div>

              {/* Footer Info */}
              <div className="bg-gray-50/50 px-10 py-6 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-gray-300" />
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    Last Sync: {lastSync ? new Date(lastSync).toLocaleString() : 'Pending'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${selectedEnvId ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    {selectedEnvId ? 'Ready' : 'Not Connected'}
                  </span>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Brand Subtle Label */}
        <p className="text-center text-[9px] font-black text-gray-300 uppercase tracking-[0.3em]">
          VisionMerch Enterprise Core • v7.0.0
        </p>
      </div>
    </div>
  );
};

