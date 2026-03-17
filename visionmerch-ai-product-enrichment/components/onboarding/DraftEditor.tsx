/**
 * DraftEditor - Edit AI predictions before submission
 * 
 * Features:
 * - Edit predicted hierarchy (with proper cascading)
 * - Modify descriptions
 * - Override AI suggestions
 * - Validation before submission
 * - ESC to close
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  X, Save, Sparkles, Layers, AlertCircle, 
  RefreshCw, Undo, Eye, ChevronDown
} from 'lucide-react';
import { Button } from '../shared/UI';
import { API_BASE_URL } from '../../src/api/config';
import type { HierarchyTree, DepartmentNode, ClassNode, SubclassNode } from '../../types';

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

interface DraftEditorProps {
  draft: Draft;
  hierarchy: HierarchyTree | null;
  onSave: (updatedDraft: Draft) => void;
  onClose: () => void;
}

export const DraftEditor: React.FC<DraftEditorProps> = ({
  draft,
  hierarchy,
  onSave,
  onClose
}) => {
  // Helper: Find matching ID (case-insensitive, fuzzy)
  const findMatchingId = useCallback((
    aiValue: string | undefined, 
    options: Array<{ id: string; name: string }>
  ): string => {
    if (!aiValue || options.length === 0) return '';
    
    // 1. Exact match by ID
    const exactId = options.find(o => o.id === aiValue);
    if (exactId) return exactId.id;
    
    // 2. Case-insensitive ID match
    const caseInsensitiveId = options.find(o => o.id.toLowerCase() === aiValue.toLowerCase());
    if (caseInsensitiveId) return caseInsensitiveId.id;
    
    // 3. Exact match by name
    const exactName = options.find(o => o.name === aiValue);
    if (exactName) return exactName.id;
    
    // 4. Case-insensitive name match
    const caseInsensitiveName = options.find(o => o.name.toLowerCase() === aiValue.toLowerCase());
    if (caseInsensitiveName) return caseInsensitiveName.id;
    
    // 5. Partial match (name contains AI value or vice versa)
    const partialMatch = options.find(o => 
      o.name.toLowerCase().includes(aiValue.toLowerCase()) ||
      aiValue.toLowerCase().includes(o.name.toLowerCase())
    );
    if (partialMatch) return partialMatch.id;
    
    return '';
  }, []);

  // Get initial values with fuzzy matching
  const getInitialDeptId = useCallback(() => {
    const predicted = draft.aiSuggestions?.predictedHierarchy;
    const depts = hierarchy?.departments || [];
    
    // Try deptId first, then dept name
    let match = findMatchingId(predicted?.deptId, depts);
    if (!match && predicted?.dept) {
      match = findMatchingId(predicted.dept, depts);
    }
    
    console.log('[DraftEditor] Initial dept lookup:', { 
      aiDeptId: predicted?.deptId, 
      aiDept: predicted?.dept,
      availableDepts: depts.map(d => ({ id: d.id, name: d.name })).slice(0, 5),
      matched: match 
    });
    
    return match;
  }, [draft, hierarchy, findMatchingId]);

  // Form state - use fuzzy matching for initial values
  const [shortDesc, setShortDesc] = useState(draft.shortDescription || '');
  const [longDesc, setLongDesc] = useState(draft.longDescription || '');
  const [selectedDeptId, setSelectedDeptId] = useState(() => getInitialDeptId());
  const [selectedClassId, setSelectedClassId] = useState(''); // Set after dept is resolved
  const [selectedSubclassId, setSelectedSubclassId] = useState(''); // Set after class is resolved
  const [color, setColor] = useState(draft.aiSuggestions?.predictedColor || '');
  const [sizeScale, setSizeScale] = useState(draft.aiSuggestions?.predictedSizeScale || '');
  
  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showAIReasoning, setShowAIReasoning] = useState(false);

  // ESC to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Track changes
  useEffect(() => {
    const original = draft.aiSuggestions?.predictedHierarchy;
    const changed = 
      shortDesc !== (draft.shortDescription || '') ||
      longDesc !== (draft.longDescription || '') ||
      selectedDeptId !== (original?.deptId || '') ||
      selectedClassId !== (original?.classId || '') ||
      selectedSubclassId !== (original?.subclassId || '') ||
      color !== (draft.aiSuggestions?.predictedColor || '') ||
      sizeScale !== (draft.aiSuggestions?.predictedSizeScale || '');
    setHasChanges(changed);
  }, [shortDesc, longDesc, selectedDeptId, selectedClassId, selectedSubclassId, color, sizeScale, draft]);

  // ========================================================================
  // HIERARCHY CASCADING LOGIC (Reusing same structure as ReviewFilterPanel)
  // ========================================================================
  
  // Get departments from hierarchy
  const departments: DepartmentNode[] = useMemo(() => {
    if (!hierarchy?.departments) return [];
    return hierarchy.departments;
  }, [hierarchy]);

  // Get classes based on selected department
  const classes: ClassNode[] = useMemo(() => {
    if (!selectedDeptId || !hierarchy?.departments) return [];
    const dept = hierarchy.departments.find(d => d.id === selectedDeptId);
    return dept?.classes || [];
  }, [selectedDeptId, hierarchy]);

  // Get subclasses based on selected class
  const subclasses: SubclassNode[] = useMemo(() => {
    if (!selectedClassId || !classes.length) return [];
    const cls = classes.find(c => c.id === selectedClassId);
    return cls?.subclasses || [];
  }, [selectedClassId, classes]);

  // Get names for display
  const selectedDeptName = useMemo(() => 
    departments.find(d => d.id === selectedDeptId)?.name || '', 
    [departments, selectedDeptId]
  );
  
  const selectedClassName = useMemo(() => 
    classes.find(c => c.id === selectedClassId)?.name || '', 
    [classes, selectedClassId]
  );
  
  const selectedSubclassName = useMemo(() => 
    subclasses.find(s => s.id === selectedSubclassId)?.name || '', 
    [subclasses, selectedSubclassId]
  );

  // ========================================================================
  // AUTO-RESOLVE CLASS AND SUBCLASS FROM AI PREDICTIONS
  // ========================================================================
  
  // When classes become available (after dept selection), try to match AI class
  useEffect(() => {
    if (classes.length > 0 && !selectedClassId) {
      const predicted = draft.aiSuggestions?.predictedHierarchy;
      if (predicted?.classId || predicted?.class) {
        const match = findMatchingId(predicted.classId || predicted.class, classes);
        console.log('[DraftEditor] Auto-resolving class:', { 
          aiClassId: predicted.classId, 
          aiClass: predicted.class,
          availableClasses: classes.map(c => ({ id: c.id, name: c.name })).slice(0, 5),
          matched: match 
        });
        if (match) setSelectedClassId(match);
      }
    }
  }, [classes, selectedClassId, draft, findMatchingId]);

  // When subclasses become available (after class selection), try to match AI subclass
  useEffect(() => {
    if (subclasses.length > 0 && !selectedSubclassId) {
      const predicted = draft.aiSuggestions?.predictedHierarchy;
      if (predicted?.subclassId || predicted?.subclass) {
        const match = findMatchingId(predicted.subclassId || predicted.subclass, subclasses);
        console.log('[DraftEditor] Auto-resolving subclass:', { 
          aiSubclassId: predicted.subclassId, 
          aiSubclass: predicted.subclass,
          availableSubclasses: subclasses.map(s => ({ id: s.id, name: s.name })).slice(0, 5),
          matched: match 
        });
        if (match) setSelectedSubclassId(match);
      }
    }
  }, [subclasses, selectedSubclassId, draft, findMatchingId]);

  // ========================================================================
  // HANDLERS
  // ========================================================================
  
  const handleDeptChange = useCallback((deptId: string) => {
    setSelectedDeptId(deptId);
    setSelectedClassId(''); // Reset class when department changes
    setSelectedSubclassId(''); // Reset subclass
  }, []);

  const handleClassChange = useCallback((classId: string) => {
    setSelectedClassId(classId);
    setSelectedSubclassId(''); // Reset subclass when class changes
  }, []);

  const resetToAI = useCallback(() => {
    const original = draft.aiSuggestions?.predictedHierarchy;
    setShortDesc(draft.shortDescription || '');
    setLongDesc(draft.longDescription || '');
    setSelectedDeptId(original?.deptId || '');
    setSelectedClassId(original?.classId || '');
    setSelectedSubclassId(original?.subclassId || '');
    setColor(draft.aiSuggestions?.predictedColor || '');
    setSizeScale(draft.aiSuggestions?.predictedSizeScale || '');
  }, [draft]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/products/draft/${draft.sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shortDescription: shortDesc,
          longDescription: longDesc,
          hierarchy: {
            deptId: selectedDeptId,
            dept: selectedDeptName,
            classId: selectedClassId,
            class: selectedClassName,
            subclassId: selectedSubclassId,
            subclass: selectedSubclassName
          },
          color,
          sizeScale
        })
      });

      const result = await response.json();
      if (result.success) {
        // Update local draft with changes
        const updatedDraft: Draft = {
          ...draft,
          shortDescription: shortDesc,
          longDescription: longDesc,
          aiSuggestions: {
            ...draft.aiSuggestions,
            predictedHierarchy: {
              deptId: selectedDeptId,
              dept: selectedDeptName,
              classId: selectedClassId,
              class: selectedClassName,
              subclassId: selectedSubclassId,
              subclass: selectedSubclassName
            },
            predictedColor: color,
            predictedSizeScale: sizeScale
          }
        };
        onSave(updatedDraft);
      } else {
        setError(result.error?.message || 'Failed to save');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    }

    setIsSaving(false);
  };

  const getConfidenceColor = (conf: number | undefined) => {
    if (!conf) return 'gray';
    if (conf >= 0.8) return 'emerald';
    if (conf >= 0.5) return 'purple';
    return 'amber';
  };

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header with prominent close button */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-pink-50 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Edit Draft</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {draft.imageName} • Session #{draft.sessionId}
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 bg-white hover:bg-gray-100 rounded-full transition-colors shadow-sm border border-gray-200"
            title="Close (ESC)"
          >
            <X size={20} className="text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-6">
            {/* Left: Image & AI Info */}
            <div className="space-y-4">
              {/* Image Preview */}
              <div className="aspect-square bg-gray-100 rounded-xl overflow-hidden border border-gray-200 relative">
                <img
                  src={`${API_BASE_URL}/products/draft/${draft.sessionId}/image`}
                  alt={draft.imageName || 'Product'}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                {/* Fallback placeholder - shown when image fails */}
                <div className="absolute inset-0 flex items-center justify-center text-gray-300 pointer-events-none">
                  <div className="text-center">
                    <svg className="w-12 h-12 mx-auto mb-2 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                    </svg>
                    <span className="text-xs">Loading...</span>
                  </div>
                </div>
              </div>

              {/* AI Confidence */}
              {draft.aiSuggestions?.predictedHierarchy?.confidence && (
                <div className="p-4 bg-purple-50/50 border border-purple-100 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles size={14} className="text-purple-500" />
                    <span className="text-xs font-bold text-purple-700 uppercase tracking-wider">
                      AI Confidence Scores
                    </span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { label: 'Department', value: draft.aiSuggestions.predictedHierarchy.confidence.department },
                      { label: 'Class', value: draft.aiSuggestions.predictedHierarchy.confidence.class },
                      { label: 'Subclass', value: draft.aiSuggestions.predictedHierarchy.confidence.subclass }
                    ].filter(item => item.value !== undefined).map(item => {
                      const pct = Math.round((item.value || 0) * 100);
                      const colorClass = getConfidenceColor(item.value);
                      return (
                        <div key={item.label} className="flex items-center gap-2">
                          <span className="text-xs text-gray-600 w-20">{item.label}</span>
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all ${
                                colorClass === 'emerald' ? 'bg-emerald-500' :
                                colorClass === 'purple' ? 'bg-purple-500' :
                                colorClass === 'amber' ? 'bg-amber-500' : 'bg-gray-400'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={`text-xs font-bold w-10 text-right ${
                            colorClass === 'emerald' ? 'text-emerald-600' :
                            colorClass === 'purple' ? 'text-purple-600' :
                            colorClass === 'amber' ? 'text-amber-600' : 'text-gray-500'
                          }`}>{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                  
                  {draft.aiSuggestions?.reasoning && (
                    <button 
                      onClick={() => setShowAIReasoning(!showAIReasoning)}
                      className="mt-3 text-[10px] font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1"
                    >
                      <Eye size={10} />
                      {showAIReasoning ? 'Hide' : 'Show'} AI Reasoning
                    </button>
                  )}
                  
                  {showAIReasoning && draft.aiSuggestions?.reasoning && (
                    <p className="mt-2 text-xs text-gray-600 italic bg-white p-2 rounded-lg border border-purple-100">
                      {draft.aiSuggestions.reasoning}
                    </p>
                  )}
                </div>
              )}

              {/* Current AI Values (for reference) */}
              <div className="p-3 bg-gray-50 rounded-lg text-xs">
                <p className="font-bold text-gray-600 mb-2">AI Predicted:</p>
                <div className="space-y-1 text-gray-500">
                  <p>Dept: <span className="text-gray-700">{draft.aiSuggestions?.predictedHierarchy?.dept || 'N/A'}</span></p>
                  <p>Class: <span className="text-gray-700">{draft.aiSuggestions?.predictedHierarchy?.class || 'N/A'}</span></p>
                  <p>Subclass: <span className="text-gray-700">{draft.aiSuggestions?.predictedHierarchy?.subclass || 'N/A'}</span></p>
                </div>
              </div>
            </div>

            {/* Right: Edit Form */}
            <div className="space-y-4">
              {/* Hierarchy Selection - CASCADING DROPDOWNS */}
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <Layers size={14} className="text-gray-500" />
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Product Hierarchy
                  </span>
                  {hasChanges && (
                    <button onClick={resetToAI} className="ml-auto text-[10px] text-purple-600 hover:text-purple-700 flex items-center gap-1">
                      <Undo size={10} />
                      Reset to AI
                    </button>
                  )}
                </div>

                {/* Department Dropdown */}
                <div className="mb-3">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                    Department <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={selectedDeptId}
                      onChange={(e) => handleDeptChange(e.target.value)}
                      className="w-full h-10 px-3 pr-8 text-sm bg-white border border-gray-200 rounded-lg focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none appearance-none cursor-pointer"
                    >
                      <option value="">Select Department...</option>
                      {departments.map(dept => (
                        <option key={dept.id} value={dept.id}>{dept.name} ({dept.id})</option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                  {departments.length === 0 && (
                    <p className="text-[10px] text-amber-600 mt-1">⚠ No departments loaded</p>
                  )}
                </div>

                {/* Class Dropdown */}
                <div className="mb-3">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                    Class
                  </label>
                  <div className="relative">
                    <select
                      value={selectedClassId}
                      onChange={(e) => handleClassChange(e.target.value)}
                      disabled={!selectedDeptId || classes.length === 0}
                      className="w-full h-10 px-3 pr-8 text-sm bg-white border border-gray-200 rounded-lg focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none appearance-none cursor-pointer disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                    >
                      <option value="">{selectedDeptId ? (classes.length > 0 ? 'Select Class...' : 'No classes available') : 'Select Department first'}</option>
                      {classes.map(cls => (
                        <option key={cls.id} value={cls.id}>{cls.name} ({cls.id})</option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Subclass Dropdown */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                    Subclass <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={selectedSubclassId}
                      onChange={(e) => setSelectedSubclassId(e.target.value)}
                      disabled={!selectedClassId || subclasses.length === 0}
                      className="w-full h-10 px-3 pr-8 text-sm bg-white border border-gray-200 rounded-lg focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none appearance-none cursor-pointer disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                    >
                      <option value="">{selectedClassId ? (subclasses.length > 0 ? 'Select Subclass...' : 'No subclasses available') : 'Select Class first'}</option>
                      {subclasses.map(sub => (
                        <option key={sub.id} value={sub.id}>{sub.name} ({sub.id})</option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Attributes */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Primary Color</label>
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="e.g. Pink, Navy Blue"
                    className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Size Scale</label>
                  <div className="relative">
                    <select
                      value={sizeScale}
                      onChange={(e) => setSizeScale(e.target.value)}
                      className="w-full h-10 px-3 pr-8 text-sm bg-white border border-gray-200 rounded-lg focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none appearance-none cursor-pointer"
                    >
                      <option value="">Select...</option>
                      <option value="XS-XL">XS-XL</option>
                      <option value="S-L">S-L</option>
                      <option value="2T-6X">2T-6X (Toddler)</option>
                      <option value="4-14">4-14 (Kids)</option>
                      <option value="One Size">One Size</option>
                      <option value="Numeric">Numeric (28-38)</option>
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Descriptions */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                  Short Description <span className="text-gray-400">(30 chars max)</span>
                </label>
                <input
                  type="text"
                  value={shortDesc}
                  onChange={(e) => setShortDesc(e.target.value.substring(0, 30))}
                  maxLength={30}
                  placeholder="Brief product title"
                  className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none"
                />
                <p className="text-[10px] text-gray-400 mt-1 text-right">{shortDesc.length}/30</p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Long Description</label>
                <textarea
                  value={longDesc}
                  onChange={(e) => setLongDesc(e.target.value)}
                  placeholder="Detailed product description"
                  rows={3}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none resize-none"
                />
              </div>

              {/* Validation Errors */}
              {draft.errorLog && (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={14} className="text-amber-500 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-bold text-amber-700 uppercase mb-1">Missing Required Fields</p>
                      <p className="text-xs text-amber-600">{draft.errorLog}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Error Display */}
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg flex items-center gap-2">
                  <AlertCircle size={14} className="text-rose-500" />
                  <p className="text-xs text-rose-700">{error}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <div className="text-xs text-gray-500 flex items-center gap-2">
            {hasChanges && <span className="text-purple-600 font-medium">• Unsaved changes</span>}
            <span className="text-gray-400">Press ESC to close</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              variant="primary" 
              size="sm" 
              onClick={handleSave}
              disabled={isSaving}
              isLoading={isSaving}
              icon={<Save size={14} />}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DraftEditor;
