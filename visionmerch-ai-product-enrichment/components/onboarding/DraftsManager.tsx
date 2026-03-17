/**
 * DraftsManager - View and manage new product drafts
 * 
 * Features:
 * - List all drafts with AI-predicted hierarchy
 * - Preview images
 * - Edit hierarchy assignments
 * - Approve/reject drafts
 * - Bulk actions
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  FileText, Image, CheckCircle2, XCircle, AlertCircle, 
  Loader2, RefreshCw, Trash2, Edit2, Eye, ChevronRight,
  Layers, Sparkles, Clock, Filter, Search, X, Save, Check
} from 'lucide-react';
import { Button } from '../shared/UI';
import { API_BASE_URL } from '../../src/api/config';
import { DraftEditor } from './DraftEditor';

interface Draft {
  sessionId: number;
  tenantId: string;
  businessUnitId: number;
  workType: string;
  status: string;
  completionPct: number;
  imageName: string;
  shortDescription: string;
  longDescription: string;
  aiSuggestions: {
    predictedHierarchy?: {
      dept: string;
      deptId: string;
      class: string;
      classId: string;
      subclass?: string;
      subclassId?: string;
      confidence?: {
        department: number;
        class: number;
        subclass?: number;
      };
    };
    predictedColor?: string;
    predictedSizeScale?: string;
    reasoning?: string;
  };
  errorLog?: string;
  createdAt: string;
  updatedAt: string;
  hasImage: boolean;
}

import type { HierarchyTree } from '../../types';

interface DraftsManagerProps {
  businessUnitId: number;
  hierarchy?: HierarchyTree | null;
  onDraftSelect?: (draft: Draft) => void;
  onClose?: () => void;
}

export const DraftsManager: React.FC<DraftsManagerProps> = ({ 
  businessUnitId,
  hierarchy,
  onDraftSelect,
  onClose
}) => {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDrafts, setSelectedDrafts] = useState<Set<number>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDraft, setExpandedDraft] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState<Draft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Demo: Save product drafts to ERP
  const handleSaveDrafts = async () => {
    if (drafts.length === 0) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      console.log('[Save Drafts] Saving', drafts.length, 'drafts to ERP');
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API call
      setSaveSuccess(true);
      console.log('[Save Drafts] Successfully saved', drafts.length, 'drafts');
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const fetchDrafts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        business_unit_id: businessUnitId.toString(),
        ...(statusFilter && { status: statusFilter })
      });
      const response = await fetch(`${API_BASE_URL}/products/drafts?${params}`);
      const data = await response.json();
      if (data.success) {
        setDrafts(data.data || []);
      } else {
        setError(data.error?.message || 'Failed to load drafts');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load drafts');
    }
    setIsLoading(false);
  }, [businessUnitId, statusFilter]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  const toggleSelect = (sessionId: number) => {
    setSelectedDrafts(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedDrafts.size === filteredDrafts.length) {
      setSelectedDrafts(new Set());
    } else {
      setSelectedDrafts(new Set(filteredDrafts.map(d => d.sessionId)));
    }
  };

  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteSelected = async () => {
    if (selectedDrafts.size === 0) return;
    
    if (!window.confirm(`Are you sure you want to delete ${selectedDrafts.size} draft(s)? This cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/products/drafts`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_ids: Array.from(selectedDrafts) })
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Remove deleted drafts from local state
        setDrafts(prev => prev.filter(d => !selectedDrafts.has(d.sessionId)));
        setSelectedDrafts(new Set());
      } else {
        setError(result.error?.message || 'Failed to delete drafts');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete drafts');
    }
    
    setIsDeleting(false);
  };

  const handleDeleteSingle = async (sessionId: number) => {
    if (!window.confirm('Are you sure you want to delete this draft?')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/products/draft/${sessionId}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (result.success) {
        setDrafts(prev => prev.filter(d => d.sessionId !== sessionId));
        setSelectedDrafts(prev => {
          const next = new Set(prev);
          next.delete(sessionId);
          return next;
        });
      } else {
        setError(result.error?.message || 'Failed to delete draft');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete draft');
    }
  };

  const filteredDrafts = drafts.filter(draft => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        draft.imageName?.toLowerCase().includes(q) ||
        draft.shortDescription?.toLowerCase().includes(q) ||
        draft.aiSuggestions?.predictedHierarchy?.dept?.toLowerCase().includes(q) ||
        draft.aiSuggestions?.predictedHierarchy?.class?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getStatusBadge = (status: string, completionPct: number) => {
    if (status === 'READY') {
      return (
        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full flex items-center gap-1">
          <CheckCircle2 size={10} />
          Ready
        </span>
      );
    }
    if (completionPct >= 70) {
      return (
        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full flex items-center gap-1">
          <AlertCircle size={10} />
          {completionPct}%
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-bold rounded-full flex items-center gap-1">
        <Clock size={10} />
        Draft {completionPct}%
      </span>
    );
  };

  const getConfidenceBadge = (confidence: number | undefined) => {
    if (!confidence) return null;
    const pct = Math.round(confidence * 100);
    const color = pct >= 80 ? 'emerald' : pct >= 50 ? 'purple' : 'amber';
    return (
      <span className={`px-1.5 py-0.5 bg-${color}-100 text-${color}-700 text-[9px] font-bold rounded`}>
        {pct}%
      </span>
    );
  };

  if (isLoading && drafts.length === 0) {
    return (
      <div className="p-12 text-center">
        <Loader2 size={32} className="text-purple-500 animate-spin mx-auto mb-4" />
        <p className="text-sm text-gray-500">Loading drafts...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-pink-50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">New Product Drafts</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {drafts.length} draft{drafts.length !== 1 ? 's' : ''} • {filteredDrafts.filter(d => d.status === 'READY').length} ready for submission
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchDrafts}
              icon={<RefreshCw size={14} />}
            >
              Refresh
            </Button>
            <button
              onClick={handleSaveDrafts}
              disabled={isSaving || saveSuccess || drafts.length === 0}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                saveSuccess
                  ? 'bg-green-500 text-white'
                  : isSaving
                  ? 'bg-purple-400 text-white cursor-wait'
                  : drafts.length === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-sm hover:shadow-md hover:scale-[1.02]'
              }`}
            >
              {saveSuccess ? (
                <>
                  <Check size={14} />
                  Saved!
                </>
              ) : isSaving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={14} />
                  Save Product Drafts
                </>
              )}
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Close"
              >
                <X size={18} className="text-gray-500" />
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mt-4">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search drafts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-4 text-sm bg-white border border-gray-200 rounded-lg focus:border-purple-400 focus:ring-2 focus:ring-purple-50 outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:border-purple-400 outline-none"
          >
            <option value="">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="READY">Ready</option>
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-3">
          <AlertCircle size={18} className="text-rose-500" />
          <p className="text-sm text-rose-700">{error}</p>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filteredDrafts.length === 0 ? (
          <div className="p-12 text-center">
            <FileText size={48} className="text-gray-200 mx-auto mb-4" />
            <p className="text-sm text-gray-500">No drafts found</p>
            <p className="text-xs text-gray-400 mt-1">Upload images to create new product drafts</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {/* Select All Header */}
            <div className="px-6 py-2 bg-gray-50 flex items-center gap-4 sticky top-0 z-10">
              <input
                type="checkbox"
                checked={selectedDrafts.size === filteredDrafts.length && filteredDrafts.length > 0}
                onChange={selectAll}
                className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                {selectedDrafts.size > 0 ? `${selectedDrafts.size} selected` : 'Select all'}
              </span>
              {selectedDrafts.size > 0 && (
                <div className="flex items-center gap-2 ml-auto">
                  <Button variant="outline" size="sm" className="text-xs">
                    Bulk Edit
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
                    onClick={handleDeleteSelected}
                    disabled={isDeleting}
                    icon={isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  >
                    {isDeleting ? 'Deleting...' : `Delete (${selectedDrafts.size})`}
                  </Button>
                </div>
              )}
            </div>

            {/* Draft Rows */}
            {filteredDrafts.map((draft) => (
              <div key={draft.sessionId} className="hover:bg-gray-50/50 transition-colors">
                <div className="px-6 py-4 flex items-start gap-4">
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={selectedDrafts.has(draft.sessionId)}
                    onChange={() => toggleSelect(draft.sessionId)}
                    className="w-4 h-4 mt-1 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />

                  {/* Image Thumbnail */}
                  <div className="w-16 h-16 rounded-lg bg-gray-100 border border-gray-200 overflow-hidden flex-shrink-0">
                    {draft.hasImage ? (
                      <img
                        src={`${API_BASE_URL}/products/draft/${draft.sessionId}/image`}
                        alt={draft.imageName}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <Image size={24} />
                      </div>
                    )}
                  </div>

                  {/* Main Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-gray-900 truncate">
                            {draft.shortDescription || draft.imageName || `Draft #${draft.sessionId}`}
                          </h3>
                          {getStatusBadge(draft.status, draft.completionPct)}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {draft.imageName} • Created {new Date(draft.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {/* AI Predictions */}
                    {draft.aiSuggestions?.predictedHierarchy && (
                      <div className="mt-3 p-3 bg-purple-50/50 border border-purple-100 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles size={12} className="text-purple-500" />
                          <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">
                            AI Predicted Hierarchy
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-gray-700">
                            {draft.aiSuggestions.predictedHierarchy.dept}
                          </span>
                          {getConfidenceBadge(draft.aiSuggestions.predictedHierarchy.confidence?.department)}
                          <ChevronRight size={12} className="text-gray-300" />
                          <span className="text-gray-600">
                            {draft.aiSuggestions.predictedHierarchy.class}
                          </span>
                          {getConfidenceBadge(draft.aiSuggestions.predictedHierarchy.confidence?.class)}
                          {draft.aiSuggestions.predictedHierarchy.subclass && (
                            <>
                              <ChevronRight size={12} className="text-gray-300" />
                              <span className="text-gray-500">
                                {draft.aiSuggestions.predictedHierarchy.subclass}
                              </span>
                              {getConfidenceBadge(draft.aiSuggestions.predictedHierarchy.confidence?.subclass)}
                            </>
                          )}
                        </div>
                        {draft.aiSuggestions.predictedColor && (
                          <p className="text-[10px] text-gray-500 mt-2">
                            Color: <span className="font-medium">{draft.aiSuggestions.predictedColor}</span>
                          </p>
                        )}
                      </div>
                    )}

                    {/* Error Log */}
                    {draft.errorLog && (
                      <div className="mt-2 p-2 bg-amber-50 border border-amber-100 rounded-lg">
                        <p className="text-[10px] text-amber-700 font-medium">
                          Missing: {draft.errorLog.split('\n').slice(0, 2).join(', ')}
                          {draft.errorLog.split('\n').length > 2 && '...'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setExpandedDraft(expandedDraft === draft.sessionId ? null : draft.sessionId)}
                      className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                      title="View Details"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      onClick={() => setEditingDraft(draft)}
                      className="p-2 hover:bg-purple-100 rounded-lg text-purple-500 hover:text-purple-700 transition-colors"
                      title="Edit Draft"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteSingle(draft.sessionId)}
                      className="p-2 hover:bg-rose-100 rounded-lg text-gray-400 hover:text-rose-600 transition-colors"
                      title="Delete Draft"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedDraft === draft.sessionId && (
                  <div className="px-6 pb-4 ml-24">
                    <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                      {draft.longDescription && (
                        <div>
                          <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Long Description</p>
                          <p className="text-xs text-gray-700">{draft.longDescription}</p>
                        </div>
                      )}
                      {draft.aiSuggestions?.reasoning && (
                        <div>
                          <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">AI Reasoning</p>
                          <p className="text-xs text-gray-600 italic">{draft.aiSuggestions.reasoning}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-4 pt-2">
                        <Button variant="primary" size="sm" disabled={draft.status !== 'READY'}>
                          Submit to ERP
                        </Button>
                        <Button variant="outline" size="sm">
                          Edit Hierarchy
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Draft Editor Modal */}
      {editingDraft && (
        <DraftEditor
          draft={editingDraft}
          hierarchy={hierarchy ?? null}
          onSave={(updatedDraft) => {
            // Update draft in list
            setDrafts(prev => prev.map(d => 
              d.sessionId === updatedDraft.sessionId ? updatedDraft : d
            ));
            setEditingDraft(null);
          }}
          onClose={() => setEditingDraft(null)}
        />
      )}
    </div>
  );
};

export default DraftsManager;
