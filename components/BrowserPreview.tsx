import React from 'react';
import { Globe, Lock, RefreshCw, ChevronLeft, ChevronRight, Search } from 'lucide-react';

interface BrowserPreviewProps {
  url: string;
  isProcessing: boolean;
  currentAction?: string;
}

const BrowserPreview: React.FC<BrowserPreviewProps> = ({ url, isProcessing, currentAction }) => {
  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden shadow-2xl">
      {/* Browser Bar */}
      <div className="bg-zinc-800 px-4 py-2 flex items-center gap-4 border-b border-zinc-700">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
          <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
        </div>
        <div className="flex items-center gap-2 text-zinc-400">
          <ChevronLeft className="w-4 h-4 cursor-pointer hover:text-white" />
          <ChevronRight className="w-4 h-4 cursor-pointer hover:text-white" />
          <RefreshCw className={`w-3.5 h-3.5 cursor-pointer hover:text-white ${isProcessing ? 'animate-spin' : ''}`} />
        </div>
        <div className="flex-1 bg-zinc-900 rounded-md px-3 py-1.5 flex items-center gap-2 text-xs font-mono text-zinc-300 border border-zinc-700">
          <Lock className="w-3 h-3 text-green-500" />
          <span className="truncate">{url || 'about:blank'}</span>
        </div>
      </div>

      {/* Viewport */}
      <div className="flex-1 relative bg-white relative">
        {/* Placeholder Content since we can't actually embed arbitrary sites safely without iframe issues */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400 bg-zinc-50 pattern-grid">
            {url ? (
                <>
                    <Globe className="w-16 h-16 mb-4 text-zinc-300" />
                    <h3 className="text-xl font-bold text-zinc-800 mb-2">Remote Browser Session</h3>
                    <p className="max-w-md text-center text-zinc-500 mb-8">
                        Stagehand is controlling this view via CDP (Chrome DevTools Protocol).
                    </p>
                    
                    {isProcessing && (
                         <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-full shadow-lg border border-zinc-200 animate-bounce">
                            <Search className="w-5 h-5 text-indigo-600 animate-pulse" />
                            <span className="text-zinc-700 font-medium">
                                {currentAction || 'Analyzing DOM...'}
                            </span>
                        </div>
                    )}
                </>
            ) : (
                <div className="text-center">
                    <div className="w-16 h-16 mx-auto bg-zinc-200 rounded-full flex items-center justify-center mb-4">
                        <Globe className="w-8 h-8 text-zinc-400" />
                    </div>
                    <p>Enter a URL to begin automation</p>
                </div>
            )}
        </div>
      </div>
      
      <style>{`
        .pattern-grid {
            background-image: radial-gradient(#cbd5e1 1px, transparent 1px);
            background-size: 20px 20px;
        }
      `}</style>
    </div>
  );
};

export default BrowserPreview;