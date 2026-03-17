/**
 * AdminMonitoringPage - Enterprise Command Center
 * 
 * State-of-the-art admin dashboard for AI operations visibility,
 * batch monitoring, cost analytics, and system health.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Activity, RefreshCw, AlertTriangle, CheckCircle2, Database, 
  Sparkles, Clock, DollarSign, Zap, TrendingUp, TrendingDown,
  Search, Filter, ChevronRight, ChevronDown, Eye, RotateCcw,
  BarChart3, Layers, Settings, Shield, X, Copy, ExternalLink,
  Play, Pause, AlertCircle, Info, Terminal, FileText
} from 'lucide-react';
import { API_BASE_URL } from '../src/api/config';
import { Button, StatusBadge } from '../components/shared/UI';
import { SettingsPage } from './SettingsPage';

type AdminTab = 'overview' | 'ai-activity' | 'batches' | 'system' | 'settings';

interface AIRun {
  RUN_ID: number;
  TENANT_ID: string;
  BUSINESS_UNIT_ID: number;
  STYLE_ID: string;
  COLOR_ID: string;
  PROVIDER: string;
  MODEL: string;
  STATUS: string;
  CONFIDENCE: number;
  COST_USD: number;
  TOKENS_INPUT: number;
  TOKENS_OUTPUT: number;
  BATCH_ID: string;
  LATENCY_MS: number;
  ERROR_CODE: string;
  CREATED_AT: string;
  HAS_PROMPT: string;
  HAS_CONTEXT: string;
  HAS_MAPPING: string;
}

interface Batch {
  BATCH_ID: string;
  TENANT_ID: string;
  BUSINESS_UNIT_ID: number;
  TOTAL_ITEMS: number;
  PROCESSED_ITEMS: number;
  SUCCESS_COUNT: number;
  ERROR_COUNT: number;
  STATUS: string;
  CURRENT_STYLE_ID: string;
  STARTED_AT: string;
  COMPLETED_AT: string;
  PROGRESS_PCT: number;
  TOTAL_COST: number;
  TOTAL_TOKENS: number;
}

interface Stats {
  overall: {
    TOTAL_RUNS: number;
    SUCCESS_COUNT: number;
    ERROR_COUNT: number;
    TOTAL_COST: number;
    TOTAL_INPUT_TOKENS: number;
    TOTAL_OUTPUT_TOKENS: number;
    AVG_LATENCY: number;
    AVG_CONFIDENCE: number;
  };
  byProvider: Array<{ PROVIDER: string; COUNT: number; COST: number; AVG_LATENCY: number; AVG_CONFIDENCE: number }>;
  dailyTrend: Array<{ DAY: string; RUNS: number; COST: number; SUCCESS: number; ERRORS: number }>;
  batchesByStatus: Array<{ STATUS: string; COUNT: number }>;
  topErrors: Array<{ ERROR_CODE: string; COUNT: number }>;
}

export const AdminMonitoringPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Data state
  const [stats, setStats] = useState<Stats | null>(null);
  const [runs, setRuns] = useState<AIRun[]>([]);
  const [runsTotal, setRunsTotal] = useState(0);
  const [runsPage, setRunsPage] = useState(1);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchesTotal, setBatchesTotal] = useState(0);
  const [jobs, setJobs] = useState<any[]>([]);
  const [qualityRuns, setQualityRuns] = useState<any[]>([]);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [providerFilter, setProviderFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Detail view
  const [selectedRun, setSelectedRun] = useState<AIRun | null>(null);
  const [runDetails, setRunDetails] = useState<any>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  
  // Fetch functions
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/stats?days=30`);
      const data = await res.json();
      if (data.success) setStats(data.data);
    } catch (e: any) {
      console.error('Failed to fetch stats:', e);
    }
  }, []);
  
  const fetchRuns = useCallback(async (page = 1) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), page_size: '25' });
      if (statusFilter) params.set('status', statusFilter);
      if (providerFilter) params.set('provider', providerFilter);
      if (searchQuery) params.set('style_id', searchQuery);
      
      const res = await fetch(`${API_BASE_URL}/admin/ai-runs?${params}`);
      const data = await res.json();
      if (data.success) {
        setRuns(data.data.runs);
        setRunsTotal(data.data.total);
        setRunsPage(page);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, providerFilter, searchQuery]);
  
  const fetchBatches = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/batches?page_size=50`);
      const data = await res.json();
      if (data.success) {
        setBatches(data.data.batches);
        setBatchesTotal(data.data.total);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/jobs`);
      const data = await res.json();
      if (data.success) setJobs(data.data);
    } catch (e: any) {
      console.error('Failed to fetch jobs:', e);
    }
  }, []);
  
  const fetchQualityRuns = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/quality/runs`);
      const data = await res.json();
      if (data.success) setQualityRuns(data.data);
    } catch (e: any) {
      console.error('Failed to fetch quality runs:', e);
    }
  }, []);
  
  const fetchRunDetails = async (runId: number) => {
    setIsLoadingDetails(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/ai-runs/${runId}`);
      const data = await res.json();
      if (data.success) setRunDetails(data.data);
    } catch (e: any) {
      console.error('Failed to fetch run details:', e);
    } finally {
      setIsLoadingDetails(false);
    }
  };
  
  const handleRetry = async (runId: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/ai-runs/${runId}/retry`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        fetchRuns(runsPage);
        setSelectedRun(null);
      } else {
        setError(data.error?.message || 'Retry failed');
      }
    } catch (e: any) {
      setError(e.message);
    }
  };
  
  // Effects
  useEffect(() => {
    if (activeTab === 'overview') {
      fetchStats();
      fetchBatches();
    } else if (activeTab === 'ai-activity') {
      fetchRuns(1);
    } else if (activeTab === 'batches') {
      fetchBatches();
    } else if (activeTab === 'system') {
      fetchJobs();
      fetchQualityRuns();
    }
  }, [activeTab, fetchStats, fetchRuns, fetchBatches, fetchJobs, fetchQualityRuns]);
  
  useEffect(() => {
    if (activeTab === 'ai-activity') fetchRuns(1);
  }, [statusFilter, providerFilter, searchQuery]);
  
  useEffect(() => {
    if (selectedRun) fetchRunDetails(selectedRun.RUN_ID);
  }, [selectedRun]);
  
  // Render helpers
  const formatCost = (cost: number) => cost ? `$${cost.toFixed(4)}` : '-';
  const formatTokens = (tokens: number) => tokens ? tokens.toLocaleString() : '-';
  const formatLatency = (ms: number) => ms ? `${Math.round(ms)}ms` : '-';
  const formatDate = (date: string) => date ? new Date(date).toLocaleString() : '-';
  const formatRelativeTime = (date: string) => {
    if (!date) return '-';
    const diff = Date.now() - new Date(date).getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };
  
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'success': case 'completed': return 'bg-emerald-100 text-emerald-700';
      case 'error': case 'failed': return 'bg-rose-100 text-rose-700';
      case 'running': case 'pending': return 'bg-amber-100 text-amber-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-8 py-6 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                <Terminal size={20} className="text-white" />
              </div>
              Command Center
            </h1>
            <p className="text-sm text-gray-500 font-medium mt-1 ml-[52px]">AI Operations · Batch Monitoring · System Health</p>
          </div>
          
          <nav className="flex bg-gray-100/80 rounded-xl p-1 gap-1">
            {[
              { id: 'overview', icon: BarChart3, label: 'Overview' },
              { id: 'ai-activity', icon: Sparkles, label: 'AI Activity' },
              { id: 'batches', icon: Layers, label: 'Batches' },
              { id: 'system', icon: Database, label: 'System' },
              { id: 'settings', icon: Settings, label: 'Settings' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as AdminTab)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === tab.id 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                }`}
              >
                <tab.icon size={14} />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      
      {error && (
        <div className="mx-8 mt-4 px-4 py-3 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-2 text-rose-700 text-sm font-medium">
          <AlertCircle size={16} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto hover:bg-rose-100 rounded p-1"><X size={14} /></button>
        </div>
      )}
      
      {/* Content */}
      <main className="flex-1 overflow-y-auto p-8">
        {activeTab === 'settings' ? (
          <SettingsPage />
        ) : activeTab === 'overview' ? (
          <OverviewTab stats={stats} batches={batches} formatCost={formatCost} formatTokens={formatTokens} formatLatency={formatLatency} />
        ) : activeTab === 'ai-activity' ? (
          <AIActivityTab 
            runs={runs} 
            total={runsTotal} 
            page={runsPage}
            isLoading={isLoading}
            statusFilter={statusFilter}
            providerFilter={providerFilter}
            searchQuery={searchQuery}
            onStatusFilterChange={setStatusFilter}
            onProviderFilterChange={setProviderFilter}
            onSearchChange={setSearchQuery}
            onPageChange={fetchRuns}
            onSelectRun={setSelectedRun}
            selectedRun={selectedRun}
            runDetails={runDetails}
            isLoadingDetails={isLoadingDetails}
            onRetry={handleRetry}
            onCloseDetails={() => { setSelectedRun(null); setRunDetails(null); }}
            formatCost={formatCost}
            formatTokens={formatTokens}
            formatLatency={formatLatency}
            formatDate={formatDate}
            formatRelativeTime={formatRelativeTime}
            getStatusColor={getStatusColor}
          />
        ) : activeTab === 'batches' ? (
          <BatchesTab 
            batches={batches} 
            total={batchesTotal}
            isLoading={isLoading}
            onRefresh={fetchBatches}
            formatCost={formatCost}
            formatTokens={formatTokens}
            formatDate={formatDate}
            formatRelativeTime={formatRelativeTime}
            getStatusColor={getStatusColor}
          />
        ) : activeTab === 'system' ? (
          <SystemTab 
            jobs={jobs} 
            qualityRuns={qualityRuns}
            onRefreshJobs={fetchJobs}
            onRefreshQuality={fetchQualityRuns}
          />
        ) : null}
      </main>
    </div>
  );
};

// ============ Overview Tab ============
const OverviewTab: React.FC<{
  stats: Stats | null;
  batches: Batch[];
  formatCost: (n: number) => string;
  formatTokens: (n: number) => string;
  formatLatency: (n: number) => string;
}> = ({ stats, batches, formatCost, formatTokens, formatLatency }) => {
  if (!stats) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>;
  
  const { overall, byProvider, dailyTrend, topErrors } = stats;
  const successRate = overall.TOTAL_RUNS > 0 ? ((overall.SUCCESS_COUNT / overall.TOTAL_RUNS) * 100).toFixed(1) : '0';
  
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard 
          icon={Sparkles} 
          label="Total AI Runs" 
          value={overall.TOTAL_RUNS?.toLocaleString() || '0'}
          subValue="Last 30 days"
          color="indigo"
        />
        <KPICard 
          icon={CheckCircle2} 
          label="Success Rate" 
          value={`${successRate}%`}
          subValue={`${overall.ERROR_COUNT || 0} errors`}
          color={parseFloat(successRate) > 95 ? 'emerald' : parseFloat(successRate) > 80 ? 'amber' : 'rose'}
        />
        <KPICard 
          icon={DollarSign} 
          label="Total Cost" 
          value={formatCost(overall.TOTAL_COST || 0)}
          subValue={`~${formatCost((overall.TOTAL_COST || 0) / Math.max(overall.TOTAL_RUNS, 1))}/run`}
          color="purple"
        />
        <KPICard 
          icon={Zap} 
          label="Avg Latency" 
          value={formatLatency(overall.AVG_LATENCY || 0)}
          subValue={`${Math.round(overall.AVG_CONFIDENCE || 0)}% avg confidence`}
          color="cyan"
        />
      </div>
      
      {/* Provider breakdown + Trend */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-indigo-500" />
            Daily Trend (Last 7 Days)
          </h3>
          <div className="h-32 flex items-end gap-2">
            {dailyTrend.map((day, i) => {
              const maxRuns = Math.max(...dailyTrend.map(d => d.RUNS || 0), 1);
              const height = ((day.RUNS || 0) / maxRuns) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-gray-100 rounded-t relative" style={{ height: '100px' }}>
                    <div 
                      className="absolute bottom-0 w-full bg-gradient-to-t from-indigo-500 to-indigo-400 rounded-t transition-all"
                      style={{ height: `${height}%` }}
                    />
                    {day.ERRORS > 0 && (
                      <div 
                        className="absolute bottom-0 w-full bg-rose-400 rounded-t"
                        style={{ height: `${((day.ERRORS || 0) / maxRuns) * 100}%` }}
                      />
                    )}
                  </div>
                  <span className="text-[10px] font-bold text-gray-400">
                    {new Date(day.DAY).toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Database size={16} className="text-purple-500" />
            By Provider
          </h3>
          <div className="space-y-3">
            {byProvider.map(p => (
              <div key={p.PROVIDER} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${p.PROVIDER === 'openai' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                  <span className="text-xs font-bold text-gray-700 uppercase">{p.PROVIDER}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-gray-900">{p.COUNT} runs</span>
                  <span className="text-[10px] text-gray-400 ml-2">{formatCost(p.COST || 0)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Active Batches + Top Errors */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Layers size={16} className="text-amber-500" />
            Recent Batches
          </h3>
          <div className="space-y-2">
            {batches.slice(0, 5).map(b => (
              <div key={b.BATCH_ID} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${b.STATUS === 'RUNNING' ? 'bg-amber-500 animate-pulse' : b.STATUS === 'COMPLETED' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <span className="text-xs font-mono font-bold text-gray-600">{b.BATCH_ID.slice(0, 8)}...</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-gray-500">{b.PROCESSED_ITEMS}/{b.TOTAL_ITEMS}</span>
                  <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all ${b.STATUS === 'COMPLETED' ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                      style={{ width: `${b.PROGRESS_PCT || 0}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
            {batches.length === 0 && <p className="text-xs text-gray-400 italic text-center py-4">No recent batches</p>}
          </div>
        </div>
        
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-rose-500" />
            Top Errors
          </h3>
          <div className="space-y-2">
            {topErrors.map((e, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-[10px] font-black">{e.COUNT}</span>
                <span className="text-xs text-gray-600 line-clamp-2">{e.ERROR_CODE}</span>
              </div>
            ))}
            {topErrors.length === 0 && <p className="text-xs text-gray-400 italic text-center py-4">No errors 🎉</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ AI Activity Tab ============
const AIActivityTab: React.FC<{
  runs: AIRun[];
  total: number;
  page: number;
  isLoading: boolean;
  statusFilter: string;
  providerFilter: string;
  searchQuery: string;
  onStatusFilterChange: (v: string) => void;
  onProviderFilterChange: (v: string) => void;
  onSearchChange: (v: string) => void;
  onPageChange: (p: number) => void;
  onSelectRun: (r: AIRun) => void;
  selectedRun: AIRun | null;
  runDetails: any;
  isLoadingDetails: boolean;
  onRetry: (id: number) => void;
  onCloseDetails: () => void;
  formatCost: (n: number) => string;
  formatTokens: (n: number) => string;
  formatLatency: (n: number) => string;
  formatDate: (d: string) => string;
  formatRelativeTime: (d: string) => string;
  getStatusColor: (s: string) => string;
}> = ({ 
  runs, total, page, isLoading, 
  statusFilter, providerFilter, searchQuery,
  onStatusFilterChange, onProviderFilterChange, onSearchChange, onPageChange,
  onSelectRun, selectedRun, runDetails, isLoadingDetails, onRetry, onCloseDetails,
  formatCost, formatTokens, formatLatency, formatDate, formatRelativeTime, getStatusColor
}) => {
  const totalPages = Math.ceil(total / 25);
  
  return (
    <div className="flex gap-6 h-full">
      {/* List */}
      <div className={`flex-1 flex flex-col ${selectedRun ? 'max-w-[60%]' : ''}`}>
        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by Style ID..."
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
            />
          </div>
          <select 
            value={statusFilter} 
            onChange={e => onStatusFilterChange(e.target.value)}
            className="px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">All Status</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
          </select>
          <select 
            value={providerFilter} 
            onChange={e => onProviderFilterChange(e.target.value)}
            className="px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">All Providers</option>
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
          </select>
          <span className="text-xs text-gray-400 font-medium">{total.toLocaleString()} runs</span>
        </div>
        
        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex-1 flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full">
              <thead className="bg-gray-50/80 sticky top-0">
                <tr className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Run</th>
                  <th className="px-4 py-3 text-left">Style</th>
                  <th className="px-4 py-3 text-center">Provider</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Tokens</th>
                  <th className="px-4 py-3 text-right">Cost</th>
                  <th className="px-4 py-3 text-right">Latency</th>
                  <th className="px-4 py-3 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {isLoading ? (
                  <tr><td colSpan={8} className="py-12 text-center"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" /></td></tr>
                ) : runs.length === 0 ? (
                  <tr><td colSpan={8} className="py-12 text-center text-gray-400 text-sm italic">No AI runs found</td></tr>
                ) : runs.map(run => (
                  <tr 
                    key={run.RUN_ID} 
                    onClick={() => onSelectRun(run)}
                    className={`hover:bg-indigo-50/50 cursor-pointer transition-colors ${selectedRun?.RUN_ID === run.RUN_ID ? 'bg-indigo-50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono font-bold text-gray-500">#{run.RUN_ID}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold text-gray-900">{run.STYLE_ID}</span>
                      {run.BATCH_ID && <span className="ml-2 text-[10px] text-indigo-500 font-medium">batch</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[10px] font-bold uppercase ${run.PROVIDER === 'openai' ? 'text-emerald-600' : 'text-blue-600'}`}>
                        {run.PROVIDER}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getStatusColor(run.STATUS)}`}>
                        {run.STATUS}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs text-gray-600 tabular-nums">
                        {formatTokens((run.TOKENS_INPUT || 0) + (run.TOKENS_OUTPUT || 0))}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs font-bold text-gray-900 tabular-nums">{formatCost(run.COST_USD)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs text-gray-500 tabular-nums">{formatLatency(run.LATENCY_MS)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-[10px] text-gray-400">{formatRelativeTime(run.CREATED_AT)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
              <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
              <div className="flex gap-1">
                <button 
                  onClick={() => onPageChange(page - 1)} 
                  disabled={page === 1}
                  className="px-3 py-1 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50"
                >
                  Prev
                </button>
                <button 
                  onClick={() => onPageChange(page + 1)} 
                  disabled={page === totalPages}
                  className="px-3 py-1 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Detail Panel */}
      {selectedRun && (
        <div className="w-[40%] bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Run #{selectedRun.RUN_ID}</h3>
              <p className="text-[10px] text-gray-500">{formatDate(selectedRun.CREATED_AT)}</p>
            </div>
            <div className="flex items-center gap-2">
              {selectedRun.STATUS === 'error' && (
                <Button size="sm" variant="outline" icon={<RotateCcw size={12} />} onClick={() => onRetry(selectedRun.RUN_ID)}>
                  Retry
                </Button>
              )}
              <button onClick={onCloseDetails} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={16} /></button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {isLoadingDetails ? (
              <div className="flex items-center justify-center h-32"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : runDetails ? (
              <>
                {/* Summary */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Provider</span>
                    <p className="text-sm font-bold text-gray-900 mt-1">{runDetails.PROVIDER}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Cost</span>
                    <p className="text-sm font-bold text-gray-900 mt-1">{formatCost(runDetails.COST_USD)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Confidence</span>
                    <p className="text-sm font-bold text-gray-900 mt-1">{runDetails.CONFIDENCE || 0}%</p>
                  </div>
                </div>
                
                {/* Error */}
                {runDetails.ERROR_CODE && (
                  <div className="bg-rose-50 border border-rose-100 rounded-xl p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={16} className="text-rose-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="text-xs font-bold text-rose-700">Error</span>
                        <p className="text-xs text-rose-600 mt-1">{runDetails.ERROR_CODE}</p>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Prompt */}
                {runDetails.PROMPT_TEXT && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-gray-700 flex items-center gap-2">
                        <FileText size={14} className="text-indigo-500" />
                        Prompt
                      </span>
                      <button 
                        onClick={() => navigator.clipboard.writeText(runDetails.PROMPT_TEXT)}
                        className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1"
                      >
                        <Copy size={10} /> Copy
                      </button>
                    </div>
                    <pre className="bg-gray-900 text-gray-100 text-[10px] p-4 rounded-xl overflow-x-auto max-h-48 font-mono">
                      {runDetails.PROMPT_TEXT?.substring(0, 2000)}
                      {runDetails.PROMPT_TEXT?.length > 2000 && '...'}
                    </pre>
                  </div>
                )}
                
                {/* Context */}
                {runDetails.CONTEXT_JSON && (
                  <div>
                    <span className="text-xs font-bold text-gray-700 flex items-center gap-2 mb-2">
                      <Info size={14} className="text-purple-500" />
                      Enriched Context
                    </span>
                    <pre className="bg-purple-50 text-purple-900 text-[10px] p-4 rounded-xl overflow-x-auto max-h-48 font-mono">
                      {JSON.stringify(runDetails.CONTEXT_JSON, null, 2)}
                    </pre>
                  </div>
                )}
                
                {/* Output */}
                {(runDetails.SHORT_STYLE_DESC || runDetails.LONG_STYLE_DESC) && (
                  <div>
                    <span className="text-xs font-bold text-gray-700 flex items-center gap-2 mb-2">
                      <Sparkles size={14} className="text-emerald-500" />
                      AI Output
                    </span>
                    <div className="bg-emerald-50 rounded-xl p-4 space-y-3">
                      {runDetails.SHORT_STYLE_DESC && (
                        <div>
                          <span className="text-[10px] font-bold text-emerald-600 uppercase">Short Description</span>
                          <p className="text-xs text-gray-700 mt-1">{runDetails.SHORT_STYLE_DESC}</p>
                        </div>
                      )}
                      {runDetails.LONG_STYLE_DESC && (
                        <div>
                          <span className="text-[10px] font-bold text-emerald-600 uppercase">Long Description</span>
                          <p className="text-xs text-gray-700 mt-1">{runDetails.LONG_STYLE_DESC}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Mapped Attributes */}
                {runDetails.MAPPED_ATTRIBUTES_JSON && (
                  <div>
                    <span className="text-xs font-bold text-gray-700 flex items-center gap-2 mb-2">
                      <Database size={14} className="text-blue-500" />
                      Mapped Attributes
                    </span>
                    <pre className="bg-blue-50 text-blue-900 text-[10px] p-4 rounded-xl overflow-x-auto max-h-48 font-mono">
                      {JSON.stringify(runDetails.MAPPED_ATTRIBUTES_JSON, null, 2)}
                    </pre>
                  </div>
                )}
              </>
            ) : (
              <p className="text-gray-400 text-sm italic text-center py-8">Failed to load details</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ============ Batches Tab ============
const BatchesTab: React.FC<{
  batches: Batch[];
  total: number;
  isLoading: boolean;
  onRefresh: () => void;
  formatCost: (n: number) => string;
  formatTokens: (n: number) => string;
  formatDate: (d: string) => string;
  formatRelativeTime: (d: string) => string;
  getStatusColor: (s: string) => string;
}> = ({ batches, total, isLoading, onRefresh, formatCost, formatTokens, formatDate, formatRelativeTime, getStatusColor }) => {
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">{total} Batches</h2>
        <Button size="sm" variant="outline" icon={<RefreshCw size={12} />} onClick={onRefresh}>Refresh</Button>
      </div>
      
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-12 flex justify-center"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : batches.length === 0 ? (
          <p className="py-12 text-center text-gray-400 text-sm italic">No batches found</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {batches.map(batch => (
              <div key={batch.BATCH_ID}>
                <div 
                  className="px-6 py-4 hover:bg-gray-50/50 cursor-pointer flex items-center gap-4"
                  onClick={() => setExpandedBatch(expandedBatch === batch.BATCH_ID ? null : batch.BATCH_ID)}
                >
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${batch.STATUS === 'RUNNING' ? 'bg-amber-500 animate-pulse' : batch.STATUS === 'COMPLETED' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-gray-700">{batch.BATCH_ID}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getStatusColor(batch.STATUS)}`}>{batch.STATUS}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-[10px] text-gray-400">
                      <span>BU {batch.BUSINESS_UNIT_ID}</span>
                      <span>{formatRelativeTime(batch.STARTED_AT)}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <span className="text-xs font-bold text-gray-900">{batch.PROCESSED_ITEMS}/{batch.TOTAL_ITEMS}</span>
                      <div className="w-24 h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                        <div 
                          className={`h-full ${batch.STATUS === 'COMPLETED' ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                          style={{ width: `${batch.PROGRESS_PCT || 0}%` }}
                        />
                      </div>
                    </div>
                    
                    <div className="text-right w-20">
                      <span className="text-xs font-bold text-emerald-600">{batch.SUCCESS_COUNT}</span>
                      <span className="text-[10px] text-gray-400"> / </span>
                      <span className="text-xs font-bold text-rose-500">{batch.ERROR_COUNT}</span>
                    </div>
                    
                    <div className="text-right w-16">
                      <span className="text-xs font-bold text-gray-900">{formatCost(batch.TOTAL_COST || 0)}</span>
                    </div>
                    
                    {expandedBatch === batch.BATCH_ID ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                  </div>
                </div>
                
                {expandedBatch === batch.BATCH_ID && (
                  <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100">
                    <div className="grid grid-cols-4 gap-4 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Started</span>
                        <p className="font-medium text-gray-700 mt-1">{formatDate(batch.STARTED_AT)}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Completed</span>
                        <p className="font-medium text-gray-700 mt-1">{batch.COMPLETED_AT ? formatDate(batch.COMPLETED_AT) : '-'}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Total Tokens</span>
                        <p className="font-medium text-gray-700 mt-1">{formatTokens(batch.TOTAL_TOKENS || 0)}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Current Style</span>
                        <p className="font-medium text-gray-700 mt-1 font-mono">{batch.CURRENT_STYLE_ID || '-'}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============ System Tab ============
const SystemTab: React.FC<{
  jobs: any[];
  qualityRuns: any[];
  onRefreshJobs: () => void;
  onRefreshQuality: () => void;
}> = ({ jobs, qualityRuns, onRefreshJobs, onRefreshQuality }) => {
  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Jobs */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Activity size={16} className="text-indigo-500" />
            Background Jobs
          </h3>
          <button onClick={onRefreshJobs} className="p-1.5 hover:bg-gray-100 rounded"><RefreshCw size={14} className="text-gray-400" /></button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gray-50/80 sticky top-0">
              <tr className="text-[10px] font-black text-gray-400 uppercase">
                <th className="px-4 py-2 text-left">ID</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-center">Status</th>
                <th className="px-4 py-2 text-right">Attempts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {jobs.map(job => (
                <tr key={job.JOB_ID} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">#{job.JOB_ID}</td>
                  <td className="px-4 py-3 text-xs font-bold text-gray-700">{job.JOB_TYPE}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={job.STATUS?.toLowerCase()} /></td>
                  <td className="px-4 py-3 text-right text-xs text-gray-400">{job.ATTEMPT_COUNT}/{job.MAX_ATTEMPTS}</td>
                </tr>
              ))}
              {jobs.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-gray-400 text-sm italic">No jobs in queue</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Quality */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Shield size={16} className="text-emerald-500" />
            Quality Firewall
          </h3>
          <button onClick={onRefreshQuality} className="p-1.5 hover:bg-gray-100 rounded"><RefreshCw size={14} className="text-gray-400" /></button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gray-50/80 sticky top-0">
              <tr className="text-[10px] font-black text-gray-400 uppercase">
                <th className="px-4 py-2 text-left">Run</th>
                <th className="px-4 py-2 text-left">Scope</th>
                <th className="px-4 py-2 text-center">Result</th>
                <th className="px-4 py-2 text-right">Violations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {qualityRuns.map(run => (
                <tr key={run.RUN_ID} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">#{run.RUN_ID}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-bold text-gray-700">{run.SCOPE}</span>
                    <span className="text-[10px] text-gray-400 block">{run.SCOPE_ID}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {run.STATUS === 'pass' ? <CheckCircle2 size={16} className="text-emerald-500 mx-auto" /> : <AlertTriangle size={16} className="text-rose-500 mx-auto" />}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-gray-700">
                    {run.SUMMARY_JSON ? JSON.parse(run.SUMMARY_JSON).violations || 0 : 0}
                  </td>
                </tr>
              ))}
              {qualityRuns.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-gray-400 text-sm italic">No quality runs</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ============ KPI Card Component ============
const KPICard: React.FC<{
  icon: React.FC<any>;
  label: string;
  value: string;
  subValue: string;
  color: 'indigo' | 'emerald' | 'amber' | 'rose' | 'purple' | 'cyan';
}> = ({ icon: Icon, label, value, subValue, color }) => {
  const colorClasses = {
    indigo: 'from-indigo-500 to-indigo-600 shadow-indigo-200',
    emerald: 'from-emerald-500 to-emerald-600 shadow-emerald-200',
    amber: 'from-amber-500 to-amber-600 shadow-amber-200',
    rose: 'from-rose-500 to-rose-600 shadow-rose-200',
    purple: 'from-purple-500 to-purple-600 shadow-purple-200',
    cyan: 'from-cyan-500 to-cyan-600 shadow-cyan-200'
  };
  
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colorClasses[color]} flex items-center justify-center shadow-lg`}>
        <Icon size={22} className="text-white" />
      </div>
      <div>
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</span>
        <p className="text-2xl font-black text-gray-900 mt-0.5 tabular-nums">{value}</p>
        <p className="text-[10px] text-gray-400 font-medium mt-0.5">{subValue}</p>
      </div>
    </div>
  );
};
