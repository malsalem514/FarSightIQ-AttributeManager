/**
 * CreateDraftModal - Onboard new style from photo
 */

import React, { useState, useRef } from 'react';
import { X, Upload, Sparkles, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button, Input } from './UI';
import { API_BASE_URL } from '../../src/api/config';

interface CreateDraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessUnitId: number;
  onCreated: (sessionId: number) => void;
}

export const CreateDraftModal: React.FC<CreateDraftModalProps> = ({ 
  isOpen, onClose, businessUnitId, onCreated 
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(selected);
    }
  };

  const handleUpload = async () => {
    if (!file || !preview) return;

    setIsUploading(true);
    setError(null);

    try {
      // 1. Convert base64 (strip prefix)
      const base64 = preview.split(',')[1];
      
      // 2. Call Onboarding API
      const response = await fetch(`${API_BASE_URL}/products/onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_unit_id: businessUnitId,
          image_name: file.name,
          image_base64: base64
        })
      });

      const result = await response.json();
      if (result.success) {
        onCreated(result.data.sessionId);
        onClose();
      } else {
        setError(result.error?.message || 'Failed to onboard style');
      }
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <header className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black text-gray-900 uppercase tracking-tight">AI Onboarding</h2>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Create New Style from Photo</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </header>

        {/* Content */}
        <div className="p-8 flex flex-col items-center">
          {!preview ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-[4/3] border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-4 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all cursor-pointer group"
            >
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 group-hover:text-indigo-400 group-hover:scale-110 transition-all">
                <Upload size={32} />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-gray-700">Drop style photo here</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">or click to browse files</p>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleFileChange} 
              />
            </div>
          ) : (
            <div className="w-full flex flex-col gap-6">
              <div className="relative aspect-square w-48 mx-auto rounded-2xl overflow-hidden shadow-lg ring-4 ring-white ring-offset-2 ring-indigo-500/20">
                <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                <button 
                  onClick={() => { setFile(null); setPreview(null); }}
                  className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black text-white rounded-full backdrop-blur-md transition-all"
                >
                  <X size={14} />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-start gap-3">
                  <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-indigo-900 uppercase">AI Discovery Mode</p>
                    <p className="text-[11px] text-indigo-700 leading-relaxed mt-0.5">
                      Our vision model will analyze the photo to predict Hierarchy, Colors, and Size Scale automatically.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-6 w-full p-3 bg-rose-50 border border-rose-100 rounded-lg flex items-center gap-2 text-rose-700 text-xs font-bold">
              <AlertCircle size={14} />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isUploading}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            size="sm" 
            onClick={handleUpload} 
            disabled={!file || isUploading}
            isLoading={isUploading}
            icon={<Sparkles size={14} />}
          >
            Start Discovery
          </Button>
        </footer>
      </div>
    </div>
  );
};

