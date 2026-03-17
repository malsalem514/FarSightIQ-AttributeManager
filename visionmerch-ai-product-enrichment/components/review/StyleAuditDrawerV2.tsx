/**
 * StyleAuditDrawerV2 - AI-First Retail Enrichment Experience
 * 
 * Design Principles:
 * - AI suggestions front and center with confidence visualization
 * - Multiple approval modes: single, bulk, threshold-based
 * - Zero training required - intuitive at first glance
 * - Power users can fly, casual users feel safe
 * 
 * @version 2.0.0
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { 
  X, ChevronRight, CheckCircle2, AlertCircle, 
  Sparkles, Edit2, ChevronDown, Search, Loader2, 
  Database, Wand2, Image as ImageIcon, Check, XCircle,
  Zap, Filter, ThumbsUp, ThumbsDown, Eye, EyeOff,
  Sliders, ArrowRight, RotateCcw, Copy, Save,
  ChevronUp, Maximize2, Minimize2, Lock, Unlock, Layers
} from 'lucide-react';
import { ReviewGridRow, AttributeComparison, MediaItem } from '../../types';
import { fetchAttributeValues, rewriteDescription } from '../../src/api/client';
import { API_BASE_URL } from '../../src/api/config';
import { Button, StatusBadge, ConfidenceBadge } from '../shared/UI';
import { ImageLightbox } from '../shared/ImageLightbox';

interface StyleAuditDrawerV2Props {
  useNewDrawer?: boolean;
  onToggleDrawerVersion?: (useNew: boolean) => void;
  style: ReviewGridRow | null;
  businessUnitId: number;
  onClose: () => void;
  onUpdateAttribute: (styleId: string, attrId: string, value: string) => void;
  onApproveStyle?: (styleId: string) => void;
  onRejectStyle?: (styleId: string) => void;
  focusedAttributes?: string[];
}

type ApprovalMode = 'review' | 'approved' | 'rejected';
type ConfidenceFilter = 'all' | 'high' | 'medium' | 'low';

// Get confidence level label
const getConfidenceLevel = (conf: number): 'high' | 'medium' | 'low' => {
  if (conf >= 80) return 'high';
  if (conf >= 50) return 'medium';
  return 'low';
};

// Get confidence color - Purple theme
const getConfidenceColor = (conf: number) => {
  if (conf >= 80) return { bg: 'bg-emerald-500', text: 'text-emerald-600', light: 'bg-emerald-50', border: 'border-emerald-200' };
  if (conf >= 50) return { bg: 'bg-purple-500', text: 'text-purple-600', light: 'bg-purple-50', border: 'border-purple-200' };
  return { bg: 'bg-rose-400', text: 'text-rose-600', light: 'bg-rose-50', border: 'border-rose-200' };
};

// Confidence Ring Component
const ConfidenceRing: React.FC<{ value: number; size?: 'sm' | 'md' | 'lg' }> = ({ value, size = 'md' }) => {
  const sizes = { sm: 32, md: 48, lg: 64 };
  const strokes = { sm: 3, md: 4, lg: 5 };
  const dim = sizes[size];
  const stroke = strokes[size];
  const radius = (dim - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const colors = getConfidenceColor(value);
  
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: dim, height: dim }}>
      <svg className="transform -rotate-90" width={dim} height={dim}>
        <circle cx={dim/2} cy={dim/2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        <circle 
          cx={dim/2} cy={dim/2} r={radius} fill="none" 
          stroke={value >= 80 ? '#10b981' : value >= 50 ? '#f59e0b' : '#f43f5e'}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className={`absolute text-xs font-black ${colors.text}`}>{value}%</span>
    </div>
  );
};

// AI Attribute Card - The star of the show
const AIAttributeCard: React.FC<{
  attr: AttributeComparison;
  isSelected: boolean;
  onToggleSelect: () => void;
  onAcceptAI: () => void;
  onKeepERP: () => void;
  onEdit: () => void;
  isApproved: boolean;
  isRejected: boolean;
}> = ({ attr, isSelected, onToggleSelect, onAcceptAI, onKeepERP, onEdit, isApproved, isRejected }) => {
  const hasAI = !!attr.ai_value && attr.ai_value !== 'N/A';
  const hasERP = !!attr.db_value;
  const conf = attr.confidence || 0;
  const confColors = getConfidenceColor(conf);
  const isDiff = hasAI && hasERP && attr.ai_value !== attr.db_value;
  
  return (
    <div 
      className={`relative rounded-xl border-2 transition-all duration-200 overflow-hidden ${
        isApproved ? 'border-emerald-300 bg-emerald-50/50' :
        isRejected ? 'border-gray-200 bg-gray-50 opacity-60' :
        isSelected ? 'border-indigo-400 bg-indigo-50/30 shadow-lg shadow-indigo-100' :
        hasAI ? 'border-indigo-200 bg-white hover:border-indigo-300 hover:shadow-md' :
        'border-gray-100 bg-gray-50/50'
      }`}
    >
      {/* Selection Checkbox */}
      {hasAI && !isApproved && !isRejected && (
        <button
          onClick={onToggleSelect}
          className={`absolute top-3 left-3 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
            isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 hover:border-indigo-400'
          }`}
        >
          {isSelected && <Check size={12} strokeWidth={3} />}
        </button>
      )}
      
      {/* Approved/Rejected Badge */}
      {isApproved && (
        <div className="absolute top-3 left-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-black uppercase">
          <Check size={10} /> Approved
        </div>
      )}
      {isRejected && (
        <div className="absolute top-3 left-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-400 text-white text-[9px] font-black uppercase">
          <XCircle size={10} /> Kept ERP
        </div>
      )}
      
      {/* Content */}
      <div className={`p-4 ${hasAI && !isApproved && !isRejected ? 'pl-10' : ''}`}>
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <h4 className="text-sm font-bold text-gray-900 capitalize">
              {attr.name.replace(/_/g, ' ')}
            </h4>
            <span className="text-[10px] text-gray-400 uppercase font-mono">{attr.type_id}</span>
          </div>
          {hasAI && (
            <ConfidenceRing value={conf} size="sm" />
          )}
        </div>
        
        {/* Values Comparison */}
        <div className="space-y-2">
          {/* AI Value - Hero */}
          {hasAI && (
            <div className={`p-3 rounded-lg ${confColors.light} ${confColors.border} border`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                  <Sparkles size={10} className="text-indigo-500" /> AI Suggestion
                </span>
                {conf >= 80 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500 text-white font-black uppercase">High Conf</span>
                )}
              </div>
              <p className={`text-sm font-bold ${confColors.text}`}>{attr.ai_value}</p>
            </div>
          )}
          
          {/* ERP Value */}
          {hasERP && (
            <div className="p-2 rounded-lg bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-1 mb-1">
                <Database size={10} className="text-gray-400" />
                <span className="text-[10px] font-bold text-gray-400 uppercase">Current ERP</span>
              </div>
              <p className="text-sm text-gray-600">{attr.db_value}</p>
            </div>
          )}
          
          {/* No values */}
          {!hasAI && !hasERP && (
            <div className="p-3 rounded-lg bg-gray-50 border border-dashed border-gray-200 text-center">
              <p className="text-xs text-gray-400">No value</p>
            </div>
          )}
        </div>
        
        {/* Actions */}
        {hasAI && !isApproved && !isRejected && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={onAcceptAI}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all shadow-sm hover:shadow"
            >
              <ThumbsUp size={12} /> Accept AI
            </button>
            {hasERP && (
              <button
                onClick={onKeepERP}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold transition-all"
              >
                <Database size={12} /> Keep ERP
              </button>
            )}
            <button
              onClick={onEdit}
              className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 transition-all"
            >
              <Edit2 size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Media Gallery (simplified)
const CompactGallery: React.FC<{ media: MediaItem[] }> = ({ media }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  
  if (!media?.length) return (
    <div className="aspect-square bg-gray-100 rounded-xl flex items-center justify-center">
      <ImageIcon className="text-gray-300" size={32} />
    </div>
  );
  
  const getUrl = (url?: string) => {
    if (!url) return undefined;
    if (url.startsWith('http')) return url;
    const backendOrigin = API_BASE_URL.replace('/api', '');
    if (url.startsWith('/api/images/')) return `${backendOrigin}${url}`;
    return `${API_BASE_URL}/images/${url}`;
  };
  
  return (
    <div className="space-y-2">
      <div className="aspect-square rounded-xl overflow-hidden bg-gray-100">
        <img 
          src={getUrl(media[activeIdx]?.url)} 
          alt="" 
          className="w-full h-full object-cover"
          onError={(e) => (e.currentTarget.src = '')}
        />
      </div>
      {media.length > 1 && (
        <div className="flex gap-1 justify-center">
          {media.slice(0, 5).map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              className={`w-2 h-2 rounded-full transition-all ${i === activeIdx ? 'bg-indigo-600 scale-125' : 'bg-gray-300'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const StyleAuditDrawerV2: React.FC<StyleAuditDrawerV2Props> = ({ 
  style, 
  businessUnitId,
  onClose,
  onUpdateAttribute,
  onApproveStyle,
  onRejectStyle,
  focusedAttributes = [],
  useNewDrawer = true,
  onToggleDrawerVersion
}) => {
  // Local state for attribute decisions - ALL HOOKS MUST BE BEFORE ANY CONDITIONAL RETURNS
  const [decisions, setDecisions] = useState<Record<string, 'approved' | 'rejected' | 'pending'>>({});
  const [selectedAttrs, setSelectedAttrs] = useState<Set<string>>(new Set());
  const [confidenceThreshold, setConfidenceThreshold] = useState(70);
  const [filterMode, setFilterMode] = useState<ConfidenceFilter>('all');
  const [showOnlyAI, setShowOnlyAI] = useState(true);
  const [isCompactView, setIsCompactView] = useState(false);
  
  // Flatten all AI attributes - must be before conditional return
  const allAttributes = useMemo(() => {
    if (!style?.grouped_attributes) return [];
    return style.grouped_attributes.flatMap(g => 
      g.attributes.map(a => ({ ...a, group_name: g.group_name, group_id: g.group_id }))
    );
  }, [style?.grouped_attributes]);
  
  // Filter attributes - must be before conditional return
  const filteredAttributes = useMemo(() => {
    let filtered = allAttributes;
    
    // Only show AI if toggle is on
    if (showOnlyAI) {
      filtered = filtered.filter(a => a.ai_value && a.ai_value !== 'N/A');
    }
    
    // Filter by confidence
    if (filterMode === 'high') {
      filtered = filtered.filter(a => (a.confidence || 0) >= 80);
    } else if (filterMode === 'medium') {
      filtered = filtered.filter(a => (a.confidence || 0) >= 50 && (a.confidence || 0) < 80);
    } else if (filterMode === 'low') {
      filtered = filtered.filter(a => (a.confidence || 0) < 50);
    }
    
    return filtered;
  }, [allAttributes, showOnlyAI, filterMode]);
  
  // Stats
  const aiStats = useMemo(() => {
    const aiAttrs = allAttributes.filter(a => a.ai_value && a.ai_value !== 'N/A');
    const highConf = aiAttrs.filter(a => (a.confidence || 0) >= 80);
    const medConf = aiAttrs.filter(a => (a.confidence || 0) >= 50 && (a.confidence || 0) < 80);
    const lowConf = aiAttrs.filter(a => (a.confidence || 0) < 50);
    const approved = aiAttrs.filter(a => decisions[a.type_id] === 'approved');
    const rejected = aiAttrs.filter(a => decisions[a.type_id] === 'rejected');
    const avgConf = aiAttrs.length > 0 
      ? Math.round(aiAttrs.reduce((sum, a) => sum + (a.confidence || 0), 0) / aiAttrs.length)
      : 0;
    
    return { total: aiAttrs.length, highConf: highConf.length, medConf: medConf.length, lowConf: lowConf.length, approved: approved.length, rejected: rejected.length, avgConf };
  }, [allAttributes, decisions]);
  
  // Bulk actions
  const handleSelectAll = useCallback(() => {
    const toSelect = filteredAttributes.filter(a => 
      decisions[a.type_id] !== 'approved' && decisions[a.type_id] !== 'rejected'
    );
    setSelectedAttrs(new Set(toSelect.map(a => a.type_id)));
  }, [filteredAttributes, decisions]);
  
  const handleSelectNone = useCallback(() => {
    setSelectedAttrs(new Set());
  }, []);
  
  const handleSelectByConfidence = useCallback((threshold: number) => {
    const toSelect = filteredAttributes.filter(a => 
      (a.confidence || 0) >= threshold && 
      decisions[a.type_id] !== 'approved' && 
      decisions[a.type_id] !== 'rejected'
    );
    setSelectedAttrs(new Set(toSelect.map(a => a.type_id)));
  }, [filteredAttributes, decisions]);
  
  const handleApproveSelected = useCallback(() => {
    if (!style) return;
    const newDecisions = { ...decisions };
    selectedAttrs.forEach(id => {
      newDecisions[id] = 'approved';
      const attr = allAttributes.find(a => a.type_id === id);
      if (attr?.ai_value) {
        onUpdateAttribute(style.style_id, id, attr.ai_value);
      }
    });
    setDecisions(newDecisions);
    setSelectedAttrs(new Set());
  }, [selectedAttrs, decisions, allAttributes, style, onUpdateAttribute]);
  
  const handleRejectSelected = useCallback(() => {
    if (!style) return;
    const newDecisions = { ...decisions };
    selectedAttrs.forEach(id => {
      newDecisions[id] = 'rejected';
      const attr = allAttributes.find(a => a.type_id === id);
      if (attr?.db_value) {
        onUpdateAttribute(style.style_id, id, attr.db_value);
      }
    });
    setDecisions(newDecisions);
    setSelectedAttrs(new Set());
  }, [selectedAttrs, decisions, allAttributes, style, onUpdateAttribute]);
  
  const handleApproveAboveThreshold = useCallback(() => {
    if (!style) return;
    const newDecisions = { ...decisions };
    allAttributes.forEach(attr => {
      if ((attr.confidence || 0) >= confidenceThreshold && attr.ai_value && attr.ai_value !== 'N/A') {
        newDecisions[attr.type_id] = 'approved';
        onUpdateAttribute(style.style_id, attr.type_id, attr.ai_value);
      }
    });
    setDecisions(newDecisions);
  }, [confidenceThreshold, allAttributes, decisions, style, onUpdateAttribute]);
  
  const handleApproveAll = useCallback(() => {
    if (!style) return;
    const newDecisions = { ...decisions };
    allAttributes.forEach(attr => {
      if (attr.ai_value && attr.ai_value !== 'N/A') {
        newDecisions[attr.type_id] = 'approved';
        onUpdateAttribute(style.style_id, attr.type_id, attr.ai_value);
      }
    });
    setDecisions(newDecisions);
    onApproveStyle?.(style.style_id);
  }, [allAttributes, decisions, style, onUpdateAttribute, onApproveStyle]);
  
  const handleResetAll = useCallback(() => {
    setDecisions({});
    setSelectedAttrs(new Set());
  }, []);
  
  // Progress
  const progressPercent = aiStats.total > 0 
    ? Math.round(((aiStats.approved + aiStats.rejected) / aiStats.total) * 100)
    : 0;
  
  // Conditional return AFTER all hooks
  if (!style) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="relative w-full max-w-3xl bg-gradient-to-br from-gray-50 to-white shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-300">
        
        {/* Header - Sticky */}
        <header className="bg-white border-b border-gray-100 px-6 py-4 flex-shrink-0">
          <div className="flex items-start gap-4">
            {/* Product Image */}
            <div className="w-24 h-24 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 shadow-sm">
              <CompactGallery media={style.media || []} />
            </div>
            
            {/* Product Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-mono text-gray-400">{style.style_id}</span>
                <StatusBadge status={style.status} />
              </div>
              <h2 className="text-xl font-black text-gray-900 truncate mb-2">{style.style_name}</h2>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <span>{style.dept_name}</span>
                <ChevronRight size={12} />
                <span>{style.class_name}</span>
              </div>
            </div>
            
            {/* Drawer Version Toggle */}
            {onToggleDrawerVersion && (
              <div className="flex items-center gap-1 px-1.5 py-1 bg-gray-100 rounded-lg">
                <button 
                  onClick={() => onToggleDrawerVersion(true)}
                  className={`p-1.5 rounded transition-all flex items-center gap-1 ${useNewDrawer ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                  title="AI-First Drawer"
                >
                  <Wand2 size={12} />
                  {useNewDrawer && <span className="text-[9px] font-bold">AI</span>}
                </button>
                <button 
                  onClick={() => onToggleDrawerVersion(false)}
                  className={`p-1.5 rounded transition-all ${!useNewDrawer ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                  title="Classic Drawer"
                >
                  <Layers size={12} />
                </button>
              </div>
            )}
            
            {/* Close */}
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
              <X size={20} />
            </button>
          </div>
        </header>
        
        {/* AI Summary Banner */}
        {aiStats.total > 0 && (
          <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 px-6 py-4 text-white flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                  <Sparkles size={24} />
                </div>
                <div>
                  <h3 className="font-black text-lg">AI Enrichment Ready</h3>
                  <p className="text-indigo-100 text-sm">
                    {aiStats.total} AI suggestions • {aiStats.avgConf}% avg confidence
                  </p>
                </div>
              </div>
              
              {/* Quick Stats */}
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-2xl font-black">{aiStats.highConf}</div>
                  <div className="text-[10px] uppercase tracking-wider text-emerald-200">High Conf</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-black">{aiStats.medConf}</div>
                  <div className="text-[10px] uppercase tracking-wider text-amber-200">Medium</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-black">{aiStats.lowConf}</div>
                  <div className="text-[10px] uppercase tracking-wider text-rose-200">Low</div>
                </div>
              </div>
            </div>
            
            {/* Progress Bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-indigo-100">Review Progress</span>
                <span className="font-bold">{aiStats.approved + aiStats.rejected}/{aiStats.total} reviewed</span>
              </div>
              <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-white rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        )}
        
        {/* Action Bar - Sticky */}
        <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-3 flex-shrink-0 shadow-sm">
          {/* Bulk Selection */}
          <div className="flex items-center gap-2">
            <button
              onClick={selectedAttrs.size > 0 ? handleSelectNone : handleSelectAll}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedAttrs.size > 0 
                  ? 'bg-indigo-100 text-indigo-700' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {selectedAttrs.size > 0 ? `${selectedAttrs.size} Selected` : 'Select All'}
            </button>
            
            {selectedAttrs.size > 0 && (
              <>
                <button
                  onClick={handleApproveSelected}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 transition-all flex items-center gap-1"
                >
                  <ThumbsUp size={12} /> Approve Selected
                </button>
                <button
                  onClick={handleRejectSelected}
                  className="px-3 py-1.5 rounded-lg bg-gray-200 text-gray-600 text-xs font-bold hover:bg-gray-300 transition-all flex items-center gap-1"
                >
                  <ThumbsDown size={12} /> Keep ERP
                </button>
              </>
            )}
          </div>
          
          <div className="flex-1" />
          
          {/* Filters */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowOnlyAI(!showOnlyAI)}
              className={`p-2 rounded-lg transition-all ${showOnlyAI ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}
              title={showOnlyAI ? 'Show all attributes' : 'Show only AI suggestions'}
            >
              {showOnlyAI ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
            
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value as ConfidenceFilter)}
              className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-bold border-0 focus:ring-2 focus:ring-indigo-300"
            >
              <option value="all">All Confidence</option>
              <option value="high">High (80%+)</option>
              <option value="medium">Medium (50-79%)</option>
              <option value="low">Low (&lt;50%)</option>
            </select>
            
            <button
              onClick={() => setIsCompactView(!isCompactView)}
              className={`p-2 rounded-lg transition-all ${isCompactView ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}
              title={isCompactView ? 'Card view' : 'Compact view'}
            >
              {isCompactView ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
            </button>
          </div>
        </div>
        
        {/* Threshold Quick Action */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-indigo-100 px-6 py-3 flex items-center gap-4 flex-shrink-0">
          <Zap size={16} className="text-indigo-500" />
          <span className="text-sm font-bold text-gray-700">Quick Approve:</span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={confidenceThreshold}
              onChange={(e) => setConfidenceThreshold(parseInt(e.target.value))}
              className="w-32 h-2 rounded-full appearance-none bg-gray-200 accent-indigo-600"
            />
            <span className="text-sm font-black text-indigo-600 w-12">{confidenceThreshold}%+</span>
          </div>
          <button
            onClick={handleApproveAboveThreshold}
            className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all shadow-sm"
          >
            Approve Above {confidenceThreshold}%
          </button>
          <div className="flex-1" />
          <button
            onClick={handleResetAll}
            className="px-3 py-1.5 rounded-lg bg-white text-gray-500 text-xs font-bold hover:bg-gray-100 transition-all border border-gray-200 flex items-center gap-1"
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>
        
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredAttributes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Sparkles size={48} strokeWidth={1} className="mb-4" />
              <p className="text-lg font-bold">No AI suggestions match your filter</p>
              <p className="text-sm">Try adjusting your filters above</p>
            </div>
          ) : isCompactView ? (
            /* Compact Table View */
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                    <th className="w-10 px-4 py-3 text-center">
                      <input 
                        type="checkbox" 
                        checked={selectedAttrs.size === filteredAttributes.filter(a => decisions[a.type_id] === undefined).length}
                        onChange={(e) => e.target.checked ? handleSelectAll() : handleSelectNone()}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-4 py-3 text-left">Attribute</th>
                    <th className="px-4 py-3 text-center">Confidence</th>
                    <th className="px-4 py-3 text-center">AI Value</th>
                    <th className="px-4 py-3 text-center">ERP Value</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredAttributes.map(attr => {
                    const isApproved = decisions[attr.type_id] === 'approved';
                    const isRejected = decisions[attr.type_id] === 'rejected';
                    const confColors = getConfidenceColor(attr.confidence || 0);
                    
                    return (
                      <tr 
                        key={attr.type_id}
                        className={`transition-colors ${
                          isApproved ? 'bg-emerald-50' :
                          isRejected ? 'bg-gray-50 opacity-60' :
                          selectedAttrs.has(attr.type_id) ? 'bg-indigo-50' :
                          'hover:bg-gray-50'
                        }`}
                      >
                        <td className="px-4 py-3 text-center">
                          {!isApproved && !isRejected && (
                            <input 
                              type="checkbox" 
                              checked={selectedAttrs.has(attr.type_id)}
                              onChange={() => {
                                const newSelected = new Set(selectedAttrs);
                                if (newSelected.has(attr.type_id)) {
                                  newSelected.delete(attr.type_id);
                                } else {
                                  newSelected.add(attr.type_id);
                                }
                                setSelectedAttrs(newSelected);
                              }}
                              className="rounded border-gray-300"
                            />
                          )}
                          {isApproved && <Check size={16} className="text-emerald-500 mx-auto" />}
                          {isRejected && <XCircle size={16} className="text-gray-400 mx-auto" />}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-bold text-gray-900 capitalize">
                            {attr.name.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${confColors.light} ${confColors.text}`}>
                            {attr.confidence || 0}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm font-bold text-indigo-600">{attr.ai_value || '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm text-gray-500">{attr.db_value || '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {!isApproved && !isRejected && (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => {
                                  setDecisions({ ...decisions, [attr.type_id]: 'approved' });
                                  if (attr.ai_value) onUpdateAttribute(style.style_id, attr.type_id, attr.ai_value);
                                }}
                                className="p-1.5 rounded bg-emerald-100 text-emerald-600 hover:bg-emerald-200"
                              >
                                <ThumbsUp size={12} />
                              </button>
                              {attr.db_value && (
                                <button
                                  onClick={() => {
                                    setDecisions({ ...decisions, [attr.type_id]: 'rejected' });
                                    onUpdateAttribute(style.style_id, attr.type_id, attr.db_value!);
                                  }}
                                  className="p-1.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200"
                                >
                                  <ThumbsDown size={12} />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Card Grid View */
            <div className="grid grid-cols-2 gap-4">
              {filteredAttributes.map(attr => (
                <AIAttributeCard
                  key={attr.type_id}
                  attr={attr}
                  isSelected={selectedAttrs.has(attr.type_id)}
                  onToggleSelect={() => {
                    const newSelected = new Set(selectedAttrs);
                    if (newSelected.has(attr.type_id)) {
                      newSelected.delete(attr.type_id);
                    } else {
                      newSelected.add(attr.type_id);
                    }
                    setSelectedAttrs(newSelected);
                  }}
                  onAcceptAI={() => {
                    setDecisions({ ...decisions, [attr.type_id]: 'approved' });
                    if (attr.ai_value) onUpdateAttribute(style.style_id, attr.type_id, attr.ai_value);
                  }}
                  onKeepERP={() => {
                    setDecisions({ ...decisions, [attr.type_id]: 'rejected' });
                    if (attr.db_value) onUpdateAttribute(style.style_id, attr.type_id, attr.db_value);
                  }}
                  onEdit={() => {/* TODO: Open edit modal */}}
                  isApproved={decisions[attr.type_id] === 'approved'}
                  isRejected={decisions[attr.type_id] === 'rejected'}
                />
              ))}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <footer className="bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 font-bold">{aiStats.approved}</span>
              <span className="text-gray-400">approved</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="px-2 py-1 rounded bg-gray-100 text-gray-600 font-bold">{aiStats.rejected}</span>
              <span className="text-gray-400">kept ERP</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="px-2 py-1 rounded bg-indigo-100 text-indigo-600 font-bold">{aiStats.total - aiStats.approved - aiStats.rejected}</span>
              <span className="text-gray-400">pending</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button onClick={onClose} variant="outline" size="sm">
              Close
            </Button>
            <Button 
              onClick={handleApproveAll} 
              variant="primary" 
              size="sm"
              icon={<Sparkles size={14} />}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
            >
              Approve All AI ({aiStats.total - aiStats.rejected})
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default StyleAuditDrawerV2;
