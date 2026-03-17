import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Maximize2, Download } from 'lucide-react';

interface ImageLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  src: string | null;
  alt: string;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({ isOpen, onClose, src, alt }) => {
  // Handle ESC key to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden'; // Prevent scrolling
    }
    return () => {
      window.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !src) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/95 backdrop-blur-md animate-in fade-in duration-200 pointer-events-auto"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      {/* Header Controls - Elevated z-index */}
      <div 
        className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center text-white/80 z-20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-lg">
            <Maximize2 className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-black uppercase tracking-widest text-white">{alt}</span>
            <span className="text-[10px] text-white/40 font-medium">High Quality Preview</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              const link = document.createElement('a');
              link.href = src;
              link.download = alt || 'image.jpg';
              link.click();
            }}
            className="p-3 bg-white/5 hover:bg-white/20 rounded-full transition-all border border-white/10 group shadow-lg"
            title="Download HQ Image"
          >
            <Download className="w-6 h-6 text-white" />
          </button>
          
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-3 bg-white/5 hover:bg-indigo-600 rounded-full transition-all border border-white/10 shadow-lg group"
            title="Close (Esc)"
          >
            <X className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
          </button>
        </div>
      </div>

      {/* Image Container - Forced to fill space */}
      <div 
        className="relative w-full h-full flex items-center justify-center p-4 md:p-20"
        onClick={(e) => {
          e.stopPropagation();
          onClose(); // Click on backdrop (even in container padding) closes
        }}
      >
        <img
          src={src}
          alt={alt}
          onClick={(e) => e.stopPropagation()} // Clicking the image itself does NOT close
          className="max-w-full max-h-full w-auto h-auto object-contain shadow-[0_0_100px_rgba(0,0,0,0.5)] rounded-md animate-in zoom-in-95 duration-500 select-none border border-white/5 cursor-default"
        />
      </div>

      {/* Footer / Helper */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 px-6 py-2.5 bg-black/40 rounded-full backdrop-blur-xl border border-white/10 text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] shadow-2xl pointer-events-none">
        Esc or Click anywhere to exit
      </div>
    </div>,
    document.body
  );
};

