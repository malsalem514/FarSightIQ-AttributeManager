import React, { useState, useEffect } from 'react';
import { Card, Button, Input, StatusBadge } from '../components/shared/UI';
import { 
  Search, BookOpen, ChevronRight, Tag, Info, 
  Layers, Database, ArrowLeft, Loader2, Sparkles,
  BarChart3, ShieldCheck, Map
} from 'lucide-react';
import { API_BASE_URL } from '../src/api/config';

interface Category {
  id: string;
  name: string;
  path: string;
  child_count: number;
}

interface Attribute {
  code: string;
  name: string;
  type: string;
  description: string;
  mandatory: boolean;
}

interface TaxonomyStats {
  categories: number;
  attributes: number;
  associations: number;
}

export const TaxonomyDiscoveryPage: React.FC = () => {
  const [stats, setStats] = useState<TaxonomyStats | null>(null);
  const [roots, setRoots] = useState<Category[]>([]);
  const [currentPath, setCurrentPath] = useState<Category[]>([]);
  const [currentChildren, setCurrentChildren] = useState<Category[]>([]);
  const [selectedAttributes, setSelectedAttributes] = useState<Attribute[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Category[]>([]);
  const [activeTab, setActiveTab] = useState<'browse' | 'search'>('browse');

  const activeCategory = currentPath[currentPath.length - 1] || null;

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      const headers = { 'X-TENANT-ID': 'OCI' };
      const [statsRes, rootsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/taxonomy/stats`, { headers }).then(r => r.json()),
        fetch(`${API_BASE_URL}/taxonomy/roots`, { headers }).then(r => r.json())
      ]);
      if (statsRes.success) setStats(statsRes.data);
      if (rootsRes.success) {
        setRoots(rootsRes.data);
        setCurrentChildren(rootsRes.data);
      }
    } catch (err) {
      console.error('Failed to load taxonomy data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrillDown = async (category: Category) => {
    setIsLoading(true);
    try {
      const headers = { 'X-TENANT-ID': 'OCI' };
      const [childrenRes, attrsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/taxonomy/children/${category.id}`, { headers }).then(r => r.json()),
        fetch(`${API_BASE_URL}/taxonomy/attributes/${category.id}`, { headers }).then(r => r.json())
      ]);
      
      if (childrenRes.success) {
        setCurrentChildren(childrenRes.data);
        setCurrentPath([...currentPath, category]);
      }
      if (attrsRes.success) {
        setSelectedAttributes(attrsRes.data);
      }
      setActiveTab('browse');
    } catch (err) {
      console.error('Failed to drill down:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoBack = () => {
    if (currentPath.length === 0) return;
    const newPath = [...currentPath];
    newPath.pop();
    setCurrentPath(newPath);
    
    const parent = newPath[newPath.length - 1];
    if (parent) {
      fetchChildrenOnly(parent.id);
    } else {
      setCurrentChildren(roots);
      setSelectedAttributes([]);
    }
  };

  const fetchChildrenOnly = async (parentId: string) => {
    setIsLoading(true);
    try {
      const headers = { 'X-TENANT-ID': 'OCI' };
      const [childrenRes, attrsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/taxonomy/children/${parentId}`, { headers }).then(r => r.json()),
        fetch(`${API_BASE_URL}/taxonomy/attributes/${parentId}`, { headers }).then(r => r.json())
      ]);
      if (childrenRes.success) setCurrentChildren(childrenRes.data);
      if (attrsRes.success) setSelectedAttributes(attrsRes.data);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery) return;
    setIsLoading(true);
    setActiveTab('search');
    try {
      const headers = { 'X-TENANT-ID': 'OCI' };
      const res = await fetch(`${API_BASE_URL}/taxonomy/categories/search?q=${encodeURIComponent(searchQuery)}`, { headers }).then(r => r.json());
      if (res.success) setSearchResults(res.data);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50/30 overflow-hidden select-none">
      {/* 1. Header with Stats */}
      <header className="bg-white border-b border-gray-200 px-8 py-6 flex-shrink-0">
        <div className="flex items-center justify-between max-w-7xl mx-auto w-full">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpen size={20} className="text-indigo-600" />
              <h1 className="text-xl font-black text-gray-900 tracking-tight uppercase">Taxonomy Discovery Center</h1>
            </div>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest opacity-60">Global Product Classification Standard (Shopify OSS)</p>
          </div>

          <div className="flex items-center gap-8">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Total Categories</span>
              <span className="text-lg font-black text-gray-900 tabular-nums" data-testid="taxonomy-cat-count">{stats?.categories?.toLocaleString() || '...'}</span>
            </div>
            <div className="h-8 w-px bg-gray-100" />
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Standards Attributes</span>
              <span className="text-lg font-black text-indigo-600 tabular-nums" data-testid="taxonomy-attr-count">{stats?.attributes?.toLocaleString() || '...'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Search Bar */}
      <div className="bg-white border-b border-gray-100 px-8 py-4 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text"
              placeholder="Search across 11,700+ categories (e.g. 'Outerwear', 'Electronics', 'Pet')..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <Button onClick={handleSearch} variant="primary" className="px-8 shadow-md">Search Standards</Button>
        </div>
      </div>

      {/* 3. Main Explorer Area */}
      <div className="flex-1 overflow-hidden p-8">
        <div className="max-w-7xl mx-auto h-full flex gap-8">
          
          {/* A. Navigation Column */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                {currentPath.length > 0 && (
                  <button onClick={handleGoBack} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
                    <ArrowLeft size={18} />
                  </button>
                )}
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <span className={`text-xs font-black uppercase tracking-widest ${currentPath.length === 0 ? 'text-indigo-600' : 'text-gray-400'}`}>Verticals</span>
                  {currentPath.map((p, i) => (
                    <React.Fragment key={p.id}>
                      <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />
                      <span className={`text-xs font-black uppercase tracking-widest truncate ${i === currentPath.length - 1 ? 'text-indigo-600' : 'text-gray-400'}`}>{p.name}</span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
              {isLoading && <Loader2 size={16} className="animate-spin text-indigo-600" />}
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-y-auto custom-scrollbar flex-1">
              {activeTab === 'search' ? (
                <div className="divide-y divide-gray-50">
                  {searchResults.length === 0 ? (
                    <div className="p-20 text-center">
                      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                        <Search size={32} />
                      </div>
                      <p className="text-sm font-bold text-gray-900 uppercase">No Standards Found</p>
                      <p className="text-xs text-gray-400 mt-1">Try another keyword or browse by vertical.</p>
                    </div>
                  ) : (
                    searchResults.map(cat => (
                      <button 
                        key={cat.id} 
                        onClick={() => handleDrillDown(cat)}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-indigo-50/30 group transition-all text-left"
                      >
                        <div>
                          <div className="text-sm font-black text-gray-900 group-hover:text-indigo-600 transition-colors">{cat.name}</div>
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter mt-0.5">{cat.path}</div>
                        </div>
                        <ChevronRight size={16} className="text-gray-300 group-hover:text-indigo-400 transition-all" />
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {currentChildren.map(cat => (
                    <button 
                      key={cat.id} 
                      onClick={() => handleDrillDown(cat)}
                      data-testid={`taxonomy-row-${cat.id}`}
                      className="w-full px-6 py-4 flex items-center justify-between hover:bg-indigo-50/30 group transition-all text-left"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">
                          <Layers size={16} />
                        </div>
                        <div>
                          <div className="text-sm font-black text-gray-900 group-hover:text-indigo-600 transition-colors">{cat.name}</div>
                          {cat.child_count > 0 && <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">{cat.child_count} Subcategories</span>}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-gray-300 group-hover:text-indigo-400 transition-all translate-x-0 group-hover:translate-x-1" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* B. Attribute Inspector Column */}
          <aside className="w-[450px] flex flex-col gap-4">
            <div className="flex items-center gap-2 px-1">
              <Tag size={14} className="text-amber-500" />
              <h2 className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Standards Inspector</h2>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col h-full overflow-hidden">
              {!activeCategory ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-gray-50/20">
                  <div className="w-20 h-20 bg-white border border-gray-100 rounded-3xl flex items-center justify-center mb-6 shadow-inner">
                    <Sparkles size={32} className="text-indigo-200" />
                  </div>
                  <h3 className="text-base font-black text-gray-900 uppercase tracking-tighter mb-2">Discovery Mode</h3>
                  <p className="text-xs text-gray-500 leading-relaxed font-medium">
                    Select a category from the browser to inspect its global standard attributes and required fields.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col h-full">
                  <div className="p-6 border-b border-gray-100 bg-indigo-600 text-white">
                    <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Inspecting ID: {activeCategory.id}</div>
                    <h3 className="text-lg font-black tracking-tight">{activeCategory.name}</h3>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                    {selectedAttributes.length === 0 ? (
                      <div className="py-12 text-center opacity-40">
                        <Info size={32} className="mx-auto mb-2" />
                        <p className="text-xs font-bold uppercase">No Standard Attributes</p>
                      </div>
                    ) : (
                      selectedAttributes.map(attr => (
                        <div key={attr.code} className="p-4 bg-gray-50/50 border border-gray-100 rounded-xl space-y-2 group hover:border-indigo-200 transition-all">
                          <div className="flex items-start justify-between">
                            <div className="flex flex-col">
                              <span className="text-xs font-black text-gray-900 group-hover:text-indigo-600 transition-colors">{attr.name}</span>
                              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter tabular-nums">{attr.code}</span>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {attr.mandatory && <div className="px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded text-[8px] font-black uppercase border border-rose-100">Required</div>}
                              <div className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[8px] font-black uppercase border border-indigo-100">{attr.type}</div>
                            </div>
                          </div>
                          <p className="text-[10px] text-gray-500 font-medium leading-relaxed">{attr.description}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="p-6 bg-gray-50 border-t border-gray-100">
                    <Button variant="primary" className="w-full h-12 shadow-lg" icon={<Map size={16} />}>
                      Create Hierarchy Mapping
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
