/**
 * DashboardPage - styleIQ Workbench Initialization
 * 
 * UX Philosophy:
 * - Every click leads to expected outcome
 * - No dead-end buttons - everything is actionable
 * - Preview what user will see before navigation
 * - Clear visual hierarchy and progressive disclosure
 */

import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, CheckCircle, Layers, BarChart3, 
  Zap, Search, Clock, Sparkles, Plus, Upload, 
  ArrowRight, ChevronRight, Package, Image, Database,
  Eye, MousePointer, Filter, FolderUp, FileText
} from 'lucide-react';
import { fetchDashboardPulse } from '../src/api/client';
import { API_BASE_URL } from '../src/api/config';
import { HierarchyTree } from '../types';
import { Button, Card } from '../components/shared/UI';
import { BulkUploadModal } from '../components/onboarding/BulkUploadModal';
import { DraftsManager } from '../components/onboarding/DraftsManager';

interface DashboardPageProps {
  hierarchy: HierarchyTree | null;
  businessUnitId: number;
  onNavigate: (filters: { deptId?: string; classId?: string; step?: string }) => void;
  onSwitchTab: (tab: string) => void;
}

type ProductLifecycle = 'existing' | 'new' | null;
type WorkflowPhase = 'attributeme' | 'review' | null;

export const DashboardPage: React.FC<DashboardPageProps> = ({
  hierarchy,
  businessUnitId,
  onNavigate,
  onSwitchTab
}) => {
  const [pulse, setPulse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Wizard state
  const [lifecycle, setLifecycle] = useState<ProductLifecycle>(null);
  const [phase, setPhase] = useState<WorkflowPhase>(null);
  const [setupStep, setSetupStep] = useState<1 | 2>(1);
  
  // Bulk upload modal
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  
  // Drafts management view
  const [showDrafts, setShowDrafts] = useState(false);

  useEffect(() => {
    loadPulse();
  }, [businessUnitId]);

  const loadPulse = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchDashboardPulse(businessUnitId);
      if (response.success && response.data) {
        setPulse(response.data);
      } else {
        setError(response.error?.message || 'Failed to load pulse data');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  // UX: Compute what the user will see based on selections
  const getTargetFilter = () => {
    if (lifecycle === 'new') {
      return phase === 'attributeme' 
        ? { step: 'drafts', description: 'Local Drafts ready for AI enrichment' }
        : { step: 'drafts', status: 'with_ai', description: 'Drafts with AI suggestions to review' };
    }
    // existing products
    return phase === 'attributeme'
      ? { step: 'ready_for_ai', description: 'Styles ready for AI analysis' }
      : { step: 'ai_review', description: 'Styles with AI suggestions pending approval' };
  };

  // UX: Get the count for what user will see
  const getTargetCount = () => {
    if (!pulse?.funnel) return 0;
    const filter = getTargetFilter();
    const { funnel } = pulse;
    
    if (filter.step === 'drafts') return funnel.drafts || 0;
    if (filter.step === 'ready_for_ai') return funnel.ready_for_ai || 0;
    if (filter.step === 'ai_review') return funnel.ai_review || 0;
    return 0;
  };

  const handleContinueToSelection = () => {
    if (lifecycle) setSetupStep(2);
  };

  // UX: Navigate with clear intent
  const handleStartWorkflow = () => {
    const filter = getTargetFilter();
    onNavigate({ step: filter.step });
  };

  // UX: Quick stat click = immediate navigation with that filter
  const handleQuickStatClick = (cardId: string) => {
    // Map dashboard card IDs to ReviewGridPage workflow steps
    const stepMapping: Record<string, string> = {
      'all': 'all',                      // "All Products"
      'ready_for_ai': 'qualified',       // "Qualified" in ReviewGridPage
      'missing_images': 'missing_images', // "Need Images" - ReviewGridPage handles with has_images=false
      'ai_review': 'ai_review',          // "Awaiting My Review"
      'sync_ready': 'ready_to_sync',     // "Ready to Sync"
      'drafts': 'drafts'                 // "Local Drafts"
    };
    
    const step = stepMapping[cardId] || cardId;
    
    console.log('[Dashboard] Quick stat clicked:', { cardId, mappedStep: step });
    
    // onNavigate already switches to review_grid tab AND sets filters
    // Don't call onSwitchTab separately to avoid race condition
    onNavigate({ step });
  };

  const handleUploadCSV = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          const csvContent = event.target?.result as string;
          try {
            const response = await fetch(`${API_BASE_URL}/sync/upload-csv`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ business_unit_id: businessUnitId, csv: csvContent })
            });
            const result = await response.json();
            if (result.success) {
              alert(`Successfully uploaded ${result.data.count} styles!`);
              loadPulse();
              // UX: Auto-navigate to drafts after upload
              onNavigate({ step: 'drafts' });
            } else {
              alert(`Upload failed: ${result.error?.message || 'Unknown error'}`);
            }
          } catch (err: any) {
            alert(`Upload failed: ${err.message}`);
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-50 via-white to-pink-50 animate-in fade-in duration-500">
        <div className="w-12 h-12 border-4 border-purple-100 border-t-purple-600 rounded-full animate-spin mb-4"></div>
        <p className="text-xs font-bold text-purple-400 uppercase tracking-widest">Initializing styleIQ Workbench...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-pink-50">
        <Card className="max-w-md w-full text-center p-10">
          <AlertTriangle size={40} className="mx-auto mb-4 text-rose-500" />
          <h2 className="text-lg font-bold text-gray-900 uppercase">Connection Error</h2>
          <p className="text-sm text-gray-500 mt-2 mb-6">{error}</p>
          <Button onClick={loadPulse} variant="primary" className="w-full">Reconnect</Button>
        </Card>
      </div>
    );
  }

  const { funnel, cards, departmentFocus } = pulse;

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-purple-50/50 via-white to-pink-50/50">
      <div className="max-w-6xl mx-auto py-10 px-6">
        {/* Header */}
        <div className="text-center mb-10 animate-in fade-in slide-in-from-top-4 duration-700">
          <h1 className="text-4xl font-light text-gray-900 mb-2">
            Initialize <span className="font-bold text-purple-600">styleIQ</span> Workbench
          </h1>
          <p className="text-gray-500 font-medium">Prepare your fashion product attribution session</p>
        </div>

        {/* Pre-flight Checklist */}
        <div className="grid grid-cols-2 gap-6 mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
          <div className="bg-green-50/50 border border-green-100 rounded-xl p-5 flex items-start gap-4">
            <div className="bg-green-100 text-green-600 rounded-full p-1.5 flex-shrink-0">
              <CheckCircle size={16} strokeWidth={3} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-sm">1. Image Availability</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                styleIQ verified <span className="font-bold text-green-600">{funnel.ready_for_ai.toLocaleString()}</span> styles with images in Vision ERP.
              </p>
            </div>
          </div>
          <div className="bg-green-50/50 border border-green-100 rounded-xl p-5 flex items-start gap-4">
            <div className="bg-green-100 text-green-600 rounded-full p-1.5 flex-shrink-0">
              <CheckCircle size={16} strokeWidth={3} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-sm">2. Category Eligibility</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Scope: Apparel & Footwear. Merchandising rules loaded from Master Data.
              </p>
            </div>
          </div>
        </div>

        {/* Main Wizard Card */}
        <div className="bg-white rounded-3xl p-10 shadow-2xl shadow-purple-100 border border-purple-50 animate-in fade-in zoom-in-95 duration-500 delay-200">
          
          {/* Step 1: Lifecycle Selection */}
          {setupStep === 1 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <span className="bg-purple-600 text-white font-bold w-8 h-8 rounded-lg flex items-center justify-center text-sm shadow-lg shadow-purple-200">3</span>
                  <h2 className="text-xl font-bold text-gray-900">Select Product Lifecycle</h2>
                </div>
                <span className="text-[10px] font-bold text-purple-400 tracking-widest uppercase px-3 py-1 bg-purple-50 rounded-full border border-purple-100">
                  ⦿ REQUIRED
                </span>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-8">
                {/* Existing Products Card */}
                <button 
                  onClick={() => { setLifecycle('existing'); setSetupStep(2); }}
                  className={`group relative text-left p-6 rounded-2xl transition-all duration-300 border-2 ${
                    lifecycle === 'existing' 
                      ? 'border-purple-600 bg-white ring-4 ring-purple-50 shadow-xl' 
                      : 'border-gray-100 bg-white hover:border-purple-200 hover:shadow-lg'
                  }`}
                >
                  {lifecycle === 'existing' && (
                    <div className="absolute top-3 right-3 text-purple-600 bg-purple-50 rounded-full p-1">
                      <CheckCircle size={14} strokeWidth={3} />
                    </div>
                  )}
                  <div className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center ${
                    lifecycle === 'existing' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-400 group-hover:bg-purple-50 group-hover:text-purple-500'
                  } transition-colors`}>
                    <Package size={20} />
                  </div>
                  <h4 className="text-base font-bold text-gray-900 mb-1">Existing Products</h4>
                  <p className="text-sm text-gray-400 group-hover:text-gray-500 transition-colors mb-3">
                    Re-attribute styles already in Vision ERP
                  </p>
                  {/* UX: Show what they'll get */}
                  <div className="flex items-center gap-4 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={12} className="text-blue-500" />
                      <span className="text-xs font-bold text-blue-600">{funnel.ready_for_ai.toLocaleString()}</span>
                      <span className="text-[10px] text-gray-400">ready for AI</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Eye size={12} className="text-purple-500" />
                      <span className="text-xs font-bold text-purple-600">{funnel.ai_review.toLocaleString()}</span>
                      <span className="text-[10px] text-gray-400">to review</span>
                    </div>
                  </div>
                </button>

                {/* New Products Card - Opens upload directly */}
                <div 
                  onClick={() => { setLifecycle('new'); setShowBulkUpload(true); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') { setLifecycle('new'); setShowBulkUpload(true); } }}
                  className={`group relative text-left p-6 rounded-2xl transition-all duration-300 border-2 cursor-pointer ${
                    lifecycle === 'new' 
                      ? 'border-purple-600 bg-white ring-4 ring-purple-50 shadow-xl' 
                      : 'border-gray-100 bg-white hover:border-purple-200 hover:shadow-lg'
                  }`}
                >
                  {lifecycle === 'new' && (
                    <div className="absolute top-3 right-3 text-purple-600 bg-purple-50 rounded-full p-1">
                      <CheckCircle size={14} strokeWidth={3} />
                    </div>
                  )}
                  <div className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center ${
                    lifecycle === 'new' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-400 group-hover:bg-purple-50 group-hover:text-purple-500'
                  } transition-colors`}>
                    <Upload size={20} />
                  </div>
                  <h4 className="text-base font-bold text-gray-900 mb-1">New Products</h4>
                  <p className="text-sm text-gray-400 group-hover:text-gray-500 transition-colors mb-3">
                    Click to upload images
                  </p>
                  {/* UX: Show drafts count */}
                  <div className="flex items-center gap-4 pt-3 border-t border-gray-100">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowDrafts(true); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 -ml-2 rounded-lg transition-colors ${
                        funnel.drafts > 0 
                          ? 'bg-amber-100 hover:bg-amber-200 border border-amber-300' 
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <FileText size={14} className={funnel.drafts > 0 ? 'text-amber-600' : 'text-gray-400'} />
                      <span className={`text-sm font-bold ${funnel.drafts > 0 ? 'text-amber-700' : 'text-gray-500'}`}>
                        {funnel.drafts > 0 ? `${funnel.drafts} Draft${funnel.drafts > 1 ? 's' : ''}` : 'No Drafts'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Configure Workflow Phase button removed for smoother UX - auto-advances on card click */}
            </div>
          )}

          {/* Step 2: Workflow Phase Selection */}
          {setupStep === 2 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => { setSetupStep(1); setPhase(null); }}
                    className="text-gray-400 hover:text-purple-600 transition-colors p-1"
                  >
                    <ArrowRight size={14} className="rotate-180" />
                  </button>
                  <span className="bg-purple-600 text-white font-bold w-8 h-8 rounded-lg flex items-center justify-center text-sm shadow-lg shadow-purple-200">4</span>
                  <h2 className="text-xl font-bold text-gray-900">Select Workflow Phase</h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border ${
                    lifecycle === 'existing' 
                      ? 'text-purple-600 bg-purple-50 border-purple-100' 
                      : 'text-amber-600 bg-amber-50 border-amber-100'
                  }`}>
                    {lifecycle === 'existing' ? '📦 Existing Products' : '✨ New Products'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-6">
                {/* AttributeMe Card */}
                <button 
                  onClick={() => {
                    setPhase('attributeme');
                    // UX: Auto-launch if possible
                    const filter = lifecycle === 'new' 
                      ? { step: 'drafts' }
                      : { step: 'ready_for_ai' };
                    onNavigate(filter);
                  }}
                  className={`group relative text-left p-6 rounded-2xl transition-all duration-300 border-2 ${
                    phase === 'attributeme' 
                      ? 'border-pink-500 bg-gradient-to-br from-pink-50/50 to-purple-50/50 ring-4 ring-pink-50 shadow-xl' 
                      : 'border-gray-100 bg-white hover:border-pink-200 hover:shadow-lg'
                  }`}
                >
                  {phase === 'attributeme' && (
                    <div className="absolute top-3 right-3 text-pink-500 bg-pink-50 rounded-full p-1">
                      <CheckCircle size={14} strokeWidth={3} />
                    </div>
                  )}
                  <div className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center ${
                    phase === 'attributeme' ? 'bg-gradient-to-br from-pink-500 to-purple-600 text-white' : 'bg-gray-100 text-gray-400 group-hover:bg-pink-50 group-hover:text-pink-500'
                  } transition-colors`}>
                    <Sparkles size={20} />
                  </div>
                  <h4 className="text-base font-bold text-gray-900 mb-1">AttributeMe</h4>
                  <p className="text-sm text-gray-400 group-hover:text-gray-500 transition-colors mb-3">
                    Extract AI insights from product imagery
                  </p>
                  {/* UX: Preview what they'll see */}
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="flex items-center gap-2 mb-1">
                      <MousePointer size={12} className="text-pink-500" />
                      <span className="text-[10px] font-bold text-gray-500 uppercase">You'll see:</span>
                    </div>
                    <div className="text-sm font-bold text-gray-900">
                      {lifecycle === 'existing' ? funnel.ready_for_ai.toLocaleString() : funnel.drafts.toLocaleString()} styles
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {lifecycle === 'existing' ? 'Ready for AI enrichment' : 'Local drafts to enrich'}
                    </div>
                  </div>
                </button>

                {/* Review & Finalize Card */}
                <button 
                  onClick={() => {
                    setPhase('review');
                    // UX: Auto-launch
                    const filter = lifecycle === 'new'
                      ? { step: 'drafts', status: 'with_ai' }
                      : { step: 'ai_review' };
                    onNavigate({ step: filter.step });
                  }}
                  className={`group relative text-left p-6 rounded-2xl transition-all duration-300 border-2 ${
                    phase === 'review' 
                      ? 'border-purple-600 bg-white ring-4 ring-purple-50 shadow-xl' 
                      : 'border-gray-100 bg-white hover:border-purple-200 hover:shadow-lg'
                  }`}
                >
                  {phase === 'review' && (
                    <div className="absolute top-3 right-3 text-purple-600 bg-purple-50 rounded-full p-1">
                      <CheckCircle size={14} strokeWidth={3} />
                    </div>
                  )}
                  <div className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center ${
                    phase === 'review' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-400 group-hover:bg-purple-50 group-hover:text-purple-500'
                  } transition-colors`}>
                    <CheckCircle size={20} />
                  </div>
                  <h4 className="text-base font-bold text-gray-900 mb-1">Review & Finalize</h4>
                  <p className="text-sm text-gray-400 group-hover:text-gray-500 transition-colors mb-3">
                    Approve AI suggestions and sync to ERP
                  </p>
                  {/* UX: Preview what they'll see */}
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="flex items-center gap-2 mb-1">
                      <MousePointer size={12} className="text-purple-500" />
                      <span className="text-[10px] font-bold text-gray-500 uppercase">You'll see:</span>
                    </div>
                    <div className="text-sm font-bold text-gray-900">
                      {funnel.ai_review.toLocaleString()} styles
                    </div>
                    <div className="text-[10px] text-gray-400">
                      With AI suggestions pending approval
                    </div>
                  </div>
                </button>
              </div>

              {/* UX: Final preview before launch */}
              {phase && (
                <div className="mb-6 p-4 bg-purple-50/50 rounded-xl border border-purple-100 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Filter size={16} className="text-purple-500" />
                      <div>
                        <span className="text-xs font-bold text-purple-700">Ready to launch:</span>
                        <span className="ml-2 text-sm text-gray-700">{getTargetFilter().description}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-black text-purple-600">{getTargetCount().toLocaleString()}</div>
                      <div className="text-[10px] text-gray-400 uppercase">styles</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-center gap-3">
                {lifecycle === 'new' && (
                  <button 
                    onClick={handleUploadCSV}
                    className="px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
                  >
                    <Upload size={16} />
                    Upload CSV First
                  </button>
                )}
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-4 py-2 rounded-lg border border-gray-100">
                  Select a phase to launch workspace
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick Stats - CLICKABLE to navigate directly */}
        <div className="mt-10 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={14} className="text-amber-500" />
            <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Quick Access • Click to View</h3>
          </div>
          <div className="grid grid-cols-6 gap-3">
            {[
              // Data Quality Group
              { id: 'all', label: 'All Products', value: funnel.total, icon: Database, color: 'gray' },
              { id: 'ready_for_ai', label: 'Qualified', value: funnel.ready_for_ai, icon: Sparkles, color: 'blue' },
              { id: 'missing_images', label: 'Need Images', value: funnel.missing_images, icon: Image, color: 'rose' },
              // Workflow Group  
              { id: 'ai_review', label: 'Awaiting My Review', value: funnel.ai_review, icon: Eye, color: 'purple' },
              { id: 'sync_ready', label: 'Ready to Sync', value: funnel.sync_ready, icon: CheckCircle, color: 'emerald' },
              // Drafts Group
              { id: 'drafts', label: 'Local Drafts', value: funnel.drafts, icon: Plus, color: 'amber' },
            ].map((stat) => {
              const colorClasses: Record<string, string> = {
                gray: 'hover:border-gray-300 hover:bg-gray-50',
                amber: 'hover:border-amber-300 hover:bg-amber-50',
                blue: 'hover:border-blue-300 hover:bg-blue-50',
                purple: 'hover:border-purple-300 hover:bg-purple-50',
                emerald: 'hover:border-emerald-300 hover:bg-emerald-50',
                rose: 'hover:border-rose-300 hover:bg-rose-50',
              };
              const iconColors: Record<string, string> = {
                gray: 'text-gray-400',
                amber: 'text-amber-500',
                blue: 'text-blue-500',
                purple: 'text-purple-500',
                emerald: 'text-emerald-500',
                rose: 'text-rose-500',
              };
              return (
                <button
                  key={stat.id}
                  onClick={() => handleQuickStatClick(stat.id)}
                  className={`bg-white/80 backdrop-blur border border-gray-100 rounded-xl p-3 text-center transition-all cursor-pointer group ${colorClasses[stat.color]}`}
                >
                  <stat.icon size={16} className={`mx-auto mb-1.5 ${iconColors[stat.color]} group-hover:scale-110 transition-transform`} />
                  <div className="text-lg font-black text-gray-900 group-hover:text-gray-700">{stat.value.toLocaleString()}</div>
                  <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{stat.label}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Department Quick Access */}
        {departmentFocus && departmentFocus.length > 0 && (
          <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-400">
            <div className="flex items-center gap-2 mb-4">
              <Layers size={14} className="text-gray-400" />
              <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Browse by Department</h3>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {departmentFocus.slice(0, 8).map((dept: any) => (
                <button
                  key={dept.id}
                  onClick={() => onNavigate({ deptId: dept.id })}
                  className="bg-white/80 backdrop-blur border border-gray-100 rounded-xl p-3 flex items-center justify-between hover:border-purple-300 hover:shadow-sm transition-all text-left group"
                >
                  <div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tight leading-none mb-0.5">{dept.id}</p>
                    <h4 className="text-xs font-bold text-gray-900 truncate max-w-[100px]">{dept.name}</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    {(dept.readyForAi > 0 || dept.aiReview > 0 || dept.missingImages > 0) && (
                      <div className="flex flex-col items-end gap-0.5">
                        {dept.readyForAi > 0 && (
                          <span className="text-[9px] font-bold text-blue-600">{dept.readyForAi} ready</span>
                        )}
                        {dept.aiReview > 0 && (
                          <span className="text-[9px] font-bold text-purple-600">{dept.aiReview} review</span>
                        )}
                        {dept.missingImages > 0 && (
                          <span className="text-[9px] font-bold text-rose-500">{dept.missingImages} missing</span>
                        )}
                      </div>
                    )}
                    <ArrowRight size={12} className="text-gray-300 group-hover:text-purple-600 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Drafts Manager Modal */}
      {showDrafts && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6"
          onClick={() => setShowDrafts(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <DraftsManager 
              businessUnitId={businessUnitId}
              hierarchy={hierarchy}
              onClose={() => setShowDrafts(false)}
              onDraftSelect={(draft) => {
                console.log('Selected draft:', draft);
              }}
            />
          </div>
        </div>
      )}
      
      {/* Bulk Upload Modal */}
      <BulkUploadModal
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        businessUnitId={businessUnitId}
        onBatchStarted={(batchId) => {
          console.log('Batch started:', batchId);
          setShowBulkUpload(false);
          // Refresh drafts count and show drafts
          loadPulse();
          setShowDrafts(true);
        }}
      />
    </div>
  );
};
