/**
 * ReviewGridRow - Professional High-Density Row
 * v8.4: Enhanced with AI enrichment status indicators
 */

import React, { useState, useCallback } from 'react';
import { 
  ChevronRight, 
  Image as ImageIcon, 
  ExternalLink,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  Clock
} from 'lucide-react';
import { ReviewGridRow as ReviewGridRowType } from '../../types';
import { ConfidenceBadge, DataCompletenessBar, StatusBadge, Button } from '../shared/UI';
import { API_BASE_URL } from '../../src/api/config';

interface ReviewGridRowProps {
  row: ReviewGridRowType;
  isSelected: boolean;
  onToggleSelection: (styleId: string) => void;
  onFocus: () => void;
}

/** Track failed images to prevent repeated load attempts */
const failedImageCache = new Set<string>();

export const ReviewGridRow: React.FC<ReviewGridRowProps> = ({
  row,
  isSelected,
  onToggleSelection,
  onFocus
}) => {
  const [imgHover, setImgHover] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);
  
  // Hover-to-Flip logic
  const hasMultipleImages = row.media && row.media.length > 1;
  const primaryMedia = row.media?.find(m => m.type === 'PRIMARY') || row.media?.[0];
  const secondaryMedia = hasMultipleImages ? (row.media?.find(m => m.view === '2') || row.media?.[1]) : null;
  
  const getFullUrl = (url?: string) => {
    if (!url) return undefined;
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

  const rawUrl = (imgHover && secondaryMedia) 
    ? (secondaryMedia.url || '') 
    : (primaryMedia?.url || row.image_url || '');
  
  // Check if this image already failed before
  const displayImage = failedImageCache.has(rawUrl) ? undefined : getFullUrl(rawUrl);
  const isHierarchyDefault = primaryMedia?.source === 'HIERARCHY';
  const isDraft = row.style_id.startsWith('DRAFT_');
  
  // Image load handlers
  const handleImageLoad = useCallback(() => {
    setImgLoading(false);
    setImgError(false);
  }, []);
  
  const handleImageError = useCallback(() => {
    setImgLoading(false);
    setImgError(true);
    // Cache the failure to prevent repeated attempts
    if (rawUrl) failedImageCache.add(rawUrl);
  }, [rawUrl]);

  // AI Enrichment Status Detection (v8.4.1) - Enhanced
  // Detect AI data from multiple signals: description, status, enrichment score, or overall_confidence
  const hasActualAiData = Boolean(
    (row.ai_description && row.ai_description.trim().length > 0) ||
    row.status === 'review' || 
    row.status === 'success' ||  // AI completed successfully
    row.status === 'approved' ||
    (row.overall_confidence && row.overall_confidence > 0) ||  // Has AI confidence
    (row.enrichment_pct && row.enrichment_pct > 50)  // Has significant enrichment
  );
  
  const isApproved = row.status === 'accepted' || row.status === 'ready_to_sync' || row.status === 'synced' || row.status === 'approved';
  const isPendingReview = hasActualAiData && !isApproved && row.status !== 'rejected';

  // Enrichment status for display
  const enrichmentStatus = isDraft ? 'draft' : 
    isApproved ? 'approved' : 
    isPendingReview ? 'ai_pending' : 
    row.status === 'rejected' ? 'rejected' : 'none';

  return (
    <tr 
      className={`group transition-colors 
        ${isSelected ? 'bg-purple-50/60 border-l-4 border-l-purple-500' : 'bg-white hover:bg-gray-50/50'} 
        ${isDraft && !isSelected ? 'bg-gray-50/20' : ''} 
        ${isPendingReview && !isSelected ? 'bg-purple-50/40 border-l-4 border-l-purple-400' : ''}
        ${isApproved && !isSelected ? 'bg-emerald-50/30 border-l-4 border-l-emerald-500' : ''}
      `}
      onClick={onFocus}
      data-testid={`review-row-${row.style_id}`}
    >
      <td className="px-6 py-3" onClick={(e) => e.stopPropagation()}>
        <input 
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelection(row.style_id)}
          className="w-4 h-4 rounded border-gray-300 transition-all cursor-pointer"
          data-testid={`select-row-${row.style_id}`}
        />
      </td>
      
      <td className="px-4 py-3">
        <div 
          className={`w-14 h-14 bg-gray-50 rounded border overflow-hidden relative transition-all group-hover:border-indigo-200 ${isHierarchyDefault ? 'border-dashed border-gray-300' : 'border-gray-100'}`}
          data-testid={`row-image-container-${row.style_id}`}
          onMouseEnter={() => setImgHover(true)}
          onMouseLeave={() => setImgHover(false)}
        >
          {displayImage && !imgError ? (
            <>
              {/* Loading skeleton */}
              {imgLoading && (
                <div className="absolute inset-0 bg-gray-100 animate-pulse flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
                </div>
              )}
              <img 
                src={displayImage} 
                alt="" 
                className={`w-full h-full object-cover transition-opacity duration-300 ${isHierarchyDefault ? 'opacity-60 grayscale-[50%]' : ''} ${imgLoading ? 'opacity-0' : 'opacity-100'}`} 
                data-testid={`row-image-${row.style_id}`}
                onLoad={handleImageLoad}
                onError={handleImageError}
                loading="lazy"
              />
              {isHierarchyDefault && !imgLoading && (
                <div className="absolute top-0 left-0 bg-gray-500/80 text-[7px] text-white px-1 uppercase font-black">
                  Inherited
                </div>
              )}
              {hasMultipleImages && !imgLoading && (
                <div className="absolute bottom-0 right-0 bg-black/40 text-[8px] text-white px-1 font-bold">
                  {imgHover ? '2/2' : '1/2'}
                </div>
              )}
            </>
          ) : imgError ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-amber-400 bg-amber-50" data-testid={`row-image-error-${row.style_id}`}>
              <AlertTriangle size={14} />
              <span className="text-[7px] font-bold mt-0.5 text-amber-600">UNAVAILABLE</span>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300" data-testid={`row-no-image-${row.style_id}`}>
              <ImageIcon size={18} />
            </div>
          )}
        </div>
      </td>

      {/* Style ID & Name */}
      <td className="px-4 py-3">
        <div className="flex flex-col min-w-0" data-testid={`row-id-name-${row.style_id}`}>
          <span className={`text-sm font-bold tracking-tight ${isDraft ? 'text-amber-700 font-black' : 'text-gray-900'}`} data-testid={`row-style-id-${row.style_id}`}>
            {isDraft ? 'DRAFT' : row.style_id}
          </span>
          <span className="text-xs text-gray-500 truncate max-w-[180px]" data-testid={`row-style-name-${row.style_id}`}>{row.style_name}</span>
          {row.banners && row.banners.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {row.banners.map(b => (
                <span 
                  key={b.id} 
                  className="px-1 py-0.5 bg-gray-100 text-[8px] font-black text-gray-500 rounded uppercase tracking-tighter"
                  title={b.name}
                >
                  {b.id}
                </span>
              ))}
            </div>
          )}
        </div>
      </td>

      {/* Department */}
      <td className="px-3 py-3">
        <span className="text-[11px] font-semibold text-gray-600 uppercase" data-testid={`row-dept-${row.style_id}`}>
          {row.dept_name || '-'}
        </span>
      </td>

      {/* Class */}
      <td className="px-3 py-3">
        <span className="text-[11px] font-semibold text-gray-600 uppercase truncate block max-w-[120px]" data-testid={`row-class-${row.style_id}`}>
          {row.class_name || '-'}
        </span>
      </td>

      {/* Subclass */}
      <td className="px-3 py-3">
        <span className="text-[11px] font-semibold text-gray-600 uppercase truncate block max-w-[120px]" data-testid={`row-subclass-${row.style_id}`}>
          {row.subclass_name || '-'}
        </span>
      </td>

      {/* Brand */}
      <td className="px-3 py-3">
        <span className="text-[11px] font-semibold text-gray-700 truncate block max-w-[100px]" data-testid={`row-brand-${row.style_id}`}>
          {row.brand_name || '-'}
        </span>
      </td>

      <td className="px-4 py-3">
        <div className="flex flex-col gap-1.5" data-testid={`row-progress-${row.style_id}`}>
          {/* Progress Bar */}
          <div className="max-w-[140px] mx-auto w-full">
            <DataCompletenessBar 
              filled={isDraft ? (row.completion_pct || 0) : (row.attribute_completeness?.filled || 0)} 
              total={isDraft ? 100 : (row.attribute_completeness?.total || 5)} 
            />
          </div>
          {/* AI Preview Snippet - P1 Enhancement */}
          {hasActualAiData && row.ai_description && (
            <div 
              className="max-w-[200px] mx-auto text-[10px] text-indigo-600/80 italic truncate"
              title={row.ai_description}
              data-testid={`ai-preview-${row.style_id}`}
            >
              "{row.ai_description.substring(0, 50)}{row.ai_description.length > 50 ? '...' : ''}"
            </div>
          )}
          {/* Show AI attributes count if available */}
          {hasActualAiData && row.ai_attributes_count && row.ai_attributes_count > 0 && (
            <div className="flex items-center justify-center gap-1 text-[9px] text-indigo-500" data-testid={`ai-count-${row.style_id}`}>
              <Sparkles size={8} />
              <span>{row.ai_attributes_count} AI suggestions</span>
            </div>
          )}
        </div>
      </td>

      <td className="px-4 py-3 text-center" data-testid={`row-confidence-${row.style_id}`}>
        <div className="flex flex-col items-center gap-1">
          <ConfidenceBadge value={isDraft ? (row.completion_pct || 0) : row.overall_confidence} />
          {/* AI Status Indicator (v8.4) */}
          {enrichmentStatus === 'ai_pending' && (
            <div className="flex items-center gap-1 text-indigo-600" data-testid={`ai-status-pending-${row.style_id}`}>
              <Sparkles size={10} className="animate-pulse" />
              <span className="text-[8px] font-black uppercase tracking-tight">AI Ready</span>
            </div>
          )}
          {enrichmentStatus === 'approved' && (
            <div className="flex items-center gap-1 text-emerald-600" data-testid={`ai-status-approved-${row.style_id}`}>
              <CheckCircle2 size={10} />
              <span className="text-[8px] font-black uppercase tracking-tight">Approved</span>
            </div>
          )}
        </div>
      </td>

      <td className="px-6 py-3 text-right">
        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`row-actions-${row.style_id}`}>
          <StatusBadge status={row.status} data-testid={`row-status-${row.style_id}`} />
          <Button 
            variant="ghost" 
            size="sm" 
            icon={<ExternalLink size={14} />} 
            onClick={onFocus}
            data-testid={`row-details-btn-${row.style_id}`}
          >
            Details
          </Button>
        </div>
      </td>
    </tr>
  );
};
