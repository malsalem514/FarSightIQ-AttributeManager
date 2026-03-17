/**
 * ReviewSheetRow - Dynamic Batch Power Sheet Row
 * 
 * v2.1: Fully dynamic - discovers ALL AI attributes from data
 * - Shows ALL AI-suggested attributes as inline cells
 * - Confidence-colored backgrounds
 * - One-click row approval
 * - Inline accept/reject per attribute
 */

import React, { useState, useMemo } from 'react';
import { 
  Image as ImageIcon, 
  ExternalLink,
  CheckCircle2,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  Zap
} from 'lucide-react';
import { ReviewGridRow as ReviewGridRowType, AttributeComparison } from '../../types';
import { StatusBadge } from '../shared/UI';
import { API_BASE_URL } from '../../src/api/config';

// Get confidence color classes - Purple theme
const getConfidenceClasses = (conf: number) => {
  if (conf >= 80) return { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', ring: 'ring-emerald-400' };
  if (conf >= 50) return { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', ring: 'ring-purple-400' };
  if (conf > 0) return { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-600', ring: 'ring-rose-400' };
  return { bg: 'bg-gray-50', border: 'border-gray-100', text: 'text-gray-400', ring: 'ring-gray-300' };
};

// Format attribute name for display
const formatAttrName = (name: string): string => {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/^Ai /, '')
    .replace(/Primary /, '')
    .slice(0, 12); // Truncate for column header
};

interface ReviewSheetRowProps {
  row: ReviewGridRowType;
  isSelected: boolean;
  onToggleSelection: (styleId: string) => void;
  onFocus: () => void;
  onApproveRow?: (styleId: string) => void;
  onApproveAttribute?: (styleId: string, attrId: string, value: string) => void;
  onRejectAttribute?: (styleId: string, attrId: string) => void;
  dynamicColumns?: string[]; // Column IDs from parent
}

export const ReviewSheetRow: React.FC<ReviewSheetRowProps> = ({
  row,
  isSelected,
  onToggleSelection,
  onFocus,
  onApproveRow,
  onApproveAttribute,
  onRejectAttribute,
  dynamicColumns = []
}) => {
  const [hoveredAttr, setHoveredAttr] = useState<string | null>(null);
  const [approvedAttrs, setApprovedAttrs] = useState<Set<string>>(new Set());
  const [rejectedAttrs, setRejectedAttrs] = useState<Set<string>>(new Set());

  // Extract ALL AI attributes from grouped_attributes (case-insensitive lookup)
  const aiAttrsMap = useMemo(() => {
    const map = new Map<string, AttributeComparison>();
    if (!row.grouped_attributes) return map;
    
    row.grouped_attributes.forEach(group => {
      group.attributes.forEach(attr => {
        // Only include if has AI value
        if (attr.ai_value && attr.ai_value !== 'N/A') {
          // Store by type_id (uppercase as returned by backend)
          map.set(attr.type_id, attr);
          // Also store lowercase version for flexible matching
          map.set(attr.type_id.toLowerCase(), attr);
          // And by name
          if (attr.name) {
            map.set(attr.name.toLowerCase().replace(/\s+/g, '_'), attr);
          }
        }
      });
    });
    return map;
  }, [row.grouped_attributes]);

  // Get AI attributes for this row (those with AI values)
  const aiAttributes = useMemo(() => {
    const attrs: AttributeComparison[] = [];
    if (!row.grouped_attributes) return attrs;
    
    row.grouped_attributes.forEach(group => {
      group.attributes.forEach(attr => {
        if (attr.ai_value && attr.ai_value !== 'N/A') {
          attrs.push(attr);
        }
      });
    });
    return attrs;
  }, [row.grouped_attributes]);

  // Calculate row stats
  const rowStats = useMemo(() => {
    let highConf = 0, medConf = 0, lowConf = 0;
    aiAttributes.forEach(attr => {
      const conf = attr.confidence || 0;
      if (conf >= 80) highConf++;
      else if (conf >= 50) medConf++;
      else lowConf++;
    });
    return { 
      highConf, medConf, lowConf, 
      total: aiAttributes.length,
      avgConf: aiAttributes.length > 0 
        ? Math.round(aiAttributes.reduce((s, a) => s + (a.confidence || 0), 0) / aiAttributes.length) 
        : 0 
    };
  }, [aiAttributes]);

  // Enhanced AI detection - check multiple signals
  const hasAiData = aiAttributes.length > 0 || 
    (row.overall_confidence && row.overall_confidence > 0) ||
    (row.enrichment_pct && row.enrichment_pct > 50);
  const allApproved = aiAttributes.length > 0 && aiAttributes.every(attr => approvedAttrs.has(attr.type_id));
  // Pending approval if has AI data, not all approved, and not in approved/rejected status
  const isApprovedStatus = row.status === 'accepted' || row.status === 'ready_to_sync' || row.status === 'synced' || row.status === 'approved';
  const isPendingApproval = hasAiData && !allApproved && !isApprovedStatus && row.status !== 'rejected';

  // Handle row-level approve all
  const handleApproveRow = (e: React.MouseEvent) => {
    e.stopPropagation();
    aiAttributes.forEach(attr => {
      if (!approvedAttrs.has(attr.type_id) && attr.ai_value) {
        setApprovedAttrs(prev => new Set(prev).add(attr.type_id));
        onApproveAttribute?.(row.style_id, attr.type_id, attr.ai_value);
      }
    });
    onApproveRow?.(row.style_id);
  };

  // Handle single attribute approve
  const handleApproveAttr = (attr: AttributeComparison, e: React.MouseEvent) => {
    e.stopPropagation();
    setApprovedAttrs(prev => new Set(prev).add(attr.type_id));
    setRejectedAttrs(prev => { const n = new Set(prev); n.delete(attr.type_id); return n; });
    if (attr.ai_value) {
      onApproveAttribute?.(row.style_id, attr.type_id, attr.ai_value);
    }
  };

  // Handle single attribute reject
  const handleRejectAttr = (attr: AttributeComparison, e: React.MouseEvent) => {
    e.stopPropagation();
    setRejectedAttrs(prev => new Set(prev).add(attr.type_id));
    setApprovedAttrs(prev => { const n = new Set(prev); n.delete(attr.type_id); return n; });
    onRejectAttribute?.(row.style_id, attr.type_id);
  };

  // Image URL helper
  const getImageUrl = () => {
    if (!row.image_url) return null;
    if (row.image_url.startsWith('http')) return row.image_url;
    const backendOrigin = API_BASE_URL.replace('/api', '');
    if (row.image_url.startsWith('/api/images/')) return `${backendOrigin}${row.image_url}`;
    return `${API_BASE_URL}/images/${row.image_url}`;
  };

  // Find attribute by column ID (case-insensitive)
  const findAttr = (colId: string) => {
    return aiAttrsMap.get(colId) || aiAttrsMap.get(colId.toLowerCase()) || aiAttrsMap.get(colId.toUpperCase());
  };

  return (
    <tr 
      className={`group transition-colors border-b border-gray-100 ${
        isSelected ? 'bg-purple-50/60 border-l-4 border-l-purple-500' : 
        allApproved && hasAiData ? 'bg-emerald-50/30 border-l-4 border-l-emerald-500' :
        isPendingApproval ? 'bg-purple-50/40 border-l-4 border-l-purple-400' :
        'bg-white hover:bg-gray-50/50'
      }`}
      data-testid={`review-row-${row.style_id}`}
    >
      {/* Checkbox */}
      <td className="px-3 py-1.5 sticky left-0 bg-inherit z-10" onClick={(e) => e.stopPropagation()}>
        <input 
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelection(row.style_id)}
          className="w-4 h-4 rounded border-gray-300"
          data-testid={`select-sheet-row-${row.style_id}`}
        />
      </td>

      {/* Status - Moved to left */}
      <td className="px-2 py-1.5 text-center border-r border-gray-100 sticky left-10 bg-inherit z-10">
        <StatusBadge status={row.status} />
      </td>

      {/* Actions - Moved to left */}
      <td className="px-2 py-1.5 border-r border-gray-100 sticky left-30 bg-inherit z-10">
        <div className="flex items-center justify-center gap-1">
          {/* Quick Row Approve */}
          {hasAiData && !allApproved && (
            <button 
              onClick={handleApproveRow}
              className="flex items-center gap-1 px-2 py-1 rounded bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-[9px] font-bold hover:from-emerald-600 hover:to-emerald-700 transition-all shadow-sm"
              title={`Approve all ${rowStats.total} AI values (${rowStats.highConf} high conf)`}
            >
              <Zap size={10} />
              <span>{rowStats.total}</span>
            </button>
          )}
          {allApproved && hasAiData && (
            <span className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-100 text-emerald-700 text-[9px] font-bold">
              <CheckCircle2 size={10} /> ✓
            </span>
          )}
          <button 
            onClick={onFocus}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors"
            title="Open detail drawer"
          >
            <ExternalLink size={12} />
          </button>
        </div>
      </td>

      {/* Thumbnail + ID */}
      <td className="px-2 py-1.5 border-r border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded bg-gray-100 overflow-hidden flex-shrink-0">
            {getImageUrl() ? (
              <img src={getImageUrl()!} alt="" className="w-full h-full object-cover" onError={(e) => e.currentTarget.style.display = 'none'} />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon size={14} className="text-gray-300" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-gray-900 tabular-nums block">{row.style_id}</span>
            <span className="text-[9px] text-gray-400 truncate block max-w-20">{row.dept_name?.slice(0,8)}</span>
          </div>
        </div>
      </td>

      {/* Style Name + AI Count Badge */}
      <td className="px-2 py-1.5 border-r border-gray-100 max-w-40">
        <div className="flex items-start gap-1">
          <span className="text-[11px] font-medium text-gray-700 line-clamp-2 leading-tight flex-1">{row.style_name}</span>
          {hasAiData && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[8px] font-black flex-shrink-0">
              <Sparkles size={8} />
              {rowStats.total}
            </span>
          )}
        </div>
      </td>

      {/* Dynamic AI Attribute Columns */}
      {dynamicColumns.map(colId => {
        const attr = findAttr(colId);
        const aiValue = attr?.ai_value;
        const conf = attr?.confidence || 0;
        const hasValue = !!aiValue && aiValue !== 'N/A';
        const isApproved = attr ? approvedAttrs.has(attr.type_id) : false;
        const isRejected = attr ? rejectedAttrs.has(attr.type_id) : false;
        const confClasses = getConfidenceClasses(conf);
        const isHovered = hoveredAttr === colId;

        return (
          <td 
            key={colId}
            className="px-1 py-1 border-r border-gray-50 min-w-[80px] max-w-[120px] relative"
            onMouseEnter={() => setHoveredAttr(colId)}
            onMouseLeave={() => setHoveredAttr(null)}
          >
            {hasValue && attr ? (
              <div 
                className={`relative rounded px-1.5 py-1 transition-all cursor-pointer ${
                  isApproved ? 'bg-emerald-100 ring-1 ring-emerald-400' :
                  isRejected ? 'bg-gray-100 opacity-50' :
                  `${confClasses.bg} ${isHovered ? `ring-1 ${confClasses.ring}` : ''}`
                }`}
                onClick={(e) => !isApproved && !isRejected && handleApproveAttr(attr, e)}
              >
                {/* Value */}
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-[10px] font-bold truncate ${isApproved ? 'text-emerald-700' : isRejected ? 'text-gray-400 line-through' : confClasses.text}`} title={aiValue}>
                    {aiValue}
                  </span>
                  {!isApproved && !isRejected && conf > 0 && (
                    <span className={`text-[8px] font-black ${confClasses.text} opacity-70 flex-shrink-0`}>{conf}%</span>
                  )}
                  {isApproved && <CheckCircle2 size={10} className="text-emerald-600 flex-shrink-0" />}
                </div>

                {/* Hover Actions */}
                {isHovered && !isApproved && !isRejected && (
                  <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-white shadow-lg rounded-full px-1 py-0.5 z-20 border border-gray-200">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleApproveAttr(attr, e); }}
                      className="p-1 rounded-full hover:bg-emerald-100 text-emerald-600 transition-all"
                      title="Accept AI"
                    >
                      <ThumbsUp size={10} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleRejectAttr(attr, e); }}
                      className="p-1 rounded-full hover:bg-rose-100 text-rose-500 transition-all"
                      title="Keep ERP"
                    >
                      <ThumbsDown size={10} />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center">
                <span className="text-[9px] text-gray-300">—</span>
              </div>
            )}
          </td>
        );
      })}
    </tr>
  );
};

// Helper to extract all unique AI attribute IDs from a list of products
export function extractDynamicColumns(products: ReviewGridRowType[]): string[] {
  const columnSet = new Set<string>();
  
  products.forEach(product => {
    if (!product.grouped_attributes) return;
    
    product.grouped_attributes.forEach(group => {
      group.attributes.forEach(attr => {
        // Only include attributes that have AI values
        if (attr.ai_value && attr.ai_value !== 'N/A') {
          columnSet.add(attr.type_id);
        }
      });
    });
  });
  
  // Sort columns for consistent display
  return Array.from(columnSet).sort((a, b) => {
    // Priority order for common attributes
    const priority = ['PRIMARY_COLOR', 'MATERIAL', 'PATTERN', 'SILHOUETTE', 'OCCASION', 'FIT_TYPE', 'SEASON', 'STYLE'];
    const aIdx = priority.indexOf(a.toUpperCase());
    const bIdx = priority.indexOf(b.toUpperCase());
    if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
    if (aIdx >= 0) return -1;
    if (bIdx >= 0) return 1;
    return a.localeCompare(b);
  });
}

// Format column header name
export function formatColumnHeader(colId: string): string {
  return colId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/^Primary /, '')
    .replace(/^Ai /, '');
}
