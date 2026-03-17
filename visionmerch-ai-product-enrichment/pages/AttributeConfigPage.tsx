/**
 * AttributeConfigPage - Hierarchy Rule Management
 * 
 * Professional, high-density rule editor for catalog governance.
 * Enhanced with hierarchical path display and tree navigation.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Settings2, ChevronRight, Plus, Trash2, Save, 
  AlertCircle, CheckCircle2, Loader2, Layers, 
  Sparkles, Search, ArrowRight, Activity, Filter,
  Target, Info, Database, Wand2, Users, ChevronDown,
  FolderTree, Tag, Package
} from 'lucide-react';
import { API_BASE_URL } from '../src/api/config';
import { 
  fetchHierarchyRules, 
  saveHierarchyRule, 
  deleteHierarchyRule, 
  fetchRuleImpactPreview,
  seedTemplatesFromMapping
} from '../src/api/client';
import { HierarchyTree } from '../types';
import { Button, Card, Input, Select, SearchableSelect } from '../components/shared/UI';

interface HierarchyRule {
  ruleId?: number;
  businessUnitId: number;
  levelType: 'DEPT' | 'CLASS' | 'SUBCLASS' | 'STYLE';
  levelId: string;
  characteristicTypeId: string;
  isMandatory: boolean;
  applicability: 'REQUIRED' | 'OPTIONAL' | 'NA';
  defaultValueId?: string;
  characteristicName?: string;
}

/** Breadcrumb component for hierarchical path display */
const HierarchyBreadcrumb: React.FC<{
  deptId?: string;
  deptName?: string;
  classId?: string;
  className?: string;
  subclassId?: string;
  subclassName?: string;
}> = ({ deptId, deptName, classId, className, subclassId, subclassName }) => {
  const segments = [
    deptId && { id: deptId, name: deptName || deptId, type: 'DEPT', icon: FolderTree },
    classId && { id: classId, name: className || classId, type: 'CLASS', icon: Tag },
    subclassId && { id: subclassId, name: subclassName || subclassId, type: 'SUBCLASS', icon: Package }
  ].filter(Boolean) as Array<{ id: string; name: string; type: string; icon: any }>;

  if (segments.length === 0) return null;

  return (
    <div className="flex items-center gap-1 text-sm">
      {segments.map((seg, idx) => (
        <React.Fragment key={seg.id}>
          {idx > 0 && <ChevronRight size={14} className="text-gray-300 mx-0.5" />}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 border border-gray-100">
            <seg.icon size={12} className="text-gray-400" />
            <span className="font-semibold text-gray-700">{seg.name}</span>
            <span className="text-[9px] font-bold text-gray-400 uppercase">{seg.id}</span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};

/** Lightweight hierarchy tree browser - only shows departments initially */
const HierarchyTreeBrowser: React.FC<{
  hierarchy: HierarchyTree | null;
  selectedPath: { deptId?: string; classId?: string; subclassId?: string };
  onSelect: (path: { deptId: string; classId?: string; subclassId?: string }) => void;
}> = ({ hierarchy, selectedPath, onSelect }) => {
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());

  // Only expand when user clicks, don't render everything upfront
  const toggleDept = (e: React.MouseEvent, deptId: string) => {
    e.stopPropagation();
    setExpandedDepts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(deptId)) newSet.delete(deptId);
      else newSet.add(deptId);
      return newSet;
    });
  };

  const toggleClass = (e: React.MouseEvent, classId: string) => {
    e.stopPropagation();
    setExpandedClasses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(classId)) newSet.delete(classId);
      else newSet.add(classId);
      return newSet;
    });
  };

  if (!hierarchy) return null;

  // Limit to first 50 departments for performance
  const visibleDepts = hierarchy.departments.slice(0, 50);

  return (
    <div className="text-xs space-y-0.5 max-h-64 overflow-y-auto custom-scrollbar">
      {visibleDepts.map(dept => {
        const deptExpanded = expandedDepts.has(dept.id);
        const deptSelected = selectedPath.deptId === dept.id && !selectedPath.classId;

        return (
          <div key={dept.id}>
            <div 
              onClick={() => onSelect({ deptId: dept.id })}
              className={`flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer transition-all ${
                deptSelected ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50'
              }`}
            >
              <button onClick={(e) => toggleDept(e, dept.id)} className="p-0.5 hover:bg-gray-100 rounded">
                <ChevronRight size={12} className={`transition-transform ${deptExpanded ? 'rotate-90' : ''}`} />
              </button>
              <FolderTree size={12} className="text-gray-400" />
              <span className="flex-1 font-medium truncate">{dept.name}</span>
              <span className="text-[9px] text-gray-400">{dept.classes.length}</span>
            </div>
            
            {deptExpanded && dept.classes.slice(0, 30).map(cls => {
              const classExpanded = expandedClasses.has(cls.id);
              const classSelected = selectedPath.deptId === dept.id && selectedPath.classId === cls.id && !selectedPath.subclassId;

              return (
                <div key={cls.id} className="ml-4">
                  <div 
                    onClick={() => onSelect({ deptId: dept.id, classId: cls.id })}
                    className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer transition-all ${
                      classSelected ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50'
                    }`}
                  >
                    <button onClick={(e) => toggleClass(e, cls.id)} className="p-0.5 hover:bg-gray-100 rounded">
                      <ChevronRight size={10} className={`transition-transform ${classExpanded ? 'rotate-90' : ''}`} />
                    </button>
                    <Tag size={10} className="text-gray-400" />
                    <span className="flex-1 font-medium truncate">{cls.name}</span>
                    <span className="text-[9px] text-gray-400">{cls.subclasses.length}</span>
                  </div>

                  {classExpanded && cls.subclasses.slice(0, 20).map(sub => {
                    const subSelected = selectedPath.deptId === dept.id && selectedPath.classId === cls.id && selectedPath.subclassId === sub.id;

                    return (
                      <div
                        key={sub.id}
                        onClick={() => onSelect({ deptId: dept.id, classId: cls.id, subclassId: sub.id })}
                        className={`ml-5 flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-all ${
                          subSelected ? 'bg-indigo-100 text-indigo-700 font-semibold' : 'hover:bg-gray-50'
                        }`}
                      >
                        <Package size={10} className="text-gray-400" />
                        <span className="flex-1 truncate">{sub.name}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
      {hierarchy.departments.length > 50 && (
        <div className="text-center text-[10px] text-gray-400 py-2">
          Use dropdowns for full list ({hierarchy.departments.length} departments)
        </div>
      )}
    </div>
  );
};

interface AttributeConfigPageProps {
  businessUnitId: number;
  hierarchy: HierarchyTree | null;
}

export const AttributeConfigPage: React.FC<AttributeConfigPageProps> = ({ businessUnitId, hierarchy }) => {
  const [selectedLevel, setSelectedLevel] = useState<{
    type: 'DEPT' | 'CLASS' | 'SUBCLASS';
    id: string;           // The API-level ID (compound for SUBCLASS: DEPT/CLASS/SUBCLASS)
    label: string;
    // Full path info for display
    deptId?: string;
    deptName?: string;
    classId?: string;
    className?: string;
    subclassId?: string;
    subclassName?: string;
  } | null>(null);

  // Filter state for sidebar
  const [filters, setFilters] = useState({
    deptId: '',
    classId: '',
    subclassId: ''
  });
  
  // View mode: 'dropdowns' or 'tree'
  const [viewMode, setViewMode] = useState<'dropdowns' | 'tree'>('dropdowns');

  const [rules, setRules] = useState<HierarchyRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [charTypes, setCharTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Impact preview state
  const [impactPreview, setImpactPreview] = useState<{ totalProducts: number } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  
  // Seeding state
  const [seeding, setSeeding] = useState(false);

  // Reset state when BU changes - CRITICAL FIX
  useEffect(() => {
    setFilters({ deptId: '', classId: '', subclassId: '' });
    setSelectedLevel(null);
    setRules([]);
  }, [businessUnitId]);

  // Derived data for sidebar
  const departments = hierarchy?.departments || [];
  const classes = React.useMemo(() => {
    if (!filters.deptId) return [];
    return departments.find(d => d.id === filters.deptId)?.classes || [];
  }, [departments, filters.deptId]);

  const subclasses = React.useMemo(() => {
    if (!filters.deptId) return [];
    const dept = departments.find(d => d.id === filters.deptId);
    if (!dept) return [];

    // If a class is selected, filter subclasses by that class
    if (filters.classId) {
      return classes.find(c => c.id === filters.classId)?.subclasses || [];
    }

    // Flexible mode: Aggregate all subclasses within the department if no class is selected
    const allSub: any[] = [];
    const seen = new Set();
    dept.classes.forEach(c => {
      c.subclasses.forEach(s => {
        if (!seen.has(s.id)) {
          seen.add(s.id);
          allSub.push(s);
        }
      });
    });
    return allSub;
  }, [departments, classes, filters.deptId, filters.classId]);

  // Helper: Find which class contains a given subclass
  const findClassForSubclass = useCallback((subclassId: string): string => {
    if (filters.classId) return filters.classId;
    const dept = departments.find(d => d.id === filters.deptId);
    if (!dept) return '';
    for (const cls of dept.classes) {
      if (cls.subclasses.some(s => s.id === subclassId)) {
        return cls.id;
      }
    }
    return '';
  }, [departments, filters.deptId, filters.classId]);

  useEffect(() => {
    const fetchTypes = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/attributes/config/types?business_unit_id=${businessUnitId}`);
        const result = await res.json();
        if (result.success) {
          // Deduplicate by CHARACTERISTIC_TYPE_ID to prevent React key warnings from legacy data
          const uniqueMap = new Map();
          result.data.forEach((r: any) => {
            if (!uniqueMap.has(r.CHARACTERISTIC_TYPE_ID)) {
              uniqueMap.set(r.CHARACTERISTIC_TYPE_ID, {
                id: r.CHARACTERISTIC_TYPE_ID,
                name: r.DESCRIPTION
              });
            }
          });
          setCharTypes(Array.from(uniqueMap.values()));
        }
      } catch (err) {
        console.error('Failed to load char types', err);
      }
    };
    fetchTypes();
  }, [businessUnitId]);

  useEffect(() => {
    if (selectedLevel) {
      loadRules();
      loadImpactPreview();
    } else {
      setImpactPreview(null);
    }
  }, [selectedLevel]);

  const loadRules = useCallback(async () => {
    if (!selectedLevel) return;
    setLoading(true);
    setError(null);
    try {
      // Don't include children - load only rules for the exact selected level
      // This prevents loading 10,000+ rules when selecting a department
      const result = await fetchHierarchyRules(
        businessUnitId,
        selectedLevel.type,
        selectedLevel.id,
        false // Never load children - use subclass selection for specific rules
      );
      if (result.success && result.data) {
        // Limit to 100 rules max for UI performance
        setRules(result.data.slice(0, 100));
        if (result.data.length > 100) {
          console.warn(`Truncated ${result.data.length} rules to 100 for UI performance`);
        }
      }
    } catch (err: any) {
      setError(`Failed to load rules: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [businessUnitId, selectedLevel]);

  const loadImpactPreview = useCallback(async () => {
    if (!selectedLevel) return;
    setLoadingPreview(true);
    try {
      const result = await fetchRuleImpactPreview(
        businessUnitId,
        selectedLevel.type as 'DEPT' | 'CLASS' | 'SUBCLASS',
        selectedLevel.id
      );
      if (result.success && result.data) {
        setImpactPreview(result.data);
      }
    } catch {
      // Preview is optional, don't show error
    } finally {
      setLoadingPreview(false);
    }
  }, [businessUnitId, selectedLevel]);

  const handleAddRule = useCallback(() => {
    if (!selectedLevel) {
      console.warn('Cannot add rule: no level selected');
      return;
    }
    const newRule: HierarchyRule = {
      businessUnitId,
      levelType: selectedLevel.type,
      levelId: selectedLevel.id,
      characteristicTypeId: '',
      isMandatory: false,
      applicability: 'OPTIONAL'
    };
    // Add new rule at the BEGINNING so it's always visible
    setRules(prevRules => [newRule, ...prevRules]);
    // Clear any error messages
    setError(null);
    setSuccess('New attribute rule added - configure and save below');
    setTimeout(() => setSuccess(null), 3000);
  }, [selectedLevel, businessUnitId]);

  const handleUpdateRule = (index: number, updates: Partial<HierarchyRule>) => {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], ...updates };
    setRules(newRules);
  };

  const handleSaveRule = async (index: number) => {
    const rule = rules[index];
    if (!rule.characteristicTypeId) {
      setError('Please select an attribute type');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await saveHierarchyRule(rule);
      if (result.success) {
        setSuccess('Rule saved successfully');
        setTimeout(() => setSuccess(null), 3000);
        loadRules();
      } else {
        setError(result.error?.message || 'Failed to save rule');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (index: number) => {
    const rule = rules[index];
    
    // If it's a new unsaved rule, just remove from local state
    if (!rule.ruleId) {
      setRules(rules.filter((_, i) => i !== index));
      return;
    }
    
    // Confirm before deleting
    if (!window.confirm(`Delete this governance rule for "${rule.characteristicName || rule.characteristicTypeId}"?`)) {
      return;
    }
    
    setDeleting(rule.ruleId);
    setError(null);
    try {
      const result = await deleteHierarchyRule(rule.ruleId);
      if (result.success) {
        setSuccess('Rule deleted successfully');
        setTimeout(() => setSuccess(null), 3000);
        setRules(rules.filter((_, i) => i !== index));
      } else {
        setError(result.error?.message || 'Failed to delete rule');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  };

  const handleSeedFromTaxonomy = async () => {
    if (!selectedLevel || !filters.deptId) return;
    
    setSeeding(true);
    setError(null);
    try {
      const result = await seedTemplatesFromMapping(
        businessUnitId,
        filters.deptId,
        filters.classId || '',
        filters.subclassId || null,
        'advisory'
      );
      if (result.success) {
        setSuccess('Templates seeded successfully');
        setTimeout(() => setSuccess(null), 3000);
        loadRules();
      } else {
        setError(result.error?.message || 'Failed to seed templates');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSeeding(false);
    }
  };

  const groupedRules = React.useMemo(() => {
    if (selectedLevel?.type !== 'DEPT') return { 'Current Selection': rules };
    
    return rules.reduce((acc, rule) => {
      let groupName = 'Department Rules';
      if (rule.levelType === 'CLASS') {
        const cls = classes.find(c => c.id === rule.levelId);
        groupName = cls ? `Class: ${cls.name}` : `Class: ${rule.levelId}`;
      } else if (rule.levelType === 'SUBCLASS') {
        const sub = subclasses.find(s => s.id === rule.levelId);
        groupName = sub ? `Subclass: ${sub.name}` : `Subclass: ${rule.levelId}`;
      }
      
      if (!acc[groupName]) acc[groupName] = [];
      acc[groupName].push(rule);
      return acc;
    }, {} as Record<string, HierarchyRule[]>);
  }, [selectedLevel, rules, classes, subclasses]);

  return (
    <div className="h-full flex bg-white overflow-hidden">
      {/* 1. Sidebar Hierarchy & Quick Access - Steve Jobs Style */}
      <aside className="w-80 border-r border-gray-100 bg-white flex flex-col z-10 shrink-0">
        <div className="p-8 pb-6 flex-shrink-0">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gray-900 text-white flex items-center justify-center shadow-lg shadow-gray-200/50">
              <Layers size={20} />
            </div>
            <div>
              <h2 className="text-sm font-black text-gray-900 tracking-tight leading-none">Governance</h2>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1.5">Rule Orchestrator</p>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex bg-gray-100 p-0.5 rounded-lg mb-6">
            <button
              onClick={() => setViewMode('dropdowns')}
              className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
                viewMode === 'dropdowns' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              Filters
            </button>
            <button
              onClick={() => setViewMode('tree')}
              className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
                viewMode === 'tree' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              Tree
            </button>
          </div>

          {viewMode === 'dropdowns' ? (
            <div className="space-y-6">
              <SearchableSelect
                label="Department"
                value={filters.deptId}
                onChange={(val) => {
                  const id = Array.isArray(val) ? val[0] : val;
                  const dept = departments.find(d => d.id === id);
                  setFilters({ deptId: id, classId: '', subclassId: '' });
                  if (id) {
                    setSelectedLevel({ 
                      type: 'DEPT', 
                      id: id, 
                      label: dept?.name || id,
                      deptId: id,
                      deptName: dept?.name
                    });
                  } else {
                    setSelectedLevel(null);
                  }
                }}
                options={departments}
                placeholder="Select Department..."
                data-testid="governance-dept-select"
              />

              <SearchableSelect
                label="Class"
                value={filters.classId}
                onChange={(val) => {
                  const id = Array.isArray(val) ? val[0] : val;
                  const cls = classes.find(c => c.id === id);
                  const dept = departments.find(d => d.id === filters.deptId);
                  setFilters(f => ({ ...f, classId: id, subclassId: '' }));
                  if (id) {
                    // Use compound ID for CLASS level: DEPT/CLASS
                    setSelectedLevel({ 
                      type: 'CLASS', 
                      id: `${filters.deptId}/${id}`,
                      label: cls?.name || id,
                      deptId: filters.deptId,
                      deptName: dept?.name,
                      classId: id,
                      className: cls?.name
                    });
                  } else if (filters.deptId) {
                    setSelectedLevel({ 
                      type: 'DEPT', 
                      id: filters.deptId, 
                      label: dept?.name || filters.deptId,
                      deptId: filters.deptId,
                      deptName: dept?.name
                    });
                  }
                }}
                options={classes}
                placeholder="Select Class..."
                disabled={!filters.deptId}
                data-testid="governance-class-select"
              />

              <SearchableSelect
                label="Subclass"
                value={filters.subclassId}
                onChange={(val) => {
                  const id = Array.isArray(val) ? val[0] : val;
                  const sub = subclasses.find(s => s.id === id);
                  const cls = classes.find(c => c.id === filters.classId);
                  const dept = departments.find(d => d.id === filters.deptId);
                  setFilters(f => ({ ...f, subclassId: id }));
                  if (id) {
                    // Use compound ID for SUBCLASS: DEPT/CLASS/SUBCLASS
                    const classIdPart = filters.classId || findClassForSubclass(id);
                    setSelectedLevel({ 
                      type: 'SUBCLASS', 
                      id: `${filters.deptId}/${classIdPart}/${id}`,
                      label: sub?.name || id,
                      deptId: filters.deptId,
                      deptName: dept?.name,
                      classId: classIdPart,
                      className: cls?.name || classIdPart,
                      subclassId: id,
                      subclassName: sub?.name
                    });
                  } else if (filters.classId) {
                    setSelectedLevel({ 
                      type: 'CLASS', 
                      id: `${filters.deptId}/${filters.classId}`,
                      label: cls?.name || filters.classId,
                      deptId: filters.deptId,
                      deptName: dept?.name,
                      classId: filters.classId,
                      className: cls?.name
                    });
                  } else if (filters.deptId) {
                    setSelectedLevel({ 
                      type: 'DEPT', 
                      id: filters.deptId, 
                      label: dept?.name || filters.deptId,
                      deptId: filters.deptId,
                      deptName: dept?.name
                    });
                  }
                }}
                options={subclasses}
                placeholder="Select Subclass..."
                disabled={!filters.deptId}
                data-testid="governance-subclass-select"
              />
            </div>
          ) : (
            <HierarchyTreeBrowser
              hierarchy={hierarchy}
              selectedPath={{ 
                deptId: filters.deptId, 
                classId: filters.classId, 
                subclassId: filters.subclassId 
              }}
              onSelect={(path) => {
                const dept = departments.find(d => d.id === path.deptId);
                const cls = dept?.classes.find(c => c.id === path.classId);
                const sub = cls?.subclasses.find(s => s.id === path.subclassId);
                
                setFilters({
                  deptId: path.deptId,
                  classId: path.classId || '',
                  subclassId: path.subclassId || ''
                });
                
                if (path.subclassId && path.classId) {
                  setSelectedLevel({
                    type: 'SUBCLASS',
                    id: `${path.deptId}/${path.classId}/${path.subclassId}`,
                    label: sub?.name || path.subclassId,
                    deptId: path.deptId,
                    deptName: dept?.name,
                    classId: path.classId,
                    className: cls?.name,
                    subclassId: path.subclassId,
                    subclassName: sub?.name
                  });
                } else if (path.classId) {
                  setSelectedLevel({
                    type: 'CLASS',
                    id: `${path.deptId}/${path.classId}`,
                    label: cls?.name || path.classId,
                    deptId: path.deptId,
                    deptName: dept?.name,
                    classId: path.classId,
                    className: cls?.name
                  });
                } else {
                  setSelectedLevel({
                    type: 'DEPT',
                    id: path.deptId,
                    label: dept?.name || path.deptId,
                    deptId: path.deptId,
                    deptName: dept?.name
                  });
                }
              }}
            />
          )}
        </div>

        {/* Active Attributes Summary on Sidebar */}
        {selectedLevel && (
          <div className="flex-1 overflow-y-auto px-8 py-4 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Active Attributes</span>
              <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[9px] font-black text-gray-500 tabular-nums">{rules.length}{rules.length >= 100 ? '+' : ''}</span>
            </div>
            
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin text-gray-400" size={20} />
              </div>
            ) : (
              <div className="space-y-1.5 overflow-y-auto custom-scrollbar flex-1 pr-2">
                {/* Only show first 15 rules in sidebar for performance */}
                {rules.slice(0, 15).map((rule, idx) => (
                  <div 
                    key={rule.ruleId || idx}
                    className="flex items-center justify-between group p-2 hover:bg-gray-50 rounded-lg transition-all"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-[11px] font-bold text-gray-700 truncate">
                        {rule.characteristicName || rule.characteristicTypeId || 'New Rule'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1 h-1 rounded-full ${rule.isMandatory ? 'bg-rose-500' : 'bg-amber-400'}`} />
                        <span className="text-[9px] font-medium text-gray-400 uppercase">{rule.applicability}</span>
                      </div>
                    </div>
                  </div>
                ))}
                
                {rules.length > 15 && (
                  <div className="text-center text-[10px] text-gray-400 py-2">
                    +{rules.length - 15} more (see main panel)
                  </div>
                )}
                
                <button 
                  onClick={handleAddRule}
                  className="w-full mt-4 py-2 border border-dashed border-gray-200 rounded-lg flex items-center justify-center gap-2 text-gray-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group"
                >
                  <Plus size={14} className="group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Add Attribute</span>
                </button>
              </div>
            )}
          </div>
        )}

        <div className="p-8 pt-4 border-t border-gray-50 flex-shrink-0 space-y-4">
          {/* Impact Preview */}
          {selectedLevel && (
            <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100/50">
              <div className="flex items-center gap-2 mb-2">
                <Users size={14} className="text-indigo-600" />
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Impact Scope</span>
              </div>
              {loadingPreview ? (
                <div className="flex items-center gap-2 text-indigo-400">
                  <Loader2 size={12} className="animate-spin" />
                  <span className="text-[11px]">Calculating...</span>
                </div>
              ) : impactPreview ? (
                <p className="text-[11px] text-indigo-600 font-bold">
                  {impactPreview.totalProducts.toLocaleString()} products affected
                </p>
              ) : (
                <p className="text-[11px] text-indigo-400">Select a level to see impact</p>
              )}
            </div>
          )}
          
          {/* Intelligent Seeding */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100/50">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-indigo-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Intelligent Seeding</span>
            </div>
            <p className="text-[11px] text-gray-400 font-medium leading-relaxed mb-3">
              Auto-populate rules from Shopify taxonomy templates.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSeedFromTaxonomy}
              disabled={!selectedLevel || seeding}
              isLoading={seeding}
              icon={<Wand2 size={12} />}
              className="w-full text-[10px]"
              data-testid="seed-templates-btn"
            >
              Seed Templates
            </Button>
          </div>
        </div>
      </aside>

      {/* 2. Main Workspace */}
      <main className="flex-1 flex flex-col bg-[#F9FAFB] overflow-hidden">
        {!selectedLevel ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center animate-in fade-in duration-700">
            <div className="w-20 h-20 bg-white border border-gray-100 rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-gray-200/50">
              <Settings2 size={40} className="text-gray-200" strokeWidth={1.5} />
            </div>
            <h3 className="text-xl font-black text-gray-900 tracking-tight">Catalog Intelligence</h3>
            <p className="text-sm text-gray-400 mt-3 max-w-[280px] font-medium leading-relaxed">
              Choose a hierarchy level from the sidebar to manage mandatory attributes and governance rules.
            </p>
          </div>
        ) : (
          <>
            <header className="px-10 py-6 bg-white border-b border-gray-100 z-10 shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  {/* Breadcrumb Path */}
                  <HierarchyBreadcrumb
                    deptId={selectedLevel.deptId}
                    deptName={selectedLevel.deptName}
                    classId={selectedLevel.classId}
                    className={selectedLevel.className}
                    subclassId={selectedLevel.subclassId}
                    subclassName={selectedLevel.subclassName}
                  />
                  
                  {/* Title and Level Badge */}
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight" data-testid="rule-scope-label">
                      {selectedLevel.label}
                    </h1>
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                      selectedLevel.type === 'SUBCLASS' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                      selectedLevel.type === 'CLASS' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                      'bg-indigo-50 text-indigo-600 border border-indigo-100'
                    }`}>
                      {selectedLevel.type} Level
                    </span>
                  </div>
                  
                  {/* Scope ID */}
                  <p className="text-[11px] font-mono text-gray-400">
                    Rule Scope: <span className="text-gray-600">{selectedLevel.id}</span>
                  </p>
                </div>
                
                <Button 
                  onClick={handleAddRule} 
                  variant="primary" 
                  size="sm" 
                  icon={<Plus size={16} />} 
                  data-testid="add-rule-btn"
                  className="shadow-xl shadow-indigo-200/50 px-6"
                >
                  Add Attribute
                </Button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar" data-testid="rules-container">
              {(error || success) && (
                <div className={`mb-8 p-4 rounded-xl border flex items-center gap-3 text-sm font-bold animate-in slide-in-from-top-4 duration-500 shadow-sm ${
                  error ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-emerald-50 border-emerald-100 text-emerald-600'
                }`} data-testid="rule-alert">
                  {error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
                  <span>{error || success}</span>
                </div>
              )}

              {loading ? (
                <div className="flex flex-col items-center justify-center py-32 gap-4">
                  <Loader2 className="animate-spin text-indigo-600" size={40} strokeWidth={3} />
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Orchestrating rules...</p>
                </div>
              ) : rules.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 text-center bg-white border border-dashed border-gray-200 rounded-3xl">
                  <Activity className="text-gray-100 mb-6" size={64} strokeWidth={1} />
                  <h4 className="text-lg font-black text-gray-900 tracking-tight">Inherited Intelligence</h4>
                  <p className="text-sm text-gray-400 mt-2 max-w-xs font-medium leading-relaxed">
                    This scope currently inherits rules from its parent. Add custom rules to override.
                  </p>
                </div>
              ) : (
                <div className="space-y-12">
                  {Object.entries(groupedRules).map(([groupName, groupRules]) => (
                    <section key={groupName} className="space-y-6">
                      <div className="flex items-center gap-4 px-2">
                        <div className="h-px flex-1 bg-gray-100" />
                        <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] bg-[#F9FAFB] px-4 whitespace-nowrap">{groupName}</h2>
                        <div className="h-px flex-1 bg-gray-100" />
                      </div>
                      
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6" data-testid="rules-list">
                        {groupRules.map((rule) => {
                          const idx = rules.findIndex(r => r === rule);
                          return (
                            <div 
                              key={idx} 
                              data-testid={`rule-card-${rule.characteristicTypeId || 'new-' + idx}`}
                              className={`group bg-white p-8 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-500 ${
                                !rule.ruleId ? 'ring-2 ring-indigo-500 ring-offset-4' : ''
                              }`}
                            >
                              <div className="space-y-8">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1">
                                    <Select 
                                      label="Linked Attribute"
                                      value={rule.characteristicTypeId}
                                      onChange={(e) => handleUpdateRule(idx, { characteristicTypeId: e.target.value })}
                                      disabled={!!rule.ruleId}
                                      placeholder="Select Attribute Definition..."
                                      options={charTypes.map(type => ({ value: type.id, label: type.name }))}
                                      data-testid={`rule-attr-select-${idx}`}
                                    />
                                  </div>
                                  <div className="pt-6">
                                    <button 
                                      onClick={() => handleDeleteRule(idx)}
                                      disabled={deleting === rule.ruleId}
                                      data-testid={`rule-delete-btn-${idx}`}
                                      className="p-2.5 bg-gray-50 text-gray-300 rounded-xl hover:text-rose-600 hover:bg-rose-50 transition-all group-hover:text-gray-400 disabled:opacity-50"
                                    >
                                      {deleting === rule.ruleId ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                                    </button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-8">
                                  <div className="space-y-3">
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Policy Enforcement</label>
                                    <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100" data-testid={`rule-applicability-toggle-${idx}`}>
                                      {(['REQUIRED', 'OPTIONAL', 'NA'] as const).map(opt => (
                                        <button
                                          key={opt}
                                          onClick={() => handleUpdateRule(idx, { applicability: opt })}
                                          data-testid={`rule-applicability-${opt}-${idx}`}
                                          className={`flex-1 py-2 rounded-lg text-[10px] font-black transition-all ${
                                            rule.applicability === opt 
                                              ? 'bg-white text-indigo-600 shadow-sm border border-gray-100' 
                                              : 'text-gray-400 hover:text-gray-600'
                                          }`}
                                        >
                                          {opt}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Data Validation</label>
                                    <button 
                                      onClick={() => handleUpdateRule(idx, { isMandatory: !rule.isMandatory })}
                                      data-testid={`rule-mandatory-toggle-${idx}`}
                                      className={`w-full py-2.5 rounded-xl text-[10px] font-black uppercase border transition-all ${
                                        rule.isMandatory 
                                          ? 'bg-rose-50 border-rose-100 text-rose-600' 
                                          : 'bg-gray-50 border-gray-100 text-gray-400 hover:bg-white'
                                      }`}
                                    >
                                      {rule.isMandatory ? 'Mandatory' : 'Advisory'}
                                    </button>
                                  </div>
                                </div>

                                <div className="pt-2">
                                  <Button 
                                    onClick={() => handleSaveRule(idx)}
                                    data-testid={`rule-save-btn-${idx}`}
                                    className="w-full py-3 rounded-2xl bg-gray-900 text-white hover:bg-black transition-all shadow-lg shadow-gray-200"
                                    disabled={saving}
                                    isLoading={saving}
                                    icon={<Save size={16} />}
                                  >
                                    Save Rule Configuration
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};
