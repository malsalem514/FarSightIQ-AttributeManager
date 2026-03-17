/**
 * BulkUploadModal - Upload multiple product images for AI onboarding
 * 
 * Features:
 * - Drag & drop multiple images
 * - ZIP file upload
 * - Progress tracking
 * - Per-image status
 */

import React, { useState, useRef, useCallback } from 'react';
import { 
  X, Upload, FolderArchive, Image, Sparkles, Loader2, 
  CheckCircle2, AlertCircle, FileImage, Trash2, Play,
  ChevronRight, Clock
} from 'lucide-react';
import { Button } from '../shared/UI';
import { API_BASE_URL } from '../../src/api/config';
import { BatchProgressTracker } from './BatchProgressTracker';

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessUnitId: number;
  onBatchStarted: (batchId: string) => void;
}

interface QueuedImage {
  id: string;
  file: File;
  preview: string;
  status: 'queued' | 'processing' | 'success' | 'error';
  error?: string;
}

export const BulkUploadModal: React.FC<BulkUploadModalProps> = ({ 
  isOpen, onClose, businessUnitId, onBatchStarted 
}) => {
  const [queuedImages, setQueuedImages] = useState<QueuedImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  
  // Separate refs for different upload modes (HTML5 native approach)
  const fileInputRef = useRef<HTMLInputElement>(null);    // Individual files
  const folderInputRef = useRef<HTMLInputElement>(null);  // Folder (webkitdirectory)

  // All hooks must be before conditional returns
  const handleFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newImages: QueuedImage[] = [];

    // Supported image extensions (for folder uploads where type might be empty)
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    
    for (const file of fileArray) {
      const fileName = file.name.toLowerCase();
      const isImage = file.type.startsWith('image/') || 
        imageExtensions.some(ext => fileName.endsWith(ext));
      const isZip = file.type === 'application/zip' || 
        file.type === 'application/x-zip-compressed' || 
        fileName.endsWith('.zip');
      
      // Skip non-image/non-zip files (e.g., .DS_Store, thumbs.db, etc.)
      if (!isImage && !isZip) continue;
      
      // Skip hidden files
      if (fileName.startsWith('.')) continue;

      if (isImage) {
        const preview = URL.createObjectURL(file);
        newImages.push({
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          file,
          preview,
          status: 'queued'
        });
      } else if (isZip) {
        // ZIP file - we'll extract on server
        newImages.push({
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          file,
          preview: '', // No preview for ZIP
          status: 'queued'
        });
      }
    }

    if (newImages.length === 0 && fileArray.length > 0) {
      setError('No valid images found. Please select JPG, PNG, or WEBP files.');
      return;
    }

    setQueuedImages(prev => [...prev, ...newImages]);
    setError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // Early return AFTER all hooks
  if (!isOpen) return null;

  const removeImage = (id: string) => {
    setQueuedImages(prev => prev.filter(img => img.id !== id));
  };

  const clearAll = () => {
    queuedImages.forEach(img => {
      if (img.preview) URL.revokeObjectURL(img.preview);
    });
    setQueuedImages([]);
  };

  const startUpload = async () => {
    if (queuedImages.length === 0) return;

    setIsUploading(true);
    setError(null);
    setUploadProgress({ current: 0, total: queuedImages.length });

    try {
      // Create FormData with all files
      const formData = new FormData();
      formData.append('business_unit_id', businessUnitId.toString());
      
      for (const img of queuedImages) {
        formData.append('images', img.file);
      }

      // Upload to bulk endpoint
      const response = await fetch(`${API_BASE_URL}/products/onboard/bulk`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        // Show progress tracker
        setActiveBatchId(result.data.batchId);
        setIsUploading(false);
      } else {
        // Friendly error messages for common DB issues
        let friendlyError = result.error?.message || 'Upload failed';
        if (friendlyError.includes('ORA-00942') || friendlyError.includes('does not exist')) {
          friendlyError = 'The onboarding database tables have not been set up yet. Please contact your administrator.';
        } else if (friendlyError.includes('ORA-')) {
          friendlyError = 'A database error occurred. The system may need additional setup for new product onboarding.';
        }
        setError(friendlyError);
        setIsUploading(false);
      }
    } catch (err: any) {
      // Friendly error messages for network/API issues
      let friendlyError = err.message || 'Upload failed';
      if (friendlyError.includes('ORA-00942') || friendlyError.includes('does not exist')) {
        friendlyError = 'The onboarding database tables have not been set up yet. Please contact your administrator.';
      } else if (friendlyError.includes('ORA-')) {
        friendlyError = 'A database error occurred. The system may need additional setup for new product onboarding.';
      } else if (friendlyError.includes('Failed to fetch') || friendlyError.includes('NetworkError')) {
        friendlyError = 'Could not connect to the server. Please check your connection.';
      }
      setError(friendlyError);
      setIsUploading(false);
    }
  };

  const handleBatchComplete = (batch: any) => {
    // Notify parent and close
    onBatchStarted(activeBatchId || '');
    setActiveBatchId(null);
    setQueuedImages([]);
    onClose();
  };

  const imageCount = queuedImages.filter(i => 
    i.file.type.startsWith('image/') || 
    ['.jpg', '.jpeg', '.png', '.webp', '.gif'].some(ext => i.file.name.toLowerCase().endsWith(ext))
  ).length;
  const zipCount = queuedImages.filter(i => i.file.name.toLowerCase().endsWith('.zip')).length;
  const totalSize = queuedImages.reduce((sum, i) => sum + i.file.size, 0);
  const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(1);

  // Show progress tracker if batch is active
  if (activeBatchId) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6 animate-in fade-in duration-200">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
          <BatchProgressTracker 
            batchId={activeBatchId}
            onComplete={handleBatchComplete}
            onClose={() => {
              setActiveBatchId(null);
              setQueuedImages([]);
              onClose();
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh]">
        {/* Header */}
        <header className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-purple-50 to-pink-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg">
              <Upload size={20} />
            </div>
            <div>
              <h2 className="text-sm font-black text-gray-900 uppercase tracking-tight">Bulk AI Onboarding</h2>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Upload multiple product images
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            disabled={isUploading}
            className="p-2 hover:bg-white/50 rounded-full transition-colors text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
              w-full min-h-[180px] border-2 border-dashed rounded-2xl 
              flex flex-col items-center justify-center gap-3 
              transition-all
              ${isDragging 
                ? 'border-purple-500 bg-purple-50 scale-[1.02]' 
                : 'border-gray-200 bg-gray-50/50'
              }
            `}
          >
            <div className={`
              w-14 h-14 rounded-full flex items-center justify-center 
              transition-all ${isDragging ? 'bg-purple-100 text-purple-600 scale-110' : 'bg-gray-100 text-gray-400'}
            `}>
              {isDragging ? <FolderArchive size={28} /> : <Upload size={28} />}
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-gray-700">
                {isDragging ? 'Drop files or folder here' : 'Drag & drop images or a folder'}
              </p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                JPG, PNG, WEBP, or ZIP
              </p>
            </div>
          </div>

          {/* Upload Mode Buttons - Native HTML5 approach */}
          <div className="mt-4 flex items-center gap-3">
            {/* Select Individual Images */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 py-3 px-4 bg-white border-2 border-gray-200 rounded-xl 
                hover:border-purple-400 hover:bg-purple-50 transition-all group"
            >
              <div className="flex items-center justify-center gap-2">
                <Image size={18} className="text-gray-400 group-hover:text-purple-500" />
                <span className="text-sm font-bold text-gray-700">Select Images</span>
              </div>
              <p className="text-[9px] text-gray-400 mt-1">Choose individual files</p>
            </button>

            {/* Select Entire Folder - uses webkitdirectory */}
            <button
              onClick={() => folderInputRef.current?.click()}
              className="flex-1 py-3 px-4 bg-white border-2 border-gray-200 rounded-xl 
                hover:border-purple-400 hover:bg-purple-50 transition-all group"
            >
              <div className="flex items-center justify-center gap-2">
                <FolderArchive size={18} className="text-gray-400 group-hover:text-purple-500" />
                <span className="text-sm font-bold text-gray-700">Select Folder</span>
              </div>
              <p className="text-[9px] text-gray-400 mt-1">Upload entire directory</p>
            </button>
          </div>

          {/* Hidden Inputs - HTML5 Native Approach (battle-tested) */}
          {/* Individual files input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/zip,.zip"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            className="hidden"
          />
          {/* Folder input - webkitdirectory is the standard for folder selection */}
          <input
            ref={folderInputRef}
            type="file"
            // @ts-ignore - webkitdirectory is valid but not in React types
            webkitdirectory=""
            directory=""
            multiple
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            className="hidden"
          />

          {/* Queued Files */}
          {queuedImages.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                  <FileImage size={14} className="text-purple-500" />
                  Queued Files
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[10px] font-bold">
                    {imageCount} image{imageCount !== 1 ? 's' : ''}
                    {zipCount > 0 && ` + ${zipCount} ZIP`}
                  </span>
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px] font-bold">
                    {totalSizeMB} MB
                  </span>
                </h3>
                <button 
                  onClick={clearAll}
                  className="text-[10px] font-bold text-rose-500 hover:text-rose-600 flex items-center gap-1"
                >
                  <Trash2 size={12} />
                  Clear All
                </button>
              </div>

              <div className="grid grid-cols-4 gap-3 max-h-[300px] overflow-y-auto p-1">
                {queuedImages.map((img) => (
                  <div 
                    key={img.id}
                    className="relative group aspect-square bg-gray-50 rounded-xl overflow-hidden border border-gray-200"
                  >
                    {img.preview ? (
                      <img 
                        src={img.preview} 
                        alt={img.file.name} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <FolderArchive size={32} className="text-gray-300" />
                      </div>
                    )}
                    
                    {/* Status overlay */}
                    {img.status === 'processing' && (
                      <div className="absolute inset-0 bg-purple-600/80 flex items-center justify-center">
                        <Loader2 size={24} className="text-white animate-spin" />
                      </div>
                    )}
                    {img.status === 'success' && (
                      <div className="absolute inset-0 bg-emerald-600/80 flex items-center justify-center">
                        <CheckCircle2 size={24} className="text-white" />
                      </div>
                    )}
                    {img.status === 'error' && (
                      <div className="absolute inset-0 bg-rose-600/80 flex items-center justify-center">
                        <AlertCircle size={24} className="text-white" />
                      </div>
                    )}
                    
                    {/* Remove button */}
                    {img.status === 'queued' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                        className="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    )}
                    
                    {/* File name */}
                    <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/70 to-transparent">
                      <p className="text-[8px] text-white truncate font-medium">
                        {img.file.name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload Progress */}
          {isUploading && (
            <div className="mt-6 p-4 bg-purple-50 border border-purple-100 rounded-xl">
              <div className="flex items-center gap-3">
                <Loader2 size={20} className="text-purple-600 animate-spin" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-purple-900">Processing images...</p>
                  <p className="text-[10px] text-purple-600 mt-0.5">
                    AI is analyzing and classifying your products
                  </p>
                </div>
              </div>
              <div className="mt-3 h-2 bg-purple-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-purple-600 rounded-full transition-all duration-500"
                  style={{ width: uploadProgress.total > 0 ? `${(uploadProgress.current / uploadProgress.total) * 100}%` : '0%' }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-6 p-4 bg-rose-50 border border-rose-100 rounded-xl">
              <div className="flex items-center gap-3">
                <AlertCircle size={20} className="text-rose-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-rose-700">Upload Error</p>
                  <p className="text-xs text-rose-600 mt-1">
                    {error.includes('ORA-') 
                      ? 'A database error occurred. Please try again or contact support.'
                      : error}
                  </p>
                  {error.includes('ORA-') && (
                    <details className="mt-2">
                      <summary className="text-[10px] text-rose-500 cursor-pointer">Technical Details</summary>
                      <code className="text-[10px] text-rose-500 block mt-1 break-all">{error}</code>
                    </details>
                  )}
                </div>
              </div>
              <button 
                onClick={() => setError(null)}
                className="mt-3 text-xs font-bold text-rose-600 hover:text-rose-700"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Info Panel */}
          <div className="mt-6 p-4 bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
                <Sparkles size={16} />
              </div>
              <div>
                <p className="text-xs font-bold text-purple-900 uppercase">AI Discovery Mode</p>
                <p className="text-[11px] text-purple-700 leading-relaxed mt-1">
                  Each image will be analyzed to identify: <strong>Product Hierarchy</strong> (Department → Class → Subclass), 
                  <strong>Primary Color</strong>, <strong>Material</strong>, and other attributes. 
                  You'll review and approve AI suggestions before they're saved.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            {imageCount > 0 && <span className="font-bold text-gray-700">{imageCount} images</span>}
            {zipCount > 0 && <span className="font-bold text-gray-700">{imageCount > 0 ? ' + ' : ''}{zipCount} ZIP</span>}
            {queuedImages.length === 0 && <span>No files selected</span>}
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onClose} 
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button 
              variant="primary" 
              size="sm" 
              onClick={startUpload} 
              disabled={queuedImages.length === 0 || isUploading}
              isLoading={isUploading}
              icon={<Play size={14} />}
            >
              Start AI Discovery
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default BulkUploadModal;
