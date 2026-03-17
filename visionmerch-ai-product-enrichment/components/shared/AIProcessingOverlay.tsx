/**
 * AIProcessingOverlay - Animated full-screen processing indicator
 * 
 * PM Vision: Full-screen purple backdrop with animated spinner
 * Shows during AI enrichment operations
 */

import React from 'react';
import { Sparkles } from 'lucide-react';

interface AIProcessingOverlayProps {
  isVisible: boolean;
  itemCount?: number;
  currentItem?: number;
  message?: string;
}

export const AIProcessingOverlay: React.FC<AIProcessingOverlayProps> = ({
  isVisible,
  itemCount = 1,
  currentItem = 0,
  message = 'Analyzing product imagery with AI vision models'
}) => {
  if (!isVisible) return null;

  const progress = itemCount > 1 ? Math.round((currentItem / itemCount) * 100) : null;

  return (
    <div className="fixed inset-0 z-[100] bg-purple-900/70 backdrop-blur-md flex items-center justify-center">
      <div className="max-w-lg text-center px-8">
        {/* Animated Spinner */}
        <div className="relative w-28 h-28 mx-auto mb-10">
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border-4 border-white/10" />
          {/* Spinning ring */}
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-yellow-400 animate-spin-slow" />
          {/* Inner glow */}
          <div className="absolute inset-4 rounded-full bg-purple-800/50 flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-yellow-400 animate-pulse" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-3xl font-black text-white mb-4 tracking-tight">
          Processing AI Attribution
        </h2>

        {/* Description */}
        <p className="text-purple-200 font-medium leading-relaxed mb-6">
          {message}
        </p>

        {/* Progress indicator */}
        {progress !== null && (
          <div className="mb-8">
            <div className="flex items-center justify-center gap-3 mb-3">
              <span className="text-sm font-bold text-purple-300">
                {currentItem} of {itemCount} styles
              </span>
              <span className="text-yellow-400 font-black text-lg">{progress}%</span>
            </div>
            <div className="h-2 bg-purple-800/50 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-pink-500 to-yellow-400 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Bouncing dots */}
        <div className="flex justify-center gap-2">
          <div className="w-2.5 h-2.5 bg-yellow-400 rounded-full animate-bounce-dot" />
          <div className="w-2.5 h-2.5 bg-yellow-400 rounded-full animate-bounce-dot-delay-1" />
          <div className="w-2.5 h-2.5 bg-yellow-400 rounded-full animate-bounce-dot-delay-2" />
        </div>

        {/* Brand footer */}
        <div className="mt-10 flex items-center justify-center gap-2">
          <span className="text-[10px] font-black text-purple-400 uppercase tracking-[0.2em]">
            Powered by
          </span>
          <div className="brand-chip-styleiq">
            <span>style</span>
            <span className="iq-badge">IQ ★</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIProcessingOverlay;
