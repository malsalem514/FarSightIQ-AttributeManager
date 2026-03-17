import React, { useState, useEffect } from 'react';
import { Card, Button, Input, Select } from '../components/shared/UI';
import { Search, Map, CheckCircle2, AlertCircle, Loader2, Tag, ShieldCheck, Zap, ArrowRight } from 'lucide-react';
import { fetchHierarchy, searchTaxonomyCategories, upsertTenantMapping, seedTemplatesFromMapping } from '../src/api/client';

interface TaxonomyMappingPageProps {
  businessUnitId: number | null;
}

export const TaxonomyMappingPage: React.FC<TaxonomyMappingPageProps> = ({ businessUnitId }) => {
  const [hierarchy, setHierarchy] = useState<any>(null);
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSubclass, setSelectedSubclass] = useState<string>('');
  const [taxonomyQuery, setTaxonomyQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedTaxonomyCategory, setSelectedTaxonomyCategory] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!businessUnitId) return;
    const loadHierarchy = async () => {
      setIsLoading(true);
      try {
        const res = await fetchHierarchy(businessUnitId);
        if (res.success) {
          setHierarchy(res.data);
        } else {
          setStatusMessage({ type: 'error', message: res.error?.message || 'Failed to load hierarchy.' });
        }
      } catch (err: any) {
        setStatusMessage({ type: 'error', message: `API error: ${err.message}` });
      } finally {
        setIsLoading(false);
      }
    };
    loadHierarchy();
  }, [businessUnitId]);

  const handleSearchTaxonomy = async () => {
    if (!taxonomyQuery) return;
    setIsLoading(true);
    try {
      const res = await searchTaxonomyCategories(taxonomyQuery);
      if (res.success) {
        setSearchResults(res.data || []);
      } else {
        setStatusMessage({ type: 'error', message: res.error?.message || 'Failed to search taxonomy.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', message: `API error: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveMapping = async () => {
    if (!selectedTaxonomyCategory || !selectedDept || !selectedClass || !businessUnitId) {
      setStatusMessage({ type: 'error', message: 'Please select ERP hierarchy and a taxonomy category.' });
      return;
    }
    setIsLoading(true);
    try {
      const res = await upsertTenantMapping(
        businessUnitId,
        selectedDept,
        selectedClass,
        selectedSubclass || null,
        'v1',
        selectedTaxonomyCategory.id
      );
      if (res.success) {
        setStatusMessage({ type: 'success', message: 'Hierarchy mapped successfully!' });
      } else {
        setStatusMessage({ type: 'error', message: res.error?.message || 'Failed to save mapping.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', message: `API error: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeedTemplates = async (seedMode: 'advisory' | 'enforced') => {
    if (!selectedTaxonomyCategory || !selectedDept || !selectedClass || !businessUnitId) {
      setStatusMessage({ type: 'error', message: 'Please select ERP hierarchy and a taxonomy category.' });
      return;
    }
    setIsLoading(true);
    try {
      const res = await seedTemplatesFromMapping(
        businessUnitId,
        selectedDept,
        selectedClass,
        selectedSubclass || null,
        seedMode
      );
      if (res.success) {
        setStatusMessage({ type: 'success', message: `Templates seeded in ${seedMode} mode.` });
      } else {
        setStatusMessage({ type: 'error', message: res.error?.message || 'Failed to seed templates.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', message: `API error: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const currentDept = hierarchy?.departments?.find((d: any) => d.id === selectedDept);
  const currentClass = currentDept?.classes?.find((c: any) => c.id === selectedClass);

  return (
    <div className="h-full flex flex-col bg-gray-50/50 p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto w-full">
        <header className="mb-8">
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Attribute Knowledge Layer</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Map ERP Hierarchy to Shopify Product Taxonomy Standards</p>
        </header>

        {statusMessage && (
          <div className={`mb-6 p-4 rounded-lg border flex items-start gap-3 transition-all ${statusMessage.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-rose-50 border-rose-100 text-rose-800'}`}>
            {statusMessage.type === 'success' ? <CheckCircle2 size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}
            <p className="text-xs font-bold leading-relaxed">{statusMessage.message}</p>
            <button onClick={() => setStatusMessage(null)} className="ml-auto text-[10px] uppercase font-black opacity-40 hover:opacity-100">Dismiss</button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-6">
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-6 text-gray-900 font-bold">
                <Map size={18} className="text-indigo-600" />
                <span>ERP Hierarchy Selection</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Select
                  label="Department"
                  value={selectedDept}
                  onChange={(e) => { setSelectedDept(e.target.value); setSelectedClass(''); setSelectedSubclass(''); }}
                  options={hierarchy?.departments?.map((d: any) => ({ value: d.id, label: d.name })) || []}
                  placeholder="Select Dept"
                  disabled={isLoading}
                />
                <Select
                  label="Class"
                  value={selectedClass}
                  onChange={(e) => { setSelectedClass(e.target.value); setSelectedSubclass(''); }}
                  options={currentDept?.classes?.map((c: any) => ({ value: c.id, label: c.name })) || []}
                  placeholder="Select Class"
                  disabled={isLoading || !selectedDept}
                />
                <Select
                  label="Subclass"
                  value={selectedSubclass}
                  onChange={(e) => setSelectedSubclass(e.target.value)}
                  options={currentClass?.subclasses?.map((s: any) => ({ value: s.id, label: s.name })) || []}
                  placeholder="Optional"
                  disabled={isLoading || !selectedClass}
                />
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2 mb-6 text-gray-900 font-bold">
                <Tag size={18} className="text-indigo-600" />
                <span>Shopify Taxonomy Search</span>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Search standard categories (e.g. Dresses, Outerwear)..."
                  value={taxonomyQuery}
                  onChange={(e) => setTaxonomyQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearchTaxonomy()}
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button onClick={handleSearchTaxonomy} disabled={isLoading || !taxonomyQuery}>
                  {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="mt-4 border border-gray-100 rounded-lg max-h-60 overflow-y-auto divide-y divide-gray-50 bg-gray-50/30">
                  {searchResults.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedTaxonomyCategory(cat)}
                      className={`w-full text-left p-3 flex items-center justify-between group transition-all ${selectedTaxonomyCategory?.id === cat.id ? 'bg-indigo-600 text-white' : 'hover:bg-indigo-50 text-gray-700'}`}
                    >
                      <div className="flex flex-col">
                        <span className={`text-xs font-bold ${selectedTaxonomyCategory?.id === cat.id ? 'text-white' : 'text-gray-900'}`}>{cat.name}</span>
                        <span className={`text-[10px] uppercase tracking-tighter ${selectedTaxonomyCategory?.id === cat.id ? 'text-indigo-200' : 'text-gray-400'}`}>{cat.path}</span>
                      </div>
                      <ArrowRight size={14} className={selectedTaxonomyCategory?.id === cat.id ? 'text-white' : 'text-gray-300 group-hover:text-indigo-600'} />
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <div className="flex gap-4">
              <Button 
                onClick={handleSaveMapping} 
                className="flex-1 h-12"
                disabled={isLoading || !selectedTaxonomyCategory || !selectedDept || !selectedClass}
                isLoading={isLoading}
              >
                <Map size={16} className="mr-2" /> Save Mapping
              </Button>
              <Button 
                onClick={() => handleSeedTemplates('advisory')} 
                variant="secondary"
                className="flex-1 h-12"
                disabled={isLoading || !selectedTaxonomyCategory || !selectedDept || !selectedClass}
              >
                <Zap size={16} className="mr-2" /> Seed Advisory
              </Button>
              <Button 
                onClick={() => handleSeedTemplates('enforced')} 
                variant="secondary"
                className="flex-1 h-12 bg-gray-900 text-white hover:bg-black"
                disabled={isLoading || !selectedTaxonomyCategory || !selectedDept || !selectedClass}
              >
                <ShieldCheck size={16} className="mr-2" /> Seed Enforced
              </Button>
            </div>
          </div>

          <div className="space-y-6">
            <Card className="p-6 bg-indigo-600 text-white">
              <Zap size={24} className="mb-4 text-indigo-200" />
              <h3 className="font-bold text-sm mb-2 text-indigo-50">Bulk Seeding</h3>
              <p className="text-[11px] text-indigo-100 leading-relaxed">
                Automatically seed all characteristic templates for the selected hierarchy based on the mapped Shopify standard.
              </p>
            </Card>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-500" />
                Compliance Rules
              </h3>
              <ul className="space-y-3">
                {[
                  'Mapped attributes become mandatory during sync',
                  'Fuzzy matching boosts results for mapped classes',
                  'Seeded templates bypass manual configuration',
                  'Supports versioned taxonomy imports'
                ].map((rule, i) => (
                  <li key={i} className="flex gap-3 text-[10px] font-bold text-gray-500 uppercase tracking-tight">
                    <div className="w-1 h-1 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
