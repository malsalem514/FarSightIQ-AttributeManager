/**
 * ReviewFilterPanel - Professional Scope Selection
 * 
 * Clean, stable filters for enterprise product discovery.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { HierarchyTree } from '../../types';
import { Filter, ChevronRight, Info } from 'lucide-react';
import { Button, SearchableSelect, Select } from '../shared/UI';

export interface ReviewFilters {
  department_id: string | string[];
  class_id: string | string[];
  subclass_id: string | string[];
  brand_id?: string | string[];
  season_id?: string | string[];
  vendor_id?: string | string[];
  banner_id?: string | string[];
  date_range?: string;
  status: 'all' | 'incomplete' | 'with_ai' | 'with_vendor';
  has_images: boolean;
}

interface ReviewFilterPanelProps {
  hierarchy: HierarchyTree | null;
  onFilter: (filters: ReviewFilters) => void;
  isLoading?: boolean;
  initialFilters?: Partial<ReviewFilters> | null;
}

export const ReviewFilterPanel: React.FC<ReviewFilterPanelProps> = ({ 
  hierarchy, 
  onFilter,
  isLoading = false,
  initialFilters
}) => {
  const [filters, setFilters] = useState<ReviewFilters>({
    department_id: initialFilters?.department_id || '',
    class_id: initialFilters?.class_id || '',
    subclass_id: initialFilters?.subclass_id || '',
    season_id: initialFilters?.season_id || '',
    vendor_id: initialFilters?.vendor_id || '',
    banner_id: initialFilters?.banner_id || '',
    date_range: initialFilters?.date_range || 'all',
    status: (initialFilters?.status as ReviewFilters['status']) || 'all',
    has_images: initialFilters?.has_images !== undefined ? initialFilters.has_images : true
  });

  useEffect(() => {
    if (initialFilters) {
      setFilters(prev => ({
        ...prev,
        ...initialFilters,
        department_id: initialFilters.department_id || prev.department_id,
        class_id: initialFilters.class_id || prev.class_id,
        subclass_id: initialFilters.subclass_id || prev.subclass_id,
      }));
    }
  }, [initialFilters]);

  const departments = hierarchy?.departments || [];
  
  const classes = useMemo(() => {
    if (!filters.department_id || (Array.isArray(filters.department_id) && filters.department_id.length === 0)) return [];
    
    const selectedDepts = Array.isArray(filters.department_id) ? filters.department_id : [filters.department_id];
    const result: any[] = [];
    selectedDepts.forEach(id => {
      const dept = departments.find(d => d.id === id);
      if (dept) result.push(...dept.classes);
    });
    return result;
  }, [departments, filters.department_id]);
  
  const subclasses = useMemo(() => {
    const selectedDepts = Array.isArray(filters.department_id) ? filters.department_id : [filters.department_id];
    const selectedClasses = Array.isArray(filters.class_id) ? filters.class_id : [filters.class_id];
    
    if (selectedDepts.length === 0 || selectedDepts[0] === '') return [];

    // If classes are selected, return their subclasses
    if (selectedClasses.length > 0 && selectedClasses[0] !== '') {
      const result: any[] = [];
      const seen = new Set();
      selectedClasses.forEach(id => {
        const cls = classes.find(c => c.id === id);
        if (cls) {
          cls.subclasses.forEach((s: any) => {
            if (!seen.has(s.id)) {
              seen.add(s.id);
              result.push(s);
            }
          });
        }
      });
      return result;
    }

    // If only departments are selected, aggregate ALL subclasses within those departments
    const result: any[] = [];
    const seen = new Set();
    selectedDepts.forEach(deptId => {
      const dept = departments.find(d => d.id === deptId);
      if (dept) {
        dept.classes.forEach(c => {
          c.subclasses.forEach(s => {
            if (!seen.has(s.id)) {
              seen.add(s.id);
              result.push(s);
            }
          });
        });
      }
    });
    return result;
  }, [departments, classes, filters.department_id, filters.class_id]);

  const handleDepartmentChange = (val: string | string[]) => {
    setFilters(prev => ({
      ...prev,
      department_id: val,
      class_id: [],
      subclass_id: []
    }));
  };

  const handleClassChange = (val: string | string[]) => {
    setFilters(prev => ({
      ...prev,
      class_id: val,
      subclass_id: []
    }));
  };

  const labelClass = "block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5";
  const selectClass = "w-full px-3 py-1.5 border border-gray-200 rounded-md text-sm bg-white hover:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none disabled:bg-gray-50 disabled:text-gray-400 shadow-sm";

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="space-y-8">
        {/* Hierarchy Section */}
        <section>
          <div className="flex items-center gap-2 mb-5 px-1">
            <Filter size={14} className="text-indigo-600" />
            <h3 className="text-xs font-black text-gray-900 uppercase tracking-tighter">Scope Explorer</h3>
          </div>

          <div className="space-y-4">
            <SearchableSelect
              label="Department"
              value={filters.department_id || []}
              onChange={handleDepartmentChange}
              options={departments}
              placeholder="Search departments..."
              disabled={isLoading}
              multi={true}
            />

            <SearchableSelect
              label="Class"
              value={filters.class_id || []}
              onChange={handleClassChange}
              options={classes}
              placeholder="Search classes..."
              disabled={!filters.department_id || (Array.isArray(filters.department_id) && filters.department_id.length === 0) || isLoading}
              multi={true}
            />

            <SearchableSelect
              label="Subclass"
              value={filters.subclass_id || []}
              onChange={(val) => setFilters({ ...filters, subclass_id: val })}
              options={subclasses}
              placeholder="Search subclasses..."
              disabled={(!filters.department_id || (Array.isArray(filters.department_id) && filters.department_id.length === 0)) || isLoading}
              multi={true}
            />
          </div>
        </section>

        <div className="h-px bg-gray-100" />

        {/* Filters Section */}
        <section>
          <h3 className={labelClass}>Operational Filters</h3>
          
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-1 gap-4">
              <SearchableSelect
                label="Brand"
                value={filters.brand_id || []}
                onChange={(val) => setFilters({ ...filters, brand_id: val })}
                options={hierarchy?.brands || []}
                placeholder="Search brands..."
                disabled={isLoading}
                multi={true}
              />

              <SearchableSelect
                label="Season"
                value={filters.season_id || []}
                onChange={(val) => setFilters({ ...filters, season_id: val })}
                options={hierarchy?.seasons || []}
                placeholder="Search season code..."
                disabled={isLoading}
                multi={true}
              />
              
              <SearchableSelect
                label="Vendor"
                value={filters.vendor_id || []}
                onChange={(val) => setFilters({ ...filters, vendor_id: val })}
                options={hierarchy?.vendors || []}
                placeholder="Search by ID or name..."
                disabled={isLoading}
                multi={true}
              />
            </div>

            <Select 
              label="Creation Date"
              value={filters.date_range || 'all'}
              onChange={(e) => setFilters({ ...filters, date_range: e.target.value })}
              disabled={isLoading}
              data-testid="date-range-select"
              options={[
                { value: 'all', label: 'All Time' },
                { value: '7d', label: 'Last 7 Days' },
                { value: '30d', label: 'Last 30 Days' },
                { value: '90d', label: 'Last 90 Days' }
              ]}
            />

            {hierarchy?.banners && hierarchy.banners.length > 0 && (
              <SearchableSelect
                label="Banner / Platform"
                value={filters.banner_id || []}
                onChange={(val) => setFilters({ ...filters, banner_id: val })}
                options={hierarchy.banners}
                placeholder="Search banners..."
                disabled={isLoading}
                multi={true}
              />
            )}

            <Select 
              label="Data Quality"
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value as any }))}
              disabled={isLoading}
              data-testid="quality-select"
              options={[
                { value: 'all', label: 'All Styles' },
                { value: 'incomplete', label: 'Incomplete Only' },
                { value: 'with_ai', label: 'AI Suggested' },
                { value: 'with_vendor', label: 'Vendor Provided' }
              ]}
            />

            <div className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50/50">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Images Required</span>
                <span className="text-[9px] text-gray-400 font-medium italic">Exclude styles missing media</span>
              </div>
              <input 
                type="checkbox"
                checked={filters.has_images}
                onChange={(e) => setFilters({ ...filters, has_images: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                disabled={isLoading}
                data-testid="has-images-checkbox"
              />
            </div>
          </div>
        </section>
      </div>

      <div className="mt-auto pt-8 border-t border-gray-100">
        <Button
          onClick={() => onFilter(filters)}
          variant="primary"
          className="w-full shadow-lg shadow-indigo-100/50 py-3"
          disabled={isLoading}
          isLoading={isLoading}
          data-testid="update-view-btn"
        >
          Update View
        </Button>
      </div>
    </div>
  );
};
