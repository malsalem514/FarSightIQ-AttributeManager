/**
 * StyleAuditDrawer - Detail Inspector
 * 
 * "Professional Vanilla" Audit Experience.
 */

import React, { useState, useEffect } from 'react';
import { 
  X, ChevronRight, CheckCircle2, AlertCircle, 
  Sparkles, Edit2, ChevronDown, Search, Loader2, 
  Trash2, Target, Info, Activity, Database, User,
  Type, AlignLeft, Wand2, Image as ImageIcon,
  LayoutGrid, Share2, Copy, RefreshCcw
} from 'lucide-react';
import { ReviewGridRow, AttributeComparison, MediaItem } from '../../types';
import { fetchAttributeValues, rewriteDescription } from '../../src/api/client';
import { API_BASE_URL } from '../../src/api/config';
import { Button, StatusBadge, Card, ConfidenceBadge } from '../shared/UI';
import { ImageLightbox } from '../shared/ImageLightbox';

interface StyleAuditDrawerProps {
  style: ReviewGridRow | null;
  businessUnitId: number;
  onClose: () => void;
  onUpdateAttribute: (styleId: string, attrId: string, value: string) => void;
  onFocusUpdate?: (styleId: string, focusedAttributes: string[]) => void;
  focusedAttributes?: string[];
}

/** Track failed images to prevent repeated load attempts */
const failedGalleryImages = new Set<string>();

const MediaGallery: React.FC<{ media: MediaItem[]; styleName?: string }> = ({ media, styleName }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const [imageLoading, setImageLoading] = useState<Set<number>>(new Set([0])); // Start with first image loading
  
  if (!media || media.length === 0) return (
    <div className="w-full aspect-square bg-gray-50 rounded-lg flex flex-col items-center justify-center text-gray-300 border border-dashed border-gray-200">
      <ImageIcon size={48} strokeWidth={1} />
      <span className="text-[10px] font-bold uppercase mt-2">No Images Available</span>
    </div>
  );

  const getFullUrl = (url?: string) => {
    if (!url) return undefined;
    // Skip URLs that have already failed
    if (failedGalleryImages.has(url)) return undefined;
    if (url.startsWith('http')) return url;
    
    // Ensure we use the backend origin
    const backendOrigin = API_BASE_URL.replace('/api', '');
    
    // CASE 1: Already has full /api/images path
    if (url.startsWith('/api/images/')) return `${backendOrigin}${url}`;
    
    // CASE 2: Old /images/ format
    if (url.startsWith('/images/')) return `${API_BASE_URL}${url}`;
    
    // CASE 3: Raw filename
    if (!url.startsWith('/')) return `${API_BASE_URL}/images/${url}`;
    
    return url;
  };
  
  const handleImageLoad = (idx: number) => {
    setImageLoading(prev => { const next = new Set(prev); next.delete(idx); return next; });
    setImageErrors(prev => { const next = new Set(prev); next.delete(idx); return next; });
  };
  
  const handleImageError = (idx: number, url: string) => {
    setImageLoading(prev => { const next = new Set(prev); next.delete(idx); return next; });
    setImageErrors(prev => new Set(prev).add(idx));
    if (url) failedGalleryImages.add(url);
  };
  
  const activeUrl = getFullUrl(media[activeIdx].url);
  const hasActiveError = imageErrors.has(activeIdx);
  const isActiveLoading = imageLoading.has(activeIdx);

  return (
    <div className="space-y-3" data-testid="audit-gallery">
      <div 
        className="aspect-square w-full rounded-lg overflow-hidden border border-gray-100 bg-gray-50 relative group shadow-sm cursor-zoom-in"
        onClick={() => !hasActiveError && setIsLightboxOpen(true)}
      >
        {/* Loading state */}
        {isActiveLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 animate-pulse z-10">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}
        
        {hasActiveError || !activeUrl ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-amber-50 text-amber-500">
            <ImageIcon size={48} strokeWidth={1} className="opacity-50" />
            <span className="text-[10px] font-bold uppercase mt-2">Unavailable</span>
          </div>
        ) : (
          <img 
            src={activeUrl} 
            className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${isActiveLoading ? 'opacity-0' : 'opacity-100'}`}
            alt="" 
            data-testid="gallery-main-image"
            onLoad={() => handleImageLoad(activeIdx)}
            onError={() => handleImageError(activeIdx, media[activeIdx].url)}
            loading="lazy"
          />
        )}
        
        {!hasActiveError && !isActiveLoading && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-black/40 backdrop-blur-md rounded text-[8px] font-black text-white uppercase tracking-widest">
            {media[activeIdx].source || 'MERCH'} / {media[activeIdx].type}
          </div>
        )}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 px-2 py-1.5 bg-black/20 backdrop-blur-md rounded-full">
          {media.map((_, i) => (
            <div 
              key={i} 
              className={`w-1.5 h-1.5 rounded-full transition-all ${i === activeIdx ? 'bg-white scale-125' : imageErrors.has(i) ? 'bg-amber-400' : 'bg-white/40'}`} 
            />
          ))}
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar no-scrollbar" style={{ scrollbarWidth: 'none' }}>
        {media.map((m, i) => {
          const thumbUrl = getFullUrl(m.url);
          const hasThumbError = imageErrors.has(i);
          
          return (
            <button 
              key={i} 
              onClick={() => setActiveIdx(i)}
              className={`flex-shrink-0 w-14 h-14 rounded-md border-2 transition-all overflow-hidden ${i === activeIdx ? 'border-indigo-600 shadow-sm scale-95' : hasThumbError ? 'border-amber-300 opacity-60' : 'border-transparent opacity-60 hover:opacity-100'}`}
              data-testid={`gallery-thumb-${i}`}
            >
              {hasThumbError || !thumbUrl ? (
                <div className="w-full h-full flex items-center justify-center bg-amber-50 text-amber-400">
                  <ImageIcon size={16} />
                </div>
              ) : (
                <img 
                  src={thumbUrl} 
                  className="w-full h-full object-cover" 
                  alt=""
                  onError={() => handleImageError(i, m.url)}
                  loading="lazy"
                />
              )}
            </button>
          );
        })}
      </div>
      {activeUrl && !hasActiveError && (
        <ImageLightbox 
          isOpen={isLightboxOpen} 
          onClose={() => setIsLightboxOpen(false)} 
          src={activeUrl} 
          alt={`${styleName || 'Style'} - Image ${activeIdx + 1}`}
        />
      )}
    </div>
  );
};

const SEOPreview: React.FC<{ styleId: string; businessUnitId: number }> = ({ styleId, businessUnitId }) => {
  const [jsonLd, setJsonLd] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSEOData = async () => {
    setIsLoading(true);
    try {
      const [ldRes, statusRes] = await Promise.all([
        fetch(`${API_BASE_URL}/export/seo/productgroup/${styleId}?business_unit_id=${businessUnitId}`, { headers: { 'X-TENANT-ID': 'JDS_MPRD' } }),
        fetch(`${API_BASE_URL}/export/seo/status/${styleId}?business_unit_id=${businessUnitId}`, { headers: { 'X-TENANT-ID': 'JDS_MPRD' } })
      ]);
      setJsonLd(await ldRes.json());
      const s = await statusRes.json();
      if (s.success) setStatus(s.data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchSEOData(); }, [styleId]);

  return (
    <div className="space-y-4" data-testid="seo-preview-panel">
      <div className="bg-gray-900 rounded-lg p-4 font-mono text-[10px] text-gray-300 relative overflow-hidden group">
        <div className="flex items-center justify-between mb-2 border-b border-white/10 pb-2">
          <span className="text-gray-500 uppercase tracking-widest font-black">schema.org JSON-LD</span>
          <button 
            onClick={() => navigator.clipboard.writeText(JSON.stringify(jsonLd, null, 2))}
            className="p-1 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
            title="Copy to Clipboard"
          >
            <Copy size={12} />
          </button>
        </div>
        <pre className="max-h-48 overflow-y-auto custom-scrollbar-dark whitespace-pre-wrap">
          {isLoading ? 'Generating Enterprise Metadata...' : JSON.stringify(jsonLd, null, 2)}
        </pre>
      </div>

      <div className={`p-4 rounded-lg border flex items-start gap-3 transition-colors ${status?.seo_ready === 'Y' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-rose-50 border-rose-100 text-rose-800'}`}>
        {status?.seo_ready === 'Y' ? <CheckCircle2 size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}
        <div>
          <p className="text-xs font-black uppercase tracking-tight">
            SEO Readiness: {status?.seo_ready === 'Y' ? 'Validated' : 'Action Required'}
          </p>
          {status?.missing_reasons?.length > 0 && (
            <ul className="mt-2 space-y-1">
              {status.missing_reasons.map((r: string, i: number) => (
                <li key={i} className="text-[10px] opacity-80 list-disc ml-3">{r}</li>
              ))}
            </ul>
          )}
        </div>
        <button 
          onClick={fetchSEOData}
          className="ml-auto p-1.5 hover:bg-black/5 rounded transition-colors"
          title="Recompute Status"
        >
          <RefreshCcw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  );
};

export const StyleAuditDrawer: React.FC<StyleAuditDrawerProps> = ({ 
  style, 
  businessUnitId,
  onClose,
  onUpdateAttribute,
  onFocusUpdate,
  focusedAttributes = []
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [activeSubTab, setActiveSubTab] = useState<'audit' | 'seo'>('audit');
  const [isRewriting, setIsRewriting] = useState(false);
  const [isPromoting, setIsPromoting] = useState(false);
  
  if (!style) return null;

  const isDraft = ['draft', 'ready', 'promoted', 'error'].includes(style.status);
  const isPromotable = style.status === 'ready' || (isDraft && style.overall_confidence === 100); // reuse confidence for completion %

  const handlePromote = async () => {
    setIsPromoting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/attributes/review/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_unit_id: businessUnitId,
          style_id: style.style_id
        })
      });
      const result = await response.json();
      if (result.success) {
        onClose();
        // Trigger a refresh event or similar
        window.dispatchEvent(new CustomEvent('musa:draft-promoted', { detail: { styleId: style.style_id } }));
      }
    } catch (err) {
      console.error('Promotion failed', err);
    } finally {
      setIsPromoting(false);
    }
  };

  const handleRewrite = async (tone: 'professional' | 'engaging' | 'seo' | 'concise') => {
    setIsRewriting(true);
    try {
      // Collect current attributes for context
      const attrs: Record<string, string> = {};
      style.grouped_attributes?.forEach(g => {
        g.attributes.forEach(a => {
          if (a.selected_value) attrs[a.name] = a.selected_value;
        });
      });

      const res = await rewriteDescription(
        businessUnitId,
        style.style_id,
        attrs,
        tone,
        style.style_name
      );

      if (res.success && res.data) {
        onUpdateAttribute(style.style_id, 'SHORT_DESCRIPTION', res.data.shortDescription);
        onUpdateAttribute(style.style_id, 'LONG_DESCRIPTION', res.data.longDescription);
      }
    } catch (err) {
      console.error('Rewrite failed', err);
    } finally {
      setIsRewriting(false);
    }
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const handleToggleFocus = (typeId: string) => {
    const newFocus = focusedAttributes.includes(typeId)
      ? focusedAttributes.filter(id => id !== typeId)
      : [...focusedAttributes, typeId];
    
    if (onFocusUpdate) {
      onFocusUpdate(style.style_id, newFocus);
    }
  };

  const totalMandatory = style.grouped_attributes?.reduce((acc, g) => 
    acc + g.attributes.filter(a => a.mandatory === 'Y').length, 0) || 0;
  
  const filledMandatory = style.grouped_attributes?.reduce((acc, g) => 
    acc + g.attributes.filter(a => a.mandatory === 'Y' && a.selected_value).length, 0) || 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end overflow-hidden pointer-events-none">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px] pointer-events-auto transition-opacity duration-300"
        onClick={onClose}
      />
      
      {/* Drawer Container */}
      <div 
        data-testid="audit-drawer"
        className="relative w-full max-w-2xl bg-white shadow-2xl pointer-events-auto flex flex-col h-full transform transition-transform duration-300 ease-out translate-x-0 animate-in slide-in-from-right"
      >
        
        {/* Header Section */}
        <header className="px-8 py-6 border-b border-gray-100 bg-white flex-shrink-0">
          <div className="flex items-start justify-between mb-6">
            <div className="flex flex-col gap-4 w-full">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-900 tracking-tight" data-testid="audit-style-id">{style.style_id}</span>
                  <StatusBadge status={style.status} data-testid="audit-status" />
                </div>
                <button 
                  onClick={onClose}
                  className="p-1.5 hover:bg-gray-100 rounded text-gray-400 transition-colors"
                  data-testid="close-audit-btn"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="flex gap-6">
                <div className="w-48 flex-shrink-0">
                  <MediaGallery media={style.media || []} styleName={style.style_name} />
                </div>
                
                <div className="flex-1 min-w-0 pt-2">
                  <h2 className="text-2xl font-black text-gray-900 tracking-tight leading-tight mb-1" data-testid="audit-style-name">
                    {style.style_name || 'Unnamed Style'}
                  </h2>
                  <div className="flex items-center gap-1 text-xs font-bold text-gray-400 uppercase tracking-wider" data-testid="audit-hierarchy">
                    <span data-testid="audit-dept">{style.dept_name}</span>
                    <ChevronRight size={14} className="opacity-40" />
                    <span data-testid="audit-class" className="text-gray-500">{style.class_name}</span>
                  </div>
                  
                  <div className="mt-6 grid grid-cols-2 gap-3" data-testid="audit-kpis">
                    <div className="bg-gray-50 border border-gray-100 rounded p-3" data-testid="audit-kpi-completeness">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Completeness</p>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xl font-black text-gray-900" data-testid="audit-kpi-filled">{filledMandatory}</span>
                        <span className="text-xs text-gray-400">/ {totalMandatory} Required</span>
                      </div>
                    </div>
                    <div className="bg-gray-50 border border-gray-100 rounded p-3" data-testid="audit-kpi-iq">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Data Quality</p>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xl font-black text-gray-700" data-testid="audit-kpi-completeness">{style.overall_confidence}%</span>
                        <span className="text-xs text-gray-400 font-medium">Complete</span>
                      </div>
                    </div>
                    {/* AI Status Badge */}
                    {(() => {
                      const hasAiData = style.grouped_attributes?.some(g => 
                        g.attributes.some(a => a.ai_value && a.ai_value.trim().length > 0)
                      ) || style.status === 'review' || style.status === 'approved';
                      return (
                        <div className={`border rounded p-3 ${hasAiData ? 'bg-indigo-50 border-indigo-200' : 'bg-amber-50 border-amber-200'}`} data-testid="audit-kpi-ai-status">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">AI Status</p>
                          <div className="flex items-center gap-2">
                            {hasAiData ? (
                              <>
                                <Sparkles size={16} className="text-indigo-600" />
                                <span className="text-sm font-black text-indigo-600">Enriched</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle size={16} className="text-amber-600" />
                                <span className="text-sm font-bold text-amber-700">Not Enriched</span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Audit Workspace */}
        <div className="flex items-center gap-1 px-8 border-b border-gray-100 flex-shrink-0">
          <button 
            onClick={() => setActiveSubTab('audit')}
            className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${activeSubTab === 'audit' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            Audit Ledger
          </button>
          <button 
            onClick={() => setActiveSubTab('seo')}
            className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${activeSubTab === 'seo' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            SEO Contracts
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-gray-50/20" data-testid="audit-ledger-container">
          {activeSubTab === 'seo' ? (
            <SEOPreview styleId={style.style_id} businessUnitId={businessUnitId} />
          ) : (
            <React.Fragment>
              {/* ERP Setup Section (Drafts Only) */}
              {isDraft && (
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 mb-4 shadow-sm" data-testid="audit-erp-setup">
                  <div className="flex items-center gap-2 mb-3">
                    <Database size={16} className="text-amber-600" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-700">ERP Setup (Mandatory)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Vendor</label>
                      <input 
                        placeholder="Enter Vendor ID..." 
                        value={style.vendor_id || ''} 
                        onChange={(e) => onUpdateAttribute(style.style_id, 'VENDOR_ID', e.target.value)}
                        className="w-full h-8 px-3 text-xs border border-gray-200 rounded-lg outline-none focus:border-purple-400"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Size Group</label>
                      <input 
                        placeholder="e.g. ADULT_STD" 
                        value={style.size_group_id || ''} 
                        onChange={(e) => onUpdateAttribute(style.style_id, 'SIZE_GROUP_ID', e.target.value)}
                        className="w-full h-8 px-3 text-xs border border-gray-200 rounded-lg outline-none focus:border-purple-400"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* AI Content Assistant (V014) */}
              <div className="bg-indigo-600 rounded-lg p-4 text-white shadow-lg overflow-hidden relative">
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-3">
                    <Wand2 size={16} className="text-indigo-200" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-100">AI Content Assistant</span>
                  </div>
                  <h3 className="text-sm font-bold mb-1">Rewrite Product Story</h3>
                  <p className="text-[11px] text-indigo-100/80 mb-4 leading-relaxed">
                    Use current attributes to generate professional copy for web and mobile.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(['professional', 'engaging', 'seo', 'concise'] as const).map(tone => (
                      <button
                        key={tone}
                        disabled={isRewriting}
                        onClick={() => handleRewrite(tone)}
                        className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded text-[10px] font-bold uppercase tracking-tight transition-all disabled:opacity-50"
                      >
                        {isRewriting ? <Loader2 size={10} className="animate-spin" /> : tone}
                      </button>
                    ))}
                  </div>
                </div>
                <Sparkles className="absolute -right-4 -bottom-4 text-white/5 w-24 h-24 rotate-12" />
              </div>

              <div className="flex items-center gap-2 mb-2 px-2">
                <Info size={14} className="text-gray-400" />
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Audit Ledger</span>
              </div>

              {/* AI Enrichment Status Banner */}
              {(() => {
                const hasAiAttributes = style.grouped_attributes?.some(g => 
                  g.attributes.some(a => a.ai_value && a.ai_value.trim().length > 0)
                );
                const isEnriched = style.status === 'review' || style.status === 'approved' || hasAiAttributes;
                
                return (
                  <div className={`mb-4 p-4 rounded-lg border ${
                    isEnriched 
                      ? 'bg-indigo-50 border-indigo-200' 
                      : 'bg-amber-50 border-amber-200'
                  }`} data-testid="ai-enrichment-status-banner">
                    <div className="flex items-start gap-3">
                      {isEnriched ? (
                        <>
                          <div className="p-2 bg-indigo-100 rounded-lg">
                            <Sparkles size={16} className="text-indigo-600" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-indigo-900">AI Enriched</h4>
                            <p className="text-xs text-indigo-700 mt-0.5">
                              This product has AI-suggested attributes. Review the "AI SUGG" column below.
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="p-2 bg-amber-100 rounded-lg">
                            <AlertCircle size={16} className="text-amber-600" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-amber-900">Not Yet Enriched</h4>
                            <p className="text-xs text-amber-700 mt-0.5">
                              This product hasn't been processed by AI. Select it and click "Enrich with AI" to generate suggestions.
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

              {!style.grouped_attributes || style.grouped_attributes.length === 0 ? (
                <Card className="flex flex-col items-center justify-center py-16 text-center" data-testid="audit-no-attributes">
                  <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-4 text-gray-300">
                    <Search size={24} />
                  </div>
                  <p className="text-sm font-bold text-gray-900">No attribute definitions</p>
                  <p className="text-xs text-gray-500 mt-1">Please verify hierarchy rules for this class.</p>
                </Card>
              ) : (
                style.grouped_attributes?.map((group) => {
                  const isExpanded = expandedGroups[group.group_id] ?? true;
                  return (
                    <div key={group.group_id} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden transition-all" data-testid={`audit-group-${group.group_id}`}>
                      <button 
                        onClick={() => toggleGroup(group.group_id)}
                        className="w-full px-5 py-3 flex items-center justify-between bg-white hover:bg-gray-50 transition-colors border-b border-gray-100"
                        data-testid={`audit-group-toggle-${group.group_id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-1 rounded ${isExpanded ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 text-gray-400'}`}>
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </div>
                          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-tight" data-testid={`audit-group-name-${group.group_id}`}>{group.group_name}</h3>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-20 h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-indigo-500"
                              style={{ width: `${(group.completeness.filled / group.completeness.total) * 100}%` }}
                              data-testid={`audit-group-bar-${group.group_id}`}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-gray-400 tabular-nums" data-testid={`audit-group-completeness-${group.group_id}`}>
                            {group.completeness.filled}/{group.completeness.total}
                          </span>
                        </div>
                      </button>
                      
                      {isExpanded && (
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse" data-testid={`audit-group-table-${group.group_id}`}>
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                <th className="w-10 px-4 py-2 text-center">AI</th>
                                <th className="px-4 py-2 text-left">Property</th>
                                <th className="px-4 py-2 text-center">ERP</th>
                                <th className="px-4 py-2 text-center">AI SUGG</th>
                                <th className="w-24 px-4 py-2 text-center">Quick Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50" data-testid={`audit-group-tbody-${group.group_id}`}>
                              {group.attributes.map((attr) => (
                                <AuditAttributeRow 
                                  key={attr.type_id} 
                                  attribute={attr} 
                                  businessUnitId={businessUnitId}
                                  isFocused={focusedAttributes.includes(attr.type_id)}
                                  onToggleFocus={() => handleToggleFocus(attr.type_id)}
                                  onUpdate={(val) => onUpdateAttribute(style.style_id, attr.type_id, val)}
                                />
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </React.Fragment>
          )}
        </div>

        {/* Global Action Footer */}
        <footer className="px-8 py-5 border-t border-gray-100 bg-gray-50 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 text-gray-400">
            <Info size={14} />
            <span className="text-[11px] font-semibold">
              {isDraft ? 'Drafts are local until promoted to production.' : 'Changes are staged until synchronization.'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={onClose} variant="outline" size="sm" data-testid="cancel-audit-btn">Cancel</Button>
            {isDraft ? (
              <Button 
                onClick={handlePromote} 
                variant="primary" 
                size="sm" 
                disabled={!isPromotable || isPromoting}
                isLoading={isPromoting}
                icon={<Activity size={14} />} 
                data-testid="promote-draft-btn"
              >
                Promote to ERP
              </Button>
            ) : (
              <Button onClick={onClose} variant="primary" size="sm" icon={<CheckCircle2 size={14} />} data-testid="commit-audit-btn">Verify & Commit</Button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};

const AuditAttributeRow: React.FC<{ 
  attribute: AttributeComparison; 
  businessUnitId: number;
  onUpdate: (val: string) => void;
  isFocused?: boolean;
  onToggleFocus?: () => void;
}> = ({ attribute, businessUnitId, onUpdate, isFocused, onToggleFocus }) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isEditingText, setIsEditingText] = useState(false);
  const [editValue, setEditValue] = useState(attribute.selected_value || '');
  const [availableValues, setAvailableValues] = useState<any[]>([]);
  const [loadingValues, setLoadingValues] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const isMandatory = attribute.mandatory === 'Y';
  const isFilled = !!attribute.selected_value;
  const isDescription = attribute.type_id.includes('DESCRIPTION');

  const loadValues = async () => {
    if (isDescription) {
      setIsEditingText(!isEditingText);
      setEditValue(attribute.selected_value || '');
      return;
    }
    if (availableValues.length > 0) {
      setIsPickerOpen(!isPickerOpen);
      return;
    }
    setLoadingValues(true);
    setIsPickerOpen(true);
    try {
      const res = await fetchAttributeValues(businessUnitId, attribute.type_id);
      if (res.success) setAvailableValues(res.data || []);
    } catch (err) {
      console.error('Failed to load values', err);
    } finally {
      setLoadingValues(false);
    }
  };

  const filteredValues = availableValues.filter(v => 
    (v.description?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (v.id?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <tr className={`group transition-colors ${
        isMandatory && !isFilled ? 'bg-rose-50/30' : 
        isFocused ? 'bg-indigo-50/40' : 'hover:bg-gray-50/50'
      }`} data-testid={`audit-row-${attribute.type_id}`}>
        <td className="px-4 py-2.5 text-center">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFocus?.(); }}
            className={`p-1 rounded transition-all ${
              isFocused 
                ? 'bg-indigo-600 text-white shadow-sm' 
                : 'text-gray-300 hover:text-indigo-400 opacity-0 group-hover:opacity-100'
            }`}
            data-testid={`focus-btn-${attribute.type_id}`}
          >
            <Target size={12} />
          </button>
        </td>

        <td className="px-4 py-2.5">
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-gray-800 tracking-tight" data-testid={`attr-name-${attribute.type_id}`}>{attribute.name}</span>
              {isMandatory && <div className="w-1 h-1 rounded-full bg-rose-500" title="Mandatory" data-testid={`attr-mandatory-${attribute.type_id}`} />}
            </div>
            <span className="text-[10px] font-medium text-gray-400 tabular-nums uppercase" data-testid={`attr-type-id-${attribute.type_id}`}>{attribute.type_id}</span>
          </div>
        </td>

        <td className="px-4 py-2.5 text-center">
          <div 
            onClick={() => onUpdate(attribute.db_value || '')}
            className={`inline-flex items-center justify-center min-w-[70px] px-2 py-0.5 rounded border text-[11px] font-bold tabular-nums cursor-pointer transition-all hover:ring-1 hover:ring-blue-400 ${
            attribute.selected_source === 'db' 
              ? 'bg-blue-50 border-blue-100 text-blue-700' 
              : 'bg-gray-50 border-gray-100 text-gray-400'
          }`} data-testid={`attr-db-value-${attribute.type_id}`}>
            {attribute.db_value || '—'}
          </div>
        </td>

        <td className="px-4 py-2.5 text-center">
           <div 
            onClick={() => onUpdate(attribute.ai_value || '')}
            className={`inline-flex items-center justify-center min-w-[70px] px-2 py-0.5 rounded border text-[11px] font-bold tabular-nums relative cursor-pointer transition-all hover:ring-1 hover:ring-indigo-400 ${
            attribute.selected_source === 'ai' 
              ? 'bg-indigo-50 border-indigo-100 text-indigo-700 shadow-sm' 
              : 'bg-gray-50 border-gray-100 text-gray-400'
          }`} data-testid={`attr-ai-value-${attribute.type_id}`}>
            {attribute.ai_value || '—'}
            {/* ALWAYS show confidence when AI has a value - P0 Fix */}
            {attribute.ai_value && attribute.confidence > 0 && (
              <span 
                className={`absolute -top-1.5 -right-1.5 px-1 rounded-full text-[8px] font-black shadow-sm ${
                  attribute.selected_source === 'ai' 
                    ? 'bg-white border border-indigo-100 text-indigo-600' 
                    : 'bg-indigo-50 border border-indigo-100 text-indigo-500'
                }`} 
                data-testid={`attr-ai-confidence-${attribute.type_id}`}
                title={`AI Confidence: ${attribute.confidence}%`}
              >
                {attribute.confidence}%
              </span>
            )}
          </div>
        </td>

        <td className="px-4 py-2.5 text-center">
          <div className="flex items-center justify-center gap-1">
            {/* Quick Accept AI Value - P1 */}
            {attribute.ai_value && attribute.selected_source !== 'ai' && (
              <button 
                onClick={(e) => { e.stopPropagation(); onUpdate(attribute.ai_value || ''); }}
                className="p-1 rounded border border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all"
                data-testid={`accept-ai-btn-${attribute.type_id}`}
                title="Accept AI suggestion"
              >
                <CheckCircle2 size={12} />
              </button>
            )}
            {/* Quick Keep ERP Value (Reject AI) - P1 */}
            {attribute.ai_value && attribute.db_value && attribute.selected_source === 'ai' && (
              <button 
                onClick={(e) => { e.stopPropagation(); onUpdate(attribute.db_value || ''); }}
                className="p-1 rounded border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all"
                data-testid={`keep-erp-btn-${attribute.type_id}`}
                title="Keep ERP value"
              >
                <Database size={12} />
              </button>
            )}
            {/* Edit Button */}
            <button 
              onClick={(e) => { e.stopPropagation(); loadValues(); }}
              className={`p-1 rounded border transition-all ${
                isPickerOpen ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-400 hover:text-gray-900'
              }`}
              data-testid={`edit-btn-${attribute.type_id}`}
              title="Edit value"
            >
              <Edit2 size={12} />
            </button>
            {/* Clear Button */}
            {isFilled && (
              <button 
                onClick={(e) => { e.stopPropagation(); onUpdate(''); }}
                className="p-1 rounded border border-gray-200 bg-white text-gray-300 hover:text-rose-500 transition-all"
                data-testid={`clear-btn-${attribute.type_id}`}
                title="Clear value"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Inline Metadata Picker */}
      {isPickerOpen && (
        <tr className="bg-gray-50/50 animate-in slide-in-from-top-1" data-testid={`picker-row-${attribute.type_id}`}>
          <td colSpan={5} className="px-12 py-3">
            <div className="bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden max-w-sm ml-auto">
              <div className="p-2 border-b border-gray-100 bg-gray-50">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={12} />
                  <input 
                    type="text"
                    placeholder={`Filter ${attribute.name}...`}
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    autoFocus
                    data-testid={`picker-search-${attribute.type_id}`}
                  />
                </div>
              </div>
              <div className="max-h-40 overflow-y-auto custom-scrollbar p-1" data-testid={`picker-options-${attribute.type_id}`}>
                {loadingValues ? (
                  <div className="py-6 flex flex-col items-center justify-center gap-2">
                    <Loader2 className="animate-spin text-indigo-600" size={16} />
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Fetching Values...</span>
                  </div>
                ) : filteredValues.length === 0 ? (
                  <div className="py-4 text-center text-[10px] font-bold text-gray-400 uppercase">No Matches</div>
                ) : (
                  // Deduplicate options by ID to prevent React key warnings
                  Array.from(new Map(filteredValues.map(v => [v.id, v])).values()).map(v => (
                    <button
                      key={v.id}
                      onClick={() => {
                        onUpdate(v.description);
                        setIsPickerOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded text-xs font-semibold flex items-center justify-between transition-colors ${
                        attribute.selected_value === v.description ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-indigo-50'
                      }`}
                      data-testid={`picker-option-${attribute.type_id}-${v.id}`}
                    >
                      <span className="truncate pr-4">{v.description}</span>
                      <span className={`text-[9px] font-mono ${attribute.selected_value === v.description ? 'text-indigo-200' : 'text-gray-400'}`}>
                        {v.id}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </td>
        </tr>
      )}

      {/* Inline Text Editor (Descriptions) */}
      {isEditingText && (
        <tr className="bg-gray-50/50 animate-in slide-in-from-top-1" data-testid={`editor-row-${attribute.type_id}`}>
          <td colSpan={5} className="px-12 py-4">
            <div className="bg-white border border-gray-200 rounded-lg shadow-xl p-4 ml-auto max-w-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Edit {attribute.name}</span>
                <span className="text-[10px] font-medium text-gray-400">{editValue.length} characters</span>
              </div>
              <textarea
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded text-xs font-medium focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all custom-scrollbar"
                rows={4}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                autoFocus
                data-testid={`description-editor-${attribute.type_id}`}
              />
              <div className="flex items-center justify-end gap-2 mt-3">
                <Button 
                  size="xs" 
                  variant="ghost" 
                  onClick={() => setIsEditingText(false)}
                  data-testid="cancel-edit-btn"
                >
                  Cancel
                </Button>
                <Button 
                  size="xs" 
                  variant="primary" 
                  icon={<CheckCircle2 size={12} />}
                  onClick={() => {
                    onUpdate(editValue);
                    setIsEditingText(false);
                  }}
                  data-testid="apply-edit-btn"
                >
                  Apply Change
                </Button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};
