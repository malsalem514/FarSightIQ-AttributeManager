/**
 * AdminPage - Enterprise Admin Console
 * 
 * Follows enterprise UX patterns:
 * - Sidebar navigation with grouped sections
 * - Progressive disclosure
 * - Clear visual hierarchy
 * - Industry-standard admin layout (like Salesforce Setup, AWS Console)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Settings, Database, Sparkles, Layers, Shield, ChevronRight,
  Activity, RefreshCw, AlertCircle, CheckCircle2, Clock, DollarSign,
  Zap, TrendingUp, Search, Filter, Eye, RotateCcw, BarChart3,
  Terminal, FileText, BookOpen, GitBranch, Server, Key, Sliders,
  Users, Building, Globe, Box, Tag, List, Plus, X, ChevronDown,
  Copy, ExternalLink, Play, Pause, Info, AlertTriangle
} from 'lucide-react';
import { fetchLLMConfigs, updateLLMConfig, fetchBatchConfig, updateBatchConfig } from '../src/api/client';
import { API_BASE_URL } from '../src/api/config';
import { Button, StatusBadge } from '../components/shared/UI';

// Import existing page components
import { SettingsPage } from './SettingsPage';
import { AttributeConfigPage } from './AttributeConfigPage';
import { TaxonomyDiscoveryPage } from './TaxonomyDiscoveryPage';

type AdminSection = 
  | 'config-environments'
  | 'config-llm'
  | 'config-batch'
  | 'catalog-taxonomy'
  | 'catalog-rules'
  | 'ai-activity'
  | 'ai-batches'
  | 'ai-costs'
  | 'system-jobs'
  | 'system-health';

interface NavItem {
  id: AdminSection;
  label: string;
  icon: any;
  badge?: string | number;
}

interface NavGroup {
  id: string;
  label: string;
  icon: any;
  items: NavItem[];
  defaultOpen?: boolean;
}

interface AdminPageProps {
  businessUnitId: number;
  hierarchy: any;
  initialSection?: AdminSection;
  onHome?: () => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({ 
  businessUnitId, 
  hierarchy,
  initialSection = 'config-environments',
  onHome
}) => {
  const [activeSection, setActiveSection] = useState<AdminSection>(initialSection);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['config', 'catalog', 'ai', 'ecommerce', 'system']));
  const [searchQuery, setSearchQuery] = useState('');
  
  // Stats for badges
  const [pendingBatches, setPendingBatches] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  // Navigation structure - Enterprise-style grouped navigation
  const navGroups: NavGroup[] = [
    {
      id: 'config',
      label: 'Configuration',
      icon: Settings,
      defaultOpen: true,
      items: [
        { id: 'config-environments', label: 'Environments', icon: Globe },
        { id: 'config-llm', label: 'AI Providers', icon: Sparkles },
      ]
    },
    {
      id: 'catalog',
      label: 'Catalog Management',
      icon: Layers,
      defaultOpen: true,
      items: [
        { id: 'catalog-taxonomy', label: 'Taxonomy Browser', icon: GitBranch },
        { id: 'catalog-rules', label: 'Attribute Rules', icon: List },
      ]
    },
    {
      id: 'ai',
      label: 'AI Operations',
      icon: Zap,
      defaultOpen: true,
      items: [
        { id: 'ai-activity', label: 'Activity Log', icon: Activity },
        { id: 'ai-batches', label: 'Batch Monitor', icon: Layers, badge: pendingBatches > 0 ? pendingBatches : undefined },
        { id: 'ai-costs', label: 'Cost Analytics', icon: DollarSign },
      ]
    },
    {
      id: 'system',
      label: 'System',
      icon: Server,
      items: [
        { id: 'system-jobs', label: 'Jobs & Queues', icon: Clock },
        { id: 'system-health', label: 'Health Status', icon: Shield, badge: errorCount > 0 ? '!' : undefined },
      ]
    }
  ];

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  // Filter nav items by search
  const filteredGroups = navGroups.map(group => ({
    ...group,
    items: group.items.filter(item => 
      item.label.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(group => group.items.length > 0 || searchQuery === '');

  // Get current section info
  const currentItem = navGroups.flatMap(g => g.items).find(i => i.id === activeSection);
  const currentGroup = navGroups.find(g => g.items.some(i => i.id === activeSection));

  return (
    <div className="h-full flex bg-gray-50">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-200">
              <Terminal size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-black text-gray-900 uppercase tracking-tight">Settings Console</h1>
              <p className="text-[10px] text-gray-400 font-medium">System Configuration</p>
            </div>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search settings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3 bg-gray-50 border border-gray-100 rounded-lg text-xs font-medium text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-50"
            />
          </div>
        </div>

        {/* Navigation Groups */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {filteredGroups.map(group => (
            <div key={group.id} className="mb-2">
              {/* Group Header */}
              <button
                onClick={() => toggleGroup(group.id)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <group.icon size={14} className="text-gray-400" />
                  <span className="uppercase tracking-wider">{group.label}</span>
                </div>
                <ChevronDown 
                  size={14} 
                  className={`text-gray-400 transition-transform ${expandedGroups.has(group.id) ? '' : '-rotate-90'}`} 
                />
              </button>
              
              {/* Group Items */}
              {expandedGroups.has(group.id) && (
                <div className="mt-1 space-y-0.5 animate-in slide-in-from-top-1 duration-200">
                  {group.items.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      data-testid={`admin-nav-${item.id}`}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        activeSection === item.id 
                          ? 'bg-purple-50 text-purple-700 border-l-2 border-purple-500' 
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 ml-4">
                        <item.icon size={14} className={activeSection === item.id ? 'text-purple-500' : 'text-gray-400'} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          item.badge === '!' ? 'bg-rose-100 text-rose-600' : 'bg-purple-100 text-purple-600'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2 text-[10px] text-gray-400">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="font-bold uppercase tracking-wider">System Online</span>
          </div>
          <p className="text-[9px] text-gray-400 mt-1">BU {businessUnitId} · v9.1.0</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Content Header */}
        <header className="flex-shrink-0 px-8 py-4 bg-white border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                <span className="font-medium cursor-pointer hover:text-purple-600 transition-colors" onClick={onHome}>Home</span>
                <ChevronRight size={12} />
                <span className="font-medium">Settings</span>
                <ChevronRight size={12} />
                <span className="font-medium">{currentGroup?.label}</span>
                <ChevronRight size={12} />
                <span className="font-bold text-gray-700">{currentItem?.label}</span>
              </div>
              <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                {currentItem && <currentItem.icon size={20} className="text-purple-500" />}
                {currentItem?.label}
              </h2>
            </div>
            
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                size="sm" 
                icon={<RefreshCw size={14} />}
                onClick={() => window.location.reload()}
              >
                Refresh
              </Button>
            </div>
          </div>
        </header>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Configuration Section */}
          {activeSection === 'config-environments' && (
            <div className="p-8">
              <SettingsPage />
            </div>
          )}
          
          {activeSection === 'config-llm' && (
            <div className="p-8">
              <LLMProvidersSection />
            </div>
          )}

          {/* Catalog Management Section */}
          {activeSection === 'catalog-taxonomy' && (
            <TaxonomyDiscoveryPage />
          )}
          
          {activeSection === 'catalog-rules' && (
            <AttributeConfigPage businessUnitId={businessUnitId} hierarchy={hierarchy} />
          )}

          {/* AI Operations Section */}
          {activeSection === 'ai-activity' && (
            <div className="p-8">
              <AIActivitySection 
                initialSearch={searchQuery} 
                onSearchCleared={() => setSearchQuery('')} 
              />
            </div>
          )}
          
          {activeSection === 'ai-batches' && (
            <div className="p-8">
              <BatchMonitorSection 
                onInspectBatch={(batchId) => {
                  setSearchQuery(batchId);
                  setActiveSection('ai-activity');
                }}
              />
            </div>
          )}
          
          {activeSection === 'ai-costs' && (
            <div className="p-8">
              <CostAnalyticsSection />
            </div>
          )}


          {/* System Section */}
          {activeSection === 'system-jobs' && (
            <div className="p-8">
              <JobsQueueSection />
            </div>
          )}
          
          {activeSection === 'system-health' && (
            <div className="p-8">
              <HealthStatusSection />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

// ============================================================================
// SUB-SECTIONS (extracted for clarity)
// ============================================================================

const AVAILABLE_MODELS = {
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o ⚡ Recommended', description: 'Fast & reliable vision', pricing: { input: 2.50, output: 10.00 } },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', description: 'Cheapest option', pricing: { input: 0.15, output: 0.60 } },
    { id: 'gpt-5', label: 'GPT-5', description: 'Best quality (slower)', pricing: { input: 1.75, output: 14.00 } },
    { id: 'gpt-5-mini', label: 'GPT-5 Mini', description: 'Balanced GPT-5', pricing: { input: 0.25, output: 2.00 } },
  ],
  gemini: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', description: 'Latest & fastest', pricing: { input: 0.10, output: 0.40 } },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', description: 'Huge context window', pricing: { input: 1.25, output: 5.00 } },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', description: 'Fast and efficient', pricing: { input: 0.075, output: 0.30 } },
  ]
};

const LLMProvidersSection: React.FC = () => {
  const [providers, setProviders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ providerId: string; success: boolean; message: string; latency?: number } | null>(null);
  const [batchConfig, setBatchConfig] = useState<any>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const [providersRes, batchRes] = await Promise.all([
        fetch(`${API_BASE_URL}/settings/llm`).then(r => r.json()),
        fetch(`${API_BASE_URL}/settings/llm/batch-config`).then(r => r.json())
      ]);
      if (providersRes.success) setProviders(providersRes.data || []);
      if (batchRes.success) setBatchConfig(batchRes.data);
    } catch (e) {
      console.error('Failed to fetch LLM settings:', e);
    }
    setIsLoading(false);
  };

  const handleActivate = async (providerId: string) => {
    setProcessing(providerId);
    try {
      await fetch(`${API_BASE_URL}/settings/llm/${providerId}`, { 
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true })
      });
      setSuccess(`${providerId} activated successfully`);
      fetchAll();
    } catch (e) {
      setError('Failed to activate provider');
    }
    setProcessing(null);
    setTimeout(() => { setSuccess(null); setError(null); }, 3000);
  };

  const handleUpdateProvider = async (providerId: string, updates: any) => {
    setProcessing(providerId);
    try {
      await fetch(`${API_BASE_URL}/settings/llm/${providerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      setSuccess('Settings saved');
      fetchAll();
    } catch (e) {
      setError('Failed to save settings');
    }
    setProcessing(null);
    setTimeout(() => { setSuccess(null); setError(null); }, 3000);
  };

  const handleUpdateBatch = async (key: string, value: number) => {
    try {
      await fetch(`${API_BASE_URL}/settings/llm/batch-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value })
      });
      setBatchConfig((prev: any) => ({ ...prev, [key]: value }));
      setSuccess('Batch config updated');
    } catch (e) {
      setError('Failed to update batch config');
    }
    setTimeout(() => { setSuccess(null); setError(null); }, 3000);
  };

  const handleTestConnection = async (providerId: string, modelName: string) => {
    setTesting(providerId);
    setTestResult(null);
    const startTime = Date.now();
    try {
      const response = await fetch(`${API_BASE_URL}/settings/llm/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, modelName })
      });
      const data = await response.json();
      const latency = Date.now() - startTime;
      if (data.success) {
        setTestResult({ providerId, success: true, message: `✓ ${modelName} is working!`, latency });
      } else {
        setTestResult({ providerId, success: false, message: data.error || 'Model test failed' });
      }
    } catch (e: any) {
      setTestResult({ providerId, success: false, message: e.message || 'Connection failed' });
    }
    setTesting(null);
    setTimeout(() => setTestResult(null), 8000);
  };

  if (isLoading) {
    return <div className="py-12 text-center"><div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>;
  }

  return (
    <div className="max-w-4xl space-y-8">
      {/* Success/Error Messages */}
      {(success || error) && (
        <div className={`p-4 rounded-xl border flex items-center gap-2 ${success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
          {success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span className="text-sm font-medium">{success || error}</span>
        </div>
      )}

      {/* LLM Providers */}
      <section>
        <div className="mb-6">
          <h3 className="text-lg font-bold text-gray-900">AI Provider Configuration</h3>
          <p className="text-sm text-gray-500 mt-1">Configure and manage AI providers for attribute extraction</p>
        </div>

        <div className="space-y-4">
          {providers.map(provider => (
            <div 
              key={provider.providerId}
              className={`bg-white rounded-xl border-2 p-6 transition-all ${
                provider.isActive ? 'border-purple-200 shadow-sm' : 'border-gray-100'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    provider.isActive ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-400'
                  }`}>
                    {provider.providerId === 'openai' ? (
                      <span className="font-black text-lg">AI</span>
                    ) : (
                      <span className="font-black text-lg">G</span>
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">{provider.displayName || (provider.providerId === 'openai' ? 'OpenAI GPT' : 'Google Gemini')}</h4>
                    <p className="text-xs text-gray-500 mt-0.5">{provider.isActive ? '● Active Engine' : '○ Standby'}</p>
                  </div>
                </div>
                
                <button
                  onClick={() => handleActivate(provider.providerId)}
                  disabled={provider.isActive || processing === provider.providerId}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                    provider.isActive 
                      ? 'bg-emerald-100 text-emerald-700 cursor-default' 
                      : 'bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50'
                  }`}
                >
                  {processing === provider.providerId ? '...' : provider.isActive ? '✓ Active' : 'Activate'}
                </button>
              </div>
              
              {/* Expanded Settings for Active Provider */}
              {provider.isActive && (
                <div className="mt-6 pt-6 border-t border-gray-100 space-y-4">
                  {/* API Key */}
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">API Key</label>
                    <div className="relative">
                      <Key size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input 
                        type="password"
                        defaultValue={provider.apiKey}
                        placeholder="Enter Provider API Key..."
                        onBlur={(e) => {
                          if (e.target.value && e.target.value !== provider.apiKey) {
                            handleUpdateProvider(provider.providerId, { apiKey: e.target.value });
                          }
                        }}
                        className="w-full h-12 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium focus:border-purple-400 focus:ring-2 focus:ring-purple-50 outline-none transition-all"
                      />
                    </div>
                  </div>

                  {/* Model & Temperature */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">Model Name</label>
                      <select 
                        defaultValue={provider.modelName}
                        onChange={(e) => handleUpdateProvider(provider.providerId, { modelName: e.target.value })}
                        className="w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium focus:border-purple-400 focus:ring-2 focus:ring-purple-50 outline-none transition-all appearance-none"
                      >
                        {AVAILABLE_MODELS[provider.providerId as keyof typeof AVAILABLE_MODELS]?.map(model => (
                          <option key={model.id} value={model.id}>
                            {model.label} — ${model.pricing.input}/${model.pricing.output} per 1M tokens
                          </option>
                        ))}
                        {!AVAILABLE_MODELS[provider.providerId as keyof typeof AVAILABLE_MODELS]?.some(m => m.id === provider.modelName) && (
                          <option value={provider.modelName}>{provider.modelName} (Custom)</option>
                        )}
                      </select>
                      {/* Pricing Info for Selected Model */}
                      {(() => {
                        const selectedModel = AVAILABLE_MODELS[provider.providerId as keyof typeof AVAILABLE_MODELS]?.find(m => m.id === provider.modelName);
                        if (!selectedModel) return null;
                        // Estimate: ~2000 input tokens (image+prompt), ~700 output tokens per product
                        const costPer1000Products = ((2000 * selectedModel.pricing.input / 1000000) + (700 * selectedModel.pricing.output / 1000000)) * 1000;
                        return (
                          <div className="mt-2 p-3 bg-purple-50 rounded-lg border border-purple-100">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-purple-600 font-medium">{selectedModel.description}</span>
                              <span className="text-emerald-600 font-bold">
                                ~${costPer1000Products.toFixed(2)} / 1,000 products
                              </span>
                            </div>
                            <div className="flex gap-4 mt-1 text-[10px] text-purple-500">
                              <span>Input: ${selectedModel.pricing.input}/1M tokens</span>
                              <span>Output: ${selectedModel.pricing.output}/1M tokens</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">Temperature</label>
                      <input 
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        defaultValue={provider.temperature}
                        onBlur={(e) => handleUpdateProvider(provider.providerId, { temperature: parseFloat(e.target.value) })}
                        className="w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium focus:border-purple-400 focus:ring-2 focus:ring-purple-50 outline-none transition-all"
                      />
                    </div>
                  </div>

                  {/* Test Connection */}
                  <div className="pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => handleTestConnection(provider.providerId, provider.modelName)}
                        disabled={testing === provider.providerId}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        {testing === provider.providerId ? (
                          <>
                            <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                            Testing...
                          </>
                        ) : (
                          <>
                            <Zap size={12} />
                            Test Model
                          </>
                        )}
                      </button>
                      {testResult && testResult.providerId === provider.providerId && (
                        <div className={`text-xs font-medium flex items-center gap-2 ${testResult.success ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {testResult.message}
                          {testResult.latency && <span className="text-gray-400">({testResult.latency}ms)</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Batch Processing Configuration */}
      {batchConfig && (
        <section className="pt-8 border-t border-gray-200">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Zap size={20} className="text-purple-500" />
              Batch Processing
            </h3>
            <p className="text-sm text-gray-500 mt-1">Tune performance settings for AI batch operations</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {[
              { key: 'maxConcurrentRequests', label: 'Max Concurrent Requests', desc: 'Parallel AI calls. Higher = faster, but may hit rate limits.', min: 1, max: 20, icon: Layers },
              { key: 'batchChunkSize', label: 'Batch Chunk Size', desc: 'Items per batch before progress yield.', min: 5, max: 100, icon: Box },
              { key: 'requestTimeoutMs', label: 'Request Timeout (ms)', desc: 'Max wait time per AI request.', min: 5000, max: 120000, step: 1000, icon: Clock },
              { key: 'retryAttempts', label: 'Retry Attempts', desc: 'Automatic retries on failure.', min: 0, max: 5, icon: RefreshCw },
            ].map(setting => (
              <div key={setting.key} className="p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <setting.icon size={16} className="text-gray-400" />
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">{setting.label}</h4>
                    <p className="text-xs text-gray-500">{setting.desc}</p>
                  </div>
                </div>
                <input
                  type="number"
                  min={setting.min}
                  max={setting.max}
                  step={setting.step || 1}
                  defaultValue={batchConfig[setting.key]}
                  onBlur={(e) => handleUpdateBatch(setting.key, parseInt(e.target.value))}
                  className="w-24 h-10 px-3 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-center focus:border-purple-400 focus:ring-2 focus:ring-purple-50 outline-none"
                />
              </div>
            ))}
          </div>

          {/* Throughput Estimate */}
          <div className="mt-4 p-4 bg-purple-50 rounded-xl border border-purple-100">
            <div className="flex items-center gap-2 text-purple-700">
              <Zap size={16} />
              <span className="text-sm font-bold">Estimated Throughput</span>
            </div>
            <p className="text-xs text-purple-600 mt-1">
              ~{Math.round((batchConfig.maxConcurrentRequests * 60000) / 8000)} items/minute · {Math.round((batchConfig.maxConcurrentRequests * 60000) / 8000 * 60)} items/hour
            </p>
          </div>
        </section>
      )}
    </div>
  );
};

interface AIActivitySectionProps {
  initialSearch?: string;
  onSearchCleared?: () => void;
}

const AIActivitySection: React.FC<AIActivitySectionProps> = ({ 
  initialSearch = '',
  onSearchCleared 
}) => {
  const [runs, setRuns] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [runDetails, setRunDetails] = useState<any>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  const [viewRawData, setViewRawData] = useState(false);

  // Sync internal search state with prop
  useEffect(() => {
    if (initialSearch !== searchQuery) {
      setSearchQuery(initialSearch);
      fetchRuns(1, initialSearch);
    }
  }, [initialSearch]);

  const fetchRuns = async (pageNum = 1, overrideSearch?: string) => {
    setIsLoading(true);
    const search = overrideSearch !== undefined ? overrideSearch : searchQuery;
    const params = new URLSearchParams({ 
      page: pageNum.toString(), 
      limit: '25',
      ...(statusFilter && { status: statusFilter }),
      ...(search && { search: search })
    });
    try {
      const res = await fetch(`${API_BASE_URL}/admin/ai-runs?${params}`);
      const data = await res.json();
      if (data.success) {
        setRuns(data.data.runs || []);
        setTotal(data.data.total || 0);
        setPage(pageNum);
      }
    } catch (e) {}
    setIsLoading(false);
  };

  useEffect(() => { fetchRuns(1); }, [statusFilter]);

  const fetchRunDetails = async (runId: number) => {
    setIsLoadingDetails(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/ai-runs/${runId}`);
      const data = await res.json();
      if (data.success) setRunDetails(data.data);
    } catch (e) {}
    setIsLoadingDetails(false);
  };

  const handleSelectRun = (run: any) => {
    setSelectedRun(run);
    fetchRunDetails(run.RUN_ID);
  };

  const handleRetry = async (runId: number) => {
    try {
      await fetch(`${API_BASE_URL}/admin/ai-runs/${runId}/retry`, { method: 'POST' });
      fetchRuns(page);
    } catch (e) {}
  };

  return (
    <div className="flex gap-6 h-[calc(100vh-220px)]">
      {/* Left: Activity List */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">AI Activity Log</h3>
            <p className="text-sm text-gray-500">Click a row to view full request/response details</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search style ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchRuns(1)}
                className="h-9 pl-9 pr-3 w-48 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:border-purple-400 focus:ring-2 focus:ring-purple-50 outline-none"
              />
            </div>
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium focus:border-purple-400 outline-none"
            >
              <option value="">All Status</option>
              <option value="success">Success</option>
              <option value="error">Error</option>
              <option value="pending">Pending</option>
            </select>
            {/* Refresh */}
            <button onClick={() => fetchRuns(page)} className="h-9 w-9 flex items-center justify-center bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100">
              <RefreshCw size={14} className="text-gray-500" />
            </button>
          </div>
        </div>

        {/* Runs Table */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
          <div className="overflow-y-auto flex-1">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-2.5 text-left">Run</th>
                  <th className="px-3 py-2.5 text-left">Style</th>
                  <th className="px-3 py-2.5 text-center">Provider</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                  <th className="px-3 py-2.5 text-right">Tokens</th>
                  <th className="px-3 py-2.5 text-right">Cost</th>
                  <th className="px-3 py-2.5 text-right">Latency</th>
                  <th className="px-3 py-2.5 text-center">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr><td colSpan={8} className="py-12 text-center"><div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" /></td></tr>
                ) : runs.length === 0 ? (
                  <tr><td colSpan={8} className="py-12 text-center text-gray-400 text-sm">No AI runs found</td></tr>
                ) : runs.map(run => (
                  <tr 
                    key={run.RUN_ID} 
                    onClick={() => handleSelectRun(run)}
                    className={`cursor-pointer transition-colors ${selectedRun?.RUN_ID === run.RUN_ID ? 'bg-purple-50' : 'hover:bg-gray-50/50'}`}
                  >
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-[11px] text-gray-600">#{run.RUN_ID}</span>
                      <span className="block text-[9px] text-gray-400">{new Date(run.CREATED_AT).toLocaleString()}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs font-bold text-gray-900">{run.STYLE_ID}</span>
                      {run.COLOR_ID && <span className="block text-[9px] text-gray-400">Color: {run.COLOR_ID}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        run.PROVIDER === 'openai' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                      }`}>{run.PROVIDER}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        run.STATUS === 'success' ? 'bg-emerald-100 text-emerald-700' : 
                        run.STATUS === 'error' ? 'bg-rose-100 text-rose-700' : 
                        'bg-amber-100 text-amber-700'
                      }`}>{run.STATUS}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="text-[11px] text-gray-600">{((run.TOKENS_INPUT || 0) + (run.TOKENS_OUTPUT || 0)).toLocaleString()}</span>
                      <span className="block text-[9px] text-gray-400">in:{run.TOKENS_INPUT || 0} out:{run.TOKENS_OUTPUT || 0}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[11px] text-gray-600">${(run.COST_USD || 0).toFixed(4)}</td>
                    <td className="px-3 py-2.5 text-right text-[11px] text-gray-600">{run.LATENCY_MS ? `${run.LATENCY_MS}ms` : '-'}</td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {run.HAS_PROMPT === 'Y' && <span title="Has Prompt" className="w-4 h-4 rounded bg-purple-100 text-purple-600 flex items-center justify-center text-[8px] font-bold">P</span>}
                        {run.HAS_CONTEXT === 'Y' && <span title="Has Context" className="w-4 h-4 rounded bg-blue-100 text-blue-600 flex items-center justify-center text-[8px] font-bold">C</span>}
                        {run.HAS_MAPPING === 'Y' && <span title="Has Mapping" className="w-4 h-4 rounded bg-emerald-100 text-emerald-600 flex items-center justify-center text-[8px] font-bold">M</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <span className="text-xs text-gray-500">{total.toLocaleString()} total runs</span>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => fetchRuns(page - 1)} 
                disabled={page <= 1}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >Previous</button>
              <span className="text-xs text-gray-500">Page {page}</span>
              <button 
                onClick={() => fetchRuns(page + 1)} 
                disabled={runs.length < 25}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >Next</button>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Detail Panel */}
      <div className="w-[480px] flex-shrink-0">
        {selectedRun ? (
          <div className="bg-white rounded-xl border border-gray-200 h-full flex flex-col overflow-hidden">
            {/* Detail Header */}
            <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-pink-50">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-gray-900">Run #{selectedRun.RUN_ID}</h4>
                  <p className="text-[10px] text-gray-500 mt-0.5">{new Date(selectedRun.CREATED_AT).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedRun.STATUS === 'error' && (
                    <button 
                      onClick={() => handleRetry(selectedRun.RUN_ID)}
                      className="px-3 py-1.5 bg-purple-600 text-white text-[10px] font-bold rounded-lg hover:bg-purple-700"
                    >
                      <RotateCcw size={12} className="inline mr-1" />
                      Retry
                    </button>
                  )}
                  <button onClick={() => { setSelectedRun(null); setRunDetails(null); }} className="p-1.5 hover:bg-gray-100 rounded-lg">
                    <X size={16} className="text-gray-400" />
                  </button>
                </div>
              </div>
            </div>

            {/* Detail Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {isLoadingDetails ? (
                <div className="py-12 text-center"><div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
              ) : runDetails ? (
                <>
                  {/* Style Header Card - Enhanced with image and hierarchy */}
                  <div className="bg-gradient-to-br from-gray-50 to-purple-50/30 rounded-xl border border-gray-100 p-4">
                    <div className="flex gap-4">
                      {/* Style Image */}
                      <div className="w-20 h-20 rounded-lg bg-white border border-gray-200 overflow-hidden flex-shrink-0 shadow-sm">
                        <img 
                          src={`${API_BASE_URL}/images/style/${runDetails.STYLE_ID}?color=${runDetails.COLOR_ID || '000'}&thumb=true`}
                          alt={runDetails.STYLE_ID}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23f3f4f6" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%239ca3af" font-size="10">No Image</text></svg>'; }}
                        />
                      </div>
                      
                      {/* Style Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-lg font-bold text-gray-900">{runDetails.STYLE_ID}</h3>
                          {runDetails.COLOR_ID && runDetails.COLOR_ID !== '000' && (
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded-full">
                              Color: {runDetails.COLOR_ID}
                            </span>
                          )}
                        </div>
                        
                        {/* Hierarchy from Context */}
                        {runDetails.CONTEXT_JSON?.hierarchy && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
                            <Layers size={12} className="text-purple-400" />
                            <span className="font-medium text-gray-700">{runDetails.CONTEXT_JSON.hierarchy.department}</span>
                            <ChevronRight size={10} className="text-gray-300" />
                            <span>{runDetails.CONTEXT_JSON.hierarchy.class}</span>
                            {runDetails.CONTEXT_JSON.hierarchy.subclass && (
                              <>
                                <ChevronRight size={10} className="text-gray-300" />
                                <span>{runDetails.CONTEXT_JSON.hierarchy.subclass}</span>
                              </>
                            )}
                          </div>
                        )}
                        
                        {/* Product snippet from Context */}
                        {runDetails.CONTEXT_JSON?.product?.description && (
                          <p className="text-xs text-gray-500 line-clamp-2">
                            {runDetails.CONTEXT_JSON.product.description.substring(0, 120)}
                            {runDetails.CONTEXT_JSON.product.description.length > 120 && '...'}
                          </p>
                        )}
                        
                        {/* Brand & Vendor */}
                        {(runDetails.CONTEXT_JSON?.product?.brandName || runDetails.CONTEXT_JSON?.product?.vendorName) && (
                          <div className="flex items-center gap-3 mt-2">
                            {runDetails.CONTEXT_JSON.product.brandName && (
                              <span className="text-[10px] text-gray-400">Brand: <span className="font-bold text-gray-600">{runDetails.CONTEXT_JSON.product.brandName}</span></span>
                            )}
                            {runDetails.CONTEXT_JSON.product.vendorName && (
                              <span className="text-[10px] text-gray-400">Vendor: <span className="font-bold text-gray-600">{runDetails.CONTEXT_JSON.product.vendorName}</span></span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quick Stats Row */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="p-3 bg-white rounded-lg border border-gray-100">
                      <p className="text-[9px] font-bold text-gray-400 uppercase">Provider</p>
                      <p className="text-xs font-bold text-gray-900 mt-1">{runDetails.PROVIDER}</p>
                    </div>
                    <div className="p-3 bg-white rounded-lg border border-gray-100">
                      <p className="text-[9px] font-bold text-gray-400 uppercase">Model</p>
                      <p className="text-xs font-bold text-gray-900 mt-1">{runDetails.MODEL || '-'}</p>
                    </div>
                    <div className="p-3 bg-white rounded-lg border border-gray-100">
                      <p className="text-[9px] font-bold text-gray-400 uppercase">Tokens</p>
                      <p className="text-xs font-bold text-gray-900 mt-1">{((runDetails.TOKENS_INPUT || 0) + (runDetails.TOKENS_OUTPUT || 0)).toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-white rounded-lg border border-gray-100">
                      <p className="text-[9px] font-bold text-gray-400 uppercase">Confidence</p>
                      <p className={`text-xs font-bold mt-1 ${
                        runDetails.CONFIDENCE >= 80 ? 'text-emerald-600' : 
                        runDetails.CONFIDENCE >= 50 ? 'text-purple-600' : 'text-gray-600'
                      }`}>{runDetails.CONFIDENCE ? `${runDetails.CONFIDENCE}%` : '-'}</p>
                    </div>
                  </div>

                  {/* Error Info (if any) */}
                  {runDetails.STATUS === 'error' && runDetails.ERROR_CODE && (
                    <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl">
                      <div className="flex items-center gap-2 text-rose-700 mb-2">
                        <AlertCircle size={14} />
                        <span className="text-xs font-bold uppercase">Error</span>
                      </div>
                      <p className="text-xs text-rose-600 font-mono">{runDetails.ERROR_CODE}</p>
                    </div>
                  )}

                  {/* Batch Info */}
                  {runDetails.BATCH_ID && (
                    <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                      <p className="text-[9px] font-bold text-blue-600 uppercase mb-1">Batch ID</p>
                      <p className="text-xs font-mono text-blue-800 break-all">{runDetails.BATCH_ID}</p>
                    </div>
                  )}

                  {/* Request: Prompt */}
                  {runDetails.PROMPT_TEXT && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                          <FileText size={12} />
                          Request Prompt
                        </h5>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => setShowFullPrompt(true)}
                            className="text-[9px] text-purple-600 font-bold hover:text-purple-700 bg-purple-50 px-2 py-0.5 rounded"
                          >
                            <ExternalLink size={10} className="inline mr-1" />
                            Expand
                          </button>
                          <button 
                            onClick={() => navigator.clipboard.writeText(runDetails.PROMPT_TEXT)}
                            className="text-[9px] text-purple-600 font-bold hover:text-purple-700"
                          >
                            <Copy size={10} className="inline mr-1" />
                            Copy
                          </button>
                        </div>
                      </div>
                      <div className="bg-gray-900 rounded-xl p-4 max-h-48 overflow-y-auto group relative">
                        <pre className="text-[11px] text-gray-300 whitespace-pre-wrap font-mono">{runDetails.PROMPT_TEXT}</pre>
                      </div>
                    </div>
                  )}

                  {/* Request: Context */}
                  {runDetails.CONTEXT_JSON && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                          <Database size={12} />
                          Context Data
                        </h5>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => navigator.clipboard.writeText(JSON.stringify(runDetails.CONTEXT_JSON, null, 2))}
                            className="text-[9px] text-purple-600 font-bold hover:text-purple-700"
                          >
                            <Copy size={10} className="inline mr-1" />
                            Copy
                          </button>
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 max-h-48 overflow-y-auto">
                        <pre className="text-[10px] text-gray-700 whitespace-pre-wrap font-mono">{JSON.stringify(runDetails.CONTEXT_JSON, null, 2)}</pre>
                      </div>
                    </div>
                  )}

                  {/* Response: AI Results */}
                  {(runDetails.SHORT_STYLE_DESC || runDetails.LONG_STYLE_DESC) && (
                    <div>
                      <h5 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <Sparkles size={12} />
                        AI Generated Descriptions
                      </h5>
                      <div className="space-y-3">
                        {runDetails.SHORT_STYLE_DESC && (
                          <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                            <p className="text-[9px] font-bold text-emerald-600 uppercase mb-1">Short Description</p>
                            <p className="text-xs text-emerald-900">{runDetails.SHORT_STYLE_DESC}</p>
                          </div>
                        )}
                        {runDetails.LONG_STYLE_DESC && (
                          <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                            <p className="text-[9px] font-bold text-emerald-600 uppercase mb-1">Long Description</p>
                            <p className="text-xs text-emerald-900">{runDetails.LONG_STYLE_DESC}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Response: Mapped Attributes - Enhanced Card View */}
                  {runDetails.MAPPED_ATTRIBUTES_JSON && Object.keys(runDetails.MAPPED_ATTRIBUTES_JSON).length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                          <Tag size={12} className="text-purple-500" />
                          AI Extracted Attributes
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded-full">
                            {Object.keys(runDetails.MAPPED_ATTRIBUTES_JSON).length}
                          </span>
                        </h5>
                        <div className="flex p-0.5 bg-gray-100 rounded-lg">
                          <button 
                            onClick={() => setViewRawData(false)}
                            className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all ${!viewRawData ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                          >Readable</button>
                          <button 
                            onClick={() => setViewRawData(true)}
                            className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all ${viewRawData ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                          >Raw</button>
                        </div>
                      </div>

                      {viewRawData ? (
                        <div className="bg-gray-900 rounded-xl p-4 overflow-x-auto">
                          <pre className="text-[10px] text-emerald-400 font-mono">{JSON.stringify(runDetails.MAPPED_ATTRIBUTES_JSON, null, 2)}</pre>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(runDetails.MAPPED_ATTRIBUTES_JSON).map(([key, val]: [string, any]) => {
                            const value = typeof val === 'object' ? (val.value || JSON.stringify(val)) : String(val);
                            const confidence = typeof val === 'object' ? (val.confidence || val.conf) : null;
                            const confNum = confidence ? (typeof confidence === 'string' ? 
                              (confidence.toLowerCase() === 'high' ? 90 : confidence.toLowerCase() === 'medium' ? 70 : 40) : 
                              Number(confidence)) : null;
                            
                            return (
                              <div 
                                key={key} 
                                className={`p-2 rounded-lg border ${
                                  confNum && confNum >= 80 ? 'bg-emerald-50/30 border-emerald-100' :
                                  confNum && confNum >= 50 ? 'bg-purple-50/30 border-purple-100' :
                                  confNum ? 'bg-amber-50/30 border-amber-100' :
                                  'bg-gray-50 border-gray-100'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tight truncate">
                                      {key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')}
                                    </p>
                                    <p className="text-xs font-bold text-gray-900 truncate" title={value}>
                                      {value}
                                    </p>
                                  </div>
                                  {confNum !== null && (
                                    <span className={`text-[10px] font-black ${
                                      confNum >= 80 ? 'text-emerald-600' : confNum >= 50 ? 'text-purple-600' : 'text-amber-600'
                                    }`}>
                                      {confNum}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Response: Additional Attributes - Enhanced Card View */}
                  {runDetails.ADDITIONAL_ATTRIBUTES && Object.keys(runDetails.ADDITIONAL_ATTRIBUTES).length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                          <List size={12} className="text-blue-500" />
                          Additional Attributes
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full">
                            {Object.keys(runDetails.ADDITIONAL_ATTRIBUTES).length}
                          </span>
                        </h5>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(runDetails.ADDITIONAL_ATTRIBUTES).map(([key, val]: [string, any]) => {
                          const value = typeof val === 'object' ? (val.value || JSON.stringify(val)) : String(val);
                          const confidence = typeof val === 'object' ? (val.confidence || val.conf) : null;
                          const confNum = confidence ? (typeof confidence === 'string' ? 
                            (confidence.toLowerCase() === 'high' ? 90 : confidence.toLowerCase() === 'medium' ? 70 : 40) : 
                            Number(confidence)) : null;
                          
                          return (
                            <div 
                              key={key} 
                              className={`p-3 rounded-lg border ${
                                confNum && confNum >= 80 ? 'bg-emerald-50/50 border-emerald-200' :
                                confNum && confNum >= 50 ? 'bg-blue-50/50 border-blue-200' :
                                confNum ? 'bg-amber-50/50 border-amber-200' :
                                'bg-gray-50 border-gray-100'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                                    {key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')}
                                  </p>
                                  <p className="text-sm font-bold text-gray-900 truncate" title={value}>
                                    {value}
                                  </p>
                                </div>
                                {confNum !== null && (
                                  <div className={`flex-shrink-0 flex flex-col items-center px-2 py-1 rounded-lg ${
                                    confNum >= 80 ? 'bg-emerald-100' : confNum >= 50 ? 'bg-blue-100' : 'bg-amber-100'
                                  }`}>
                                    <span className={`text-[10px] font-black ${
                                      confNum >= 80 ? 'text-emerald-700' : confNum >= 50 ? 'text-blue-700' : 'text-amber-700'
                                    }`}>
                                      {confNum}%
                                    </span>
                                    <span className={`text-[8px] ${
                                      confNum >= 80 ? 'text-emerald-600' : confNum >= 50 ? 'text-blue-600' : 'text-amber-600'
                                    }`}>
                                      {confNum >= 80 ? 'High' : confNum >= 50 ? 'Med' : 'Low'}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-gray-400 text-sm">Failed to load details</div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 h-full flex flex-col items-center justify-center text-gray-400">
            <Eye size={32} className="mb-3 opacity-50" />
            <p className="text-sm font-medium">Select a run to view details</p>
            <p className="text-xs mt-1">Full request/response data available</p>
          </div>
        )}
      </div>

      {/* Full Prompt Overlay */}
      {showFullPrompt && runDetails && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-12 animate-in fade-in duration-300">
          <div className="bg-gray-900 rounded-3xl w-full max-w-5xl h-full flex flex-col overflow-hidden shadow-2xl border border-white/10 relative">
            <button 
              onClick={() => setShowFullPrompt(false)}
              className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all z-10"
            >
              <X size={24} />
            </button>
            <div className="p-10 border-b border-white/10 bg-white/5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center">
                <FileText size={24} className="text-purple-400" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-white tracking-tight">Full Request Prompt</h3>
                <p className="text-gray-400 text-sm mt-1">Run #{runDetails.RUN_ID} • Style {runDetails.STYLE_ID}</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
              <pre className="text-gray-300 whitespace-pre-wrap font-mono text-sm leading-relaxed">{runDetails.PROMPT_TEXT}</pre>
            </div>
            <div className="p-6 border-t border-white/10 bg-white/5 flex justify-end gap-4">
              <button 
                onClick={() => navigator.clipboard.writeText(runDetails.PROMPT_TEXT)}
                className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-white text-sm font-bold transition-all flex items-center gap-2"
              >
                <Copy size={16} />
                Copy to Clipboard
              </button>
              <button 
                onClick={() => setShowFullPrompt(false)}
                className="px-8 py-2 bg-purple-600 hover:bg-purple-700 rounded-xl text-white text-sm font-bold shadow-lg shadow-purple-500/20 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface BatchMonitorSectionProps {
  onInspectBatch: (batchId: string) => void;
}

const BatchMonitorSection: React.FC<BatchMonitorSectionProps> = ({ onInspectBatch }) => {
  const [batches, setBatches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/admin/batches?limit=20`)
      .then(r => r.json())
      .then(d => { if (d.success) setBatches(d.data.batches || []); })
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-900">Batch Monitor</h3>
        <p className="text-sm text-gray-500 mt-1">Track AI enrichment batch operations</p>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="py-12 text-center"><div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : batches.length === 0 ? (
          <div className="py-12 text-center text-gray-400">No batches found</div>
        ) : batches.map(batch => (
          <div 
            key={batch.BATCH_ID} 
            className={`bg-white rounded-xl border transition-all ${expandedBatchId === batch.BATCH_ID ? 'border-purple-200 ring-4 ring-purple-50' : 'border-gray-200 hover:border-gray-300 shadow-sm'}`}
          >
            <div 
              className="p-5 cursor-pointer"
              onClick={() => setExpandedBatchId(expandedBatchId === batch.BATCH_ID ? null : batch.BATCH_ID)}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    batch.STATUS === 'COMPLETED' ? 'bg-emerald-100 text-emerald-600' :
                    batch.STATUS === 'RUNNING' ? 'bg-blue-100 text-blue-600 animate-pulse' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    <Layers size={16} />
                  </div>
                  <div>
                    <span className="font-mono text-xs font-bold text-gray-900">{batch.BATCH_ID?.slice(0, 13)}...</span>
                    <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold ${
                      batch.STATUS === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                      batch.STATUS === 'RUNNING' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{batch.STATUS}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1"><Clock size={12} /> {new Date(batch.STARTED_AT).toLocaleString()}</span>
                  <ChevronDown size={16} className={`transition-transform ${expandedBatchId === batch.BATCH_ID ? 'rotate-180' : ''}`} />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-1000 ${batch.STATUS === 'COMPLETED' ? 'bg-emerald-500' : 'bg-purple-500'}`}
                      style={{ width: `${batch.PROGRESS_PCT || 0}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-baseline gap-1 min-w-[60px] text-right">
                  <span className="text-sm font-black text-gray-900">{batch.PROCESSED_ITEMS || 0}</span>
                  <span className="text-[10px] font-bold text-gray-400">/ {batch.TOTAL_ITEMS}</span>
                </div>
              </div>
            </div>

            {expandedBatchId === batch.BATCH_ID && (
              <div className="px-5 pb-5 pt-2 border-t border-gray-50 animate-in slide-in-from-top-2 duration-200">
                <div className="grid grid-cols-4 gap-4 mb-4">
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Success Rate</p>
                    <p className="text-sm font-black text-gray-900">{batch.TOTAL_ITEMS ? Math.round(((batch.SUCCESS_COUNT || 0) / batch.TOTAL_ITEMS) * 100) : 0}%</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Failures</p>
                    <p className={`text-sm font-black ${batch.ERROR_COUNT > 0 ? 'text-rose-600' : 'text-gray-900'}`}>{batch.ERROR_COUNT || 0}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Duration</p>
                    <p className="text-sm font-black text-gray-900">
                      {batch.COMPLETED_AT ? `${Math.round((new Date(batch.COMPLETED_AT).getTime() - new Date(batch.STARTED_AT).getTime()) / 1000)}s` : 'In Progress...'}
                    </p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Business Unit</p>
                    <p className="text-sm font-black text-gray-900">BU {batch.BUSINESS_UNIT_ID}</p>
                  </div>
                </div>
                
                {/* Content details if available */}
                <div className="mt-4">
                  <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <List size={10} />
                    Content Preview
                  </h5>
                  <p className="text-xs text-gray-500 italic">Individual run details available in AI Activity Log using Batch ID.</p>
                  <div className="mt-3 flex items-center gap-2">
                    <button 
                      onClick={() => onInspectBatch(batch.BATCH_ID)}
                      className="px-4 py-1.5 bg-purple-50 text-purple-600 rounded-lg text-[10px] font-black uppercase hover:bg-purple-100 transition-colors"
                    >
                      Inspect in Activity Log
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const CostAnalyticsSection: React.FC = () => {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/admin/stats`)
      .then(r => r.json())
      .then(d => { if (d.success) setStats(d.data); });
  }, []);

  if (!stats) return <div className="py-12 text-center"><div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>;

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-900">Cost Analytics</h3>
        <p className="text-sm text-gray-500 mt-1">AI usage and cost breakdown</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Cost', value: `$${(stats.overall?.TOTAL_COST || 0).toFixed(2)}`, icon: DollarSign, color: 'emerald' },
          { label: 'Total Runs', value: stats.overall?.TOTAL_RUNS?.toLocaleString() || '0', icon: Activity, color: 'blue' },
          { label: 'Avg Latency', value: `${Math.round(stats.overall?.AVG_LATENCY || 0)}ms`, icon: Clock, color: 'purple' },
          { label: 'Success Rate', value: `${stats.overall?.TOTAL_RUNS ? Math.round((stats.overall.SUCCESS_COUNT / stats.overall.TOTAL_RUNS) * 100) : 0}%`, icon: CheckCircle2, color: 'amber' },
        ].map((stat, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon size={16} className={`text-${stat.color}-500`} />
              <span className="text-xs font-bold text-gray-500 uppercase">{stat.label}</span>
            </div>
            <p className="text-2xl font-black text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>

      {stats.byProvider && stats.byProvider.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h4 className="text-sm font-bold text-gray-900 mb-4">Cost by Provider</h4>
          <div className="space-y-3">
            {stats.byProvider.map((p: any) => (
              <div key={p.PROVIDER} className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">{p.PROVIDER}</span>
                <span className="text-sm font-bold text-gray-900">${(p.COST || 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const JobsQueueSection: React.FC = () => {
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/admin/jobs`)
      .then(r => r.json())
      .then(d => { if (d.success) setJobs(d.data || []); });
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-900">Jobs & Queues</h3>
        <p className="text-sm text-gray-500 mt-1">Background job processing status</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-[10px] font-bold text-gray-500 uppercase">
              <th className="px-4 py-3 text-left">Job ID</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-right">Attempts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {jobs.length === 0 ? (
              <tr><td colSpan={4} className="py-8 text-center text-gray-400 text-sm">No jobs in queue</td></tr>
            ) : jobs.map(job => (
              <tr key={job.JOB_ID} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 font-mono text-xs text-gray-600">#{job.JOB_ID}</td>
                <td className="px-4 py-3 text-xs font-bold text-gray-900">{job.JOB_TYPE}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    job.STATUS === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                    job.STATUS === 'pending' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{job.STATUS}</span>
                </td>
                <td className="px-4 py-3 text-right text-xs text-gray-600">{job.ATTEMPTS || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const HealthStatusSection: React.FC = () => {
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/health`)
      .then(r => r.json())
      .then(d => setHealth(d));
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-bold text-gray-900">System Health</h3>
        <p className="text-sm text-gray-500 mt-1">Service status and connectivity</p>
      </div>

      <div className="space-y-4">
        {[
          { name: 'API Server', status: health?.status === 'ok', desc: `Running v${health?.version || '1.0.0'}` },
          { name: 'Oracle Database', status: health?.oracle?.connected, desc: `Latency: ${health?.oracle?.latencyMs || 0}ms · Pool: ${health?.oracle?.pool?.connectionsOpen || 0} open (${health?.oracle?.pool?.connectionsInUse || 0} in use)` },
          { name: 'AI Infrastructure', status: !!health?.services?.llmProvider, desc: `Active Provider: ${health?.services?.llmProvider || 'None'} (${health?.services?.llmModel || 'No Model'})` },
        ].map((service, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-gray-900">{service.name}</h4>
              <p className="text-xs text-gray-500">{service.desc}</p>
            </div>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
              service.status ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            }`}>
              {service.status ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              <span className="text-xs font-bold">{service.status ? 'Healthy' : 'Issue'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminPage;
