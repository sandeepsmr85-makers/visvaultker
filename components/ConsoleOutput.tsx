import React, { useEffect, useRef } from 'react';
import { Terminal, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { LogEntry } from '../types';

interface ConsoleOutputProps {
  logs: LogEntry[];
}

const ConsoleOutput: React.FC<ConsoleOutputProps> = ({ logs }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getIcon = (level: string) => {
    switch (level) {
      case 'error': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'success': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'warn': return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default: return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-400';
      case 'success': return 'text-green-400';
      case 'warn': return 'text-yellow-400';
      default: return 'text-zinc-300';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0c0c0e] border-t border-zinc-800">
      <div className="flex items-center px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
        <Terminal className="w-4 h-4 text-zinc-400 mr-2" />
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">System Output</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 font-mono text-sm space-y-2">
        {logs.length === 0 && (
          <div className="text-zinc-600 italic">Waiting for process to start...</div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="flex items-start group hover:bg-zinc-900/50 -mx-2 px-2 py-1 rounded">
            <span className="text-zinc-600 text-xs w-20 shrink-0 mt-0.5">{log.timestamp}</span>
            <div className="mr-3 mt-0.5">{getIcon(log.level)}</div>
            <div className="flex-1 break-all">
               {log.category && (
                 <span className="text-indigo-400 font-bold mr-2">[{log.category}]</span>
               )}
               <span className={getColor(log.level)}>{log.message}</span>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};

export default ConsoleOutput;