import React, { useState, useEffect, useCallback } from 'react';
import { TabType, HierarchyTree } from './types';
import { DashboardPage } from './pages/DashboardPage';
import { ReviewGridPage } from './pages/ReviewGridPage';
import { AttributeConfigPage } from './pages/AttributeConfigPage';
import { TaxonomyMappingPage } from './pages/TaxonomyMappingPage';
import { TaxonomyDiscoveryPage } from './pages/TaxonomyDiscoveryPage';
import { AdminMonitoringPage } from './pages/AdminMonitoringPage';
import { AdminPage } from './pages/AdminPage';
import { SettingsPage } from './pages/SettingsPage';
import { ChevronDown, BarChart3, ClipboardCheck, BookOpen, AlertCircle, Activity, Settings, RefreshCw, Plus, Shield, Sparkles } from 'lucide-react';
import { API_BASE_URL, BUSINESS_UNIT_ID, USE_MOCK_DATA } from './src/api/config';
import { fetchBusinessUnits } from './src/api/client';
import { SyncProgressBanner } from './components/shared/SyncProgressBanner';
import { CreateDraftModal } from './components/shared/CreateDraftModal';
import { PasswordModal } from './components/shared/PasswordModal';
import { Button } from './components/shared/UI';

// Keyboard shortcuts hook
const useKeyboardShortcuts = (shortcuts: Record<string, () => void>) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      const key = [e.ctrlKey || e.metaKey ? 'Ctrl+' : '', e.key.toUpperCase()].join('');
      if (shortcuts[key]) { e.preventDefault(); shortcuts[key](); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [selectedBU, setSelectedBU] = useState<number | null>(null);
  const [initialFilters, setInitialFilters] = useState<any>(null);
  const [hierarchy, setHierarchy] = useState<HierarchyTree | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buDropdownOpen, setBuDropdownOpen] = useState(false);
  const [activeTenant, setActiveTenant] = useState<{ id: string; name: string } | null>(null);
  const [availableBUs, setAvailableBUs] = useState<Array<{ id: number; name: string; productCount?: number }>>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  useKeyboardShortcuts({
    'Ctrl+1': () => setActiveTab('dashboard'),
    'Ctrl+2': () => setActiveTab('review_grid'),
    'Ctrl+3': () => setActiveTab('config'),
    'Ctrl+4': () => setActiveTab('admin'),
    'Ctrl+N': () => setIsCreateModalOpen(true),
    'ESCAPE': () => { setError(null); setBuDropdownOpen(false); setIsCreateModalOpen(false); },
  });

  const loadBusinessUnits = useCallback(async (force = false) => {
    try {
      if (force) {
        setAvailableBUs([]);
        setIsLoading(true);
      }
      
      const [buResponse, envResponse] = await Promise.all([
        fetchBusinessUnits(),
        fetch(`${API_BASE_URL}/settings/environments`).then(res => res.json())
      ]);

      if (envResponse.success && envResponse.data) {
        const active = envResponse.data.find((e: any) => e.isActive);
        if (active) setActiveTenant({ id: active.id, name: active.name });
      }

      if (buResponse.success && buResponse.data && buResponse.data.length > 0) {
        setAvailableBUs(buResponse.data);
        
        // If current BU not in new list, pick first available
        const buExists = buResponse.data.some((b: any) => b.id === selectedBU);
        if (!buExists || selectedBU === null) {
          setSelectedBU(buResponse.data[0].id);
        }
      } else if (buResponse.error?.code === 'DB_LINK_ERROR') {
        setError(buResponse.error.message);
        // Fallback to default BU to allow app to load
        setAvailableBUs([{ id: BUSINESS_UNIT_ID, name: `BU ${BUSINESS_UNIT_ID}` }]);
        setSelectedBU(BUSINESS_UNIT_ID);
      }
    } catch (err) {
      console.error('Failed to load business units:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedBU]);

  const fetchHierarchyData = useCallback(async () => {
    if (selectedBU === null || USE_MOCK_DATA) return;
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/products/hierarchy?business_unit_id=${selectedBU}`);
      const result = await response.json();
      if (result.success) setHierarchy(result.data);
    } catch (err: any) {
      setError(`API connection error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [selectedBU]);

  useEffect(() => {
    // Refresh BUs when switching back from settings or when app loads
    if (activeTab === 'dashboard' || activeTab === 'review_grid') {
      loadBusinessUnits();
    }
  }, [activeTab, loadBusinessUnits]);

  useEffect(() => {
    // Listen for environment switch events to refresh BUs immediately
    const handleEnvSwitch = () => loadBusinessUnits(true);
    window.addEventListener('musa:env-switched', handleEnvSwitch);
    return () => window.removeEventListener('musa:env-switched', handleEnvSwitch);
  }, [loadBusinessUnits]);

  useEffect(() => { fetchHierarchyData(); }, [fetchHierarchyData]);

  const currentBU = availableBUs.find(b => b.id === selectedBU);

  return (
    <div className="h-screen flex flex-col bg-white text-gray-900 select-none">
      {/* Universal Enterprise Header - styleIQ Branding */}
      <header className="h-16 border-b border-gray-100 px-6 flex items-center justify-between sticky top-0 z-50 bg-white shadow-sm">
        <div className="flex items-center gap-6">
          {/* FarsightIQ Logo + Breadcrumbs */}
          <div className="flex items-center gap-4">
            {/* Logo */}
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
              <div className="flex items-baseline font-bold text-xl tracking-tighter">
                <span className="text-gray-900">Farsight</span>
                <span className="text-purple-600">IQ</span>
              </div>
            </div>

            {/* Breadcrumb Navigation */}
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <button onClick={() => setActiveTab('dashboard')} className="hover:text-purple-600 transition-colors font-medium">
                Home
              </button>
              <span>/</span>
              <span className="text-gray-600 font-medium">
                {activeTab === 'dashboard' ? 'Dashboard' : 
                 activeTab === 'review_grid' ? 'AttributeMe' : 
                 activeTab === 'settings' ? 'Settings' : 'Page'}
              </span>
            </div>
          </div>
        </div>

        {/* Centered Logo - StyleIQ with AI Sparkle */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
          <div className="flex items-center gap-2">
            <Sparkles className="w-8 h-8 text-yellow-400" />
            <div className="flex flex-col items-center">
              <div className="flex items-baseline font-bold text-2xl tracking-tighter">
                <span className="text-gray-900">Style</span>
                <span className="text-purple-600">IQ</span>
              </div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">AI-Powered Attribution</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* BU Selector - Moved to far right */}
          <div className="relative">
            <button 
              onClick={() => setBuDropdownOpen(!buDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 rounded border border-gray-100 transition-colors"
              data-testid="bu-selector-btn"
            >
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-black text-purple-600 uppercase tracking-tight leading-none mb-0.5" data-testid="active-tenant-id">
                  {activeTenant?.id || '...'}
                </span>
                <span className="text-xs font-bold text-gray-700" data-testid="active-bu-id">
                  BU {selectedBU || '...'}{currentBU?.name ? ` - ${currentBU.name}` : ''}
                </span>
              </div>
              <span className="text-[10px] text-gray-400 font-medium" data-testid="bu-product-count">({currentBU?.productCount?.toLocaleString() || '...'} styles)</span>
              <ChevronDown size={12} className="text-gray-400" />
            </button>
            
            {buDropdownOpen && (
              <div className="absolute top-full right-0 mt-1 bg-white rounded border border-gray-200 py-1 min-w-[240px] z-50 shadow-xl animate-in slide-in-from-top-1 flex flex-col max-h-[400px]" data-testid="bu-dropdown-menu">
                <div className="px-4 py-2 border-b border-gray-50 flex items-center justify-between flex-shrink-0">
                  <span className="text-[9px] font-black text-gray-400 uppercase">Available Units</span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); loadBusinessUnits(); }}
                    className="p-1 hover:bg-gray-100 rounded text-indigo-600 transition-colors"
                    title="Refresh List"
                    data-testid="refresh-bu-list"
                  >
                    <RefreshCw size={10} />
                  </button>
                </div>
                <div className="overflow-y-auto custom-scrollbar flex-1">
                  {availableBUs.map(bu => (
                    <button
                      key={bu.id}
                      onClick={() => { setSelectedBU(bu.id); setHierarchy(null); setBuDropdownOpen(false); }}
                      className={`w-full px-4 py-2 text-left text-xs font-semibold transition-colors ${selectedBU === bu.id ? 'bg-purple-50 text-purple-600' : 'text-gray-600 hover:bg-gray-50'}`}
                      data-testid={`bu-option-${bu.id}`}
                    >
                      BU {bu.id}{bu.name ? ` - ${bu.name}` : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Settings Gear - Password Protected */}
          <button
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-all"
            title="Settings (Admin Only)"
            onClick={() => setShowPasswordModal(true)}
          >
            <Settings size={16} />
          </button>

          {/* User Badge - Navigate to AttributeMe (products view) */}
          <div 
            className="w-8 h-8 rounded-full border border-purple-200 flex items-center justify-center font-bold text-[10px] bg-purple-50 text-purple-600 cursor-pointer hover:bg-purple-100 hover:shadow-lg transition-all" 
            data-testid="user-avatar"
            title="AttributeMe - Review Products"
            onClick={() => setActiveTab('review_grid')}
          >
            SG
          </div>
        </div>
      </header>

      {error && (
        <div className="bg-rose-50 border-b border-rose-100 px-6 py-2 flex items-center gap-2 text-rose-700 text-xs font-bold animate-in slide-in-from-top">
          <AlertCircle size={14} />
          <span>{error}</span>
          {error.includes('Admin Settings') && (
            <button 
              onClick={() => { setActiveTab('admin'); setError(null); }}
              className="ml-2 px-2 py-0.5 bg-rose-100 hover:bg-rose-200 rounded text-[10px] uppercase tracking-wider"
            >
              Go to Settings
            </button>
          )}
          <button onClick={() => setError(null)} className="ml-auto opacity-50 hover:opacity-100">×</button>
        </div>
      )}

      <main className="flex-1 overflow-hidden relative" data-testid="main-content">
        {(isLoading && availableBUs.length === 0) || selectedBU === null ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 bg-purple-50/30">
            <div className="w-10 h-10 border-3 border-purple-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Initializing styleIQ Workbench...</p>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardPage
                hierarchy={hierarchy}
                businessUnitId={selectedBU}
                onNavigate={(filters) => {
                  setInitialFilters({ 
                    department_id: filters.deptId, 
                    class_id: filters.classId,
                    step: filters.step
                  });
                  setActiveTab('review_grid');
                }}
                onSwitchTab={(tab) => setActiveTab(tab as TabType)}
              />
            )}
            {activeTab === 'review_grid' && (
              <ReviewGridPage 
                businessUnitId={selectedBU} 
                initialFilters={initialFilters} 
                hierarchy={hierarchy}
                onHome={() => setActiveTab('dashboard')}
              />
            )}
            {activeTab === 'admin' && (
              <AdminPage 
                businessUnitId={selectedBU} 
                hierarchy={hierarchy}
                onHome={() => setActiveTab('dashboard')}
              />
            )}
            {activeTab === 'settings' && (
              <SettingsPage 
                onHome={() => setActiveTab('dashboard')}
              />
            )}
          </>
        )}
      </main>

      {/* Branded Footer */}
      <footer className="h-10 bg-white border-t border-gray-100 px-6 flex items-center justify-between text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">
        <span>© 2025 FarsightIQ AI Products</span>
        <div className="flex items-center gap-6">
          <span className="text-purple-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Vision ERP: Connected
          </span>
          <span className="hover:text-gray-500 cursor-pointer">Terms of Use</span>
          <span className="hover:text-gray-500 cursor-pointer">Privacy Policy</span>
        </div>
      </footer>
      
      {/* Real-time Sync Progress Overlay */}
      <SyncProgressBanner />

      {/* Create Draft Modal */}
      <CreateDraftModal 
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        businessUnitId={selectedBU || BUSINESS_UNIT_ID}
        onCreated={(sessionId) => {
          setInitialFilters({ step: 'drafts' });
          setActiveTab('review_grid');
        }}
      />

      {/* Password Modal for Settings */}
      <PasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        onSuccess={() => setActiveTab('admin')}
        title="Admin Access Required"
        description="Enter the admin password to access Settings."
        correctPassword="nrf2026"
      />
    </div>
  );
};

export default App;
