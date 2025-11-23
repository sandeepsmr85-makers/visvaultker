import React, { useState, useEffect, useCallback } from 'react';
import { 
  Play, 
  Settings, 
  Box, 
  Layout, 
  Code2, 
  ChevronRight, 
  Loader2,
  AlertTriangle,
  Send,
  ShieldCheck
} from 'lucide-react';
import ConsoleOutput from './components/ConsoleOutput';
import BrowserPreview from './components/BrowserPreview';
import CodeViewer from './components/CodeViewer';
import { generateAutomationPlan } from './services/geminiService';
import { LogEntry, Step, AutomationStatus, ClientConfig, DEFAULT_CONFIG } from './types';

const App: React.FC = () => {
  // State
  const [activeTab, setActiveTab] = useState<'run' | 'code'>('run');
  const [url, setUrl] = useState('https://www.amazon.com');
  const [prompt, setPrompt] = useState('Find the cheapest running shoes and add them to cart');
  const [status, setStatus] = useState<AutomationStatus>(AutomationStatus.IDLE);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [config, setConfig] = useState<ClientConfig>(DEFAULT_CONFIG);
  const [isApiKeySet, setIsApiKeySet] = useState(false);

  // Initial Check
  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    const win = window as any;
    if (win.aistudio) {
      const hasKey = await win.aistudio.hasSelectedApiKey();
      setIsApiKeySet(hasKey);
    }
  };

  const handleSelectKey = async () => {
    const win = window as any;
    if (win.aistudio) {
      await win.aistudio.openSelectKey();
      await checkApiKey();
    }
  };

  const addLog = useCallback((message: string, level: LogEntry['level'] = 'info', category: string = 'SYSTEM') => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36),
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
      category
    }]);
  }, []);

  const handleRun = async () => {
    if (!isApiKeySet) {
      addLog("Please select a Gemini API Key to run the simulation.", "error");
      handleSelectKey();
      return;
    }

    if (!url || !prompt) {
      addLog("URL and Prompt are required.", "warn");
      return;
    }

    setStatus(AutomationStatus.RUNNING);
    setLogs([]); // Clear logs
    setSteps([]); // Clear steps
    
    addLog(`Initializing Stagehand with custom model: ${config.modelName}`, "info", "INIT");
    addLog(`Target URL: ${url}`, "info", "NAV");

    try {
      // 1. Plan Phase
      addLog("Analyzing intent and generating plan...", "info", "PLANNER");
      const plan = await generateAutomationPlan(prompt, url);
      setSteps(plan);
      addLog(`Generated ${plan.length} steps for execution.`, "success", "PLANNER");

      // 2. Execution Simulation Phase
      for (let i = 0; i < plan.length; i++) {
        const step = plan[i];
        
        // Update Step Status to Active
        setSteps(prev => prev.map(s => s.id === step.id ? { ...s, status: 'active' } : s));
        addLog(`Executing: ${step.action} - ${step.description}`, "info", "EXECUTOR");
        
        // Simulate delay based on action type
        const delay = step.action === 'GOTO' ? 2000 : step.action === 'OBSERVE' ? 1500 : 3000;
        await new Promise(r => setTimeout(r, delay));

        // Random chance of "retrying" or verbose logging
        if (Math.random() > 0.7) {
            addLog(`Verifying element visibility...`, "info", "DOM");
            await new Promise(r => setTimeout(r, 500));
        }

        // Complete Step
        setSteps(prev => prev.map(s => s.id === step.id ? { ...s, status: 'completed' } : s));
        addLog(`Completed: ${step.id}`, "success", "EXECUTOR");
      }

      setStatus(AutomationStatus.COMPLETED);
      addLog("Automation sequence finished successfully.", "success", "SYSTEM");

    } catch (err) {
      setStatus(AutomationStatus.FAILED);
      addLog(`Execution failed: ${err instanceof Error ? err.message : String(err)}`, "error", "SYSTEM");
    }
  };

  const activeStep = steps.find(s => s.status === 'active');

  return (
    <div className="flex h-screen bg-black text-zinc-100 overflow-hidden font-sans selection:bg-indigo-500/30">
      
      {/* Sidebar / Configuration */}
      <div className="w-80 border-r border-zinc-800 flex flex-col bg-zinc-950">
        <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Box className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-wide">Stagehand UI</h1>
            <p className="text-[10px] text-zinc-500 uppercase font-mono">v3.0.1 • Custom Client</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
            
            {/* Status Card */}
            <div className={`p-3 rounded-md border ${isApiKeySet ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase text-zinc-400">API Access</span>
                    {isApiKeySet ? <span className="text-green-500 text-xs">Connected</span> : <span className="text-red-500 text-xs">Required</span>}
                </div>
                {!isApiKeySet && (
                    <button onClick={handleSelectKey} className="w-full text-xs bg-red-500 hover:bg-red-600 text-white py-1.5 rounded transition-colors">
                        Connect Gemini API
                    </button>
                )}
            </div>

            {/* Custom LLM Config */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 text-zinc-400 border-b border-zinc-800 pb-2">
                    <Settings className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase">Custom LLM Config</span>
                </div>
                
                {/* Auth Strategy Indicator */}
                <div className="bg-zinc-900/50 p-2 rounded border border-zinc-800 flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-500 mt-0.5" />
                    <div>
                        <div className="text-[10px] font-bold text-zinc-300">Auth Strategy: OAuth</div>
                        <div className="text-[10px] text-zinc-500">
                            Tokens fetched via <code>fetch_token.py</code> subprocess.
                        </div>
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-[10px] uppercase text-zinc-500 font-bold">API Endpoint (Base)</label>
                    <input 
                        type="text" 
                        value={config.apiEndpoint}
                        onChange={(e) => setConfig({...config, apiEndpoint: e.target.value})}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-zinc-300" 
                        placeholder="https://api.custom-llm.com"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] uppercase text-zinc-500 font-bold">Actual Model Name</label>
                    <input 
                        type="text" 
                        value={config.actualModelName}
                        onChange={(e) => setConfig({...config, actualModelName: e.target.value})}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none text-zinc-300" 
                    />
                </div>
            </div>

            {/* Steps List (Mini) */}
            <div className="flex-1 min-h-[200px]">
                <div className="flex items-center gap-2 text-zinc-400 border-b border-zinc-800 pb-2 mb-3">
                    <Layout className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase">Execution Plan</span>
                </div>
                <div className="space-y-2">
                    {steps.length === 0 && (
                        <div className="text-zinc-600 text-xs italic text-center py-4">No plan generated yet.</div>
                    )}
                    {steps.map((step, idx) => (
                        <div key={step.id} className={`flex gap-3 text-xs p-2 rounded ${step.status === 'active' ? 'bg-indigo-500/10 border border-indigo-500/30' : 'text-zinc-500'}`}>
                            <div className="font-mono opacity-50">{idx + 1}.</div>
                            <div className="flex-1">
                                <div className={`font-bold ${step.status === 'active' ? 'text-indigo-400' : 'text-zinc-400'}`}>{step.action}</div>
                                <div className="truncate text-[10px]">{step.description}</div>
                            </div>
                            {step.status === 'active' && <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />}
                            {step.status === 'completed' && <div className="w-2 h-2 rounded-full bg-green-500 mt-1" />}
                        </div>
                    ))}
                </div>
            </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Navigation */}
        <div className="h-14 border-b border-zinc-800 flex items-center px-6 justify-between bg-zinc-950/50 backdrop-blur-sm sticky top-0 z-10">
           <div className="flex space-x-6">
                <button 
                    onClick={() => setActiveTab('run')}
                    className={`text-sm font-medium border-b-2 h-14 transition-colors ${activeTab === 'run' ? 'border-indigo-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                >
                    Simulation & Runner
                </button>
                <button 
                    onClick={() => setActiveTab('code')}
                    className={`text-sm font-medium border-b-2 h-14 transition-colors ${activeTab === 'code' ? 'border-indigo-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                >
                    Backend Code <Code2 className="w-3 h-3 inline ml-1 opacity-50" />
                </button>
           </div>
           
           <div className="flex items-center gap-4">
               {status === AutomationStatus.RUNNING && (
                   <div className="flex items-center gap-2 px-3 py-1 bg-indigo-500/10 rounded-full border border-indigo-500/20">
                       <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                        </span>
                        <span className="text-xs font-medium text-indigo-300">Agent Running</span>
                   </div>
               )}
           </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden relative">
            
            {activeTab === 'run' && (
                <div className="h-full flex flex-col">
                    {/* Prompt Input */}
                    <div className="p-6 border-b border-zinc-800 bg-zinc-900/30">
                        <div className="max-w-4xl mx-auto space-y-4">
                            <div className="flex gap-4">
                                <div className="flex-1 relative">
                                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                        <span className="text-zinc-500 text-xs font-bold">URL</span>
                                    </div>
                                    <input 
                                        type="text" 
                                        value={url}
                                        onChange={(e) => setUrl(e.target.value)}
                                        className="w-full bg-black border border-zinc-700 rounded-lg pl-12 pr-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all"
                                        placeholder="https://example.com"
                                    />
                                </div>
                                <button 
                                    onClick={handleRun}
                                    disabled={status === AutomationStatus.RUNNING}
                                    className={`px-6 py-3 rounded-lg font-medium text-sm flex items-center gap-2 transition-all ${
                                        status === AutomationStatus.RUNNING 
                                        ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' 
                                        : 'bg-white text-black hover:bg-zinc-200'
                                    }`}
                                >
                                    {status === AutomationStatus.RUNNING ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                                    {status === AutomationStatus.RUNNING ? 'Running...' : 'Start Automation'}
                                </button>
                            </div>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-3 top-3 pointer-events-none">
                                    <ChevronRight className="w-4 h-4 text-zinc-500" />
                                </div>
                                <textarea 
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    className="w-full bg-black border border-zinc-700 rounded-lg pl-10 pr-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:ring-2 focus:ring-indigo-500/50 outline-none min-h-[80px] resize-none"
                                    placeholder="Describe the automation task... e.g. 'Go to the pricing page and extract the pro plan cost'"
                                />
                                <div className="absolute bottom-3 right-3">
                                    <div className="bg-zinc-800 text-zinc-400 text-[10px] px-2 py-1 rounded">
                                        Powered by Gemini 2.5
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Simulation Viewport */}
                    <div className="flex-1 flex overflow-hidden">
                        {/* Browser View */}
                        <div className="flex-1 p-6 bg-[#09090b] flex flex-col justify-center">
                            <BrowserPreview 
                                url={url} 
                                isProcessing={status === AutomationStatus.RUNNING}
                                currentAction={activeStep?.description}
                            />
                        </div>
                        
                        {/* Logs */}
                        <div className="w-[400px] border-l border-zinc-800">
                             <ConsoleOutput logs={logs} />
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'code' && (
                <div className="h-full overflow-y-auto p-8">
                    <div className="max-w-4xl mx-auto">
                        <div className="mb-6">
                            <h2 className="text-xl font-bold text-white mb-2">Backend Implementation</h2>
                            <p className="text-zinc-400 text-sm">
                                This web application acts as a controller. To enable the actual automation, 
                                verify your <code>CustomLLMClient.ts</code> implementation matches the configuration below.
                            </p>
                        </div>
                        <CodeViewer />
                        
                        <div className="mt-8 grid grid-cols-2 gap-6">
                             <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800">
                                 <div className="flex items-center gap-2 mb-2 text-indigo-400">
                                     <Box className="w-4 h-4" />
                                     <h3 className="font-bold text-sm">Stagehand Config</h3>
                                 </div>
                                 <p className="text-xs text-zinc-500 leading-relaxed">
                                     Ensure your <code>stagehand.config.ts</code> uses the custom client wrapper. The frontend sends the prompt to your backend, which initializes the <code>LLMClient</code> with the OAuth tokens retrieved via the Python script.
                                 </p>
                             </div>
                             <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800">
                                 <div className="flex items-center gap-2 mb-2 text-orange-400">
                                     <AlertTriangle className="w-4 h-4" />
                                     <h3 className="font-bold text-sm">Security Warning</h3>
                                 </div>
                                 <p className="text-xs text-zinc-500 leading-relaxed">
                                     Never expose your OAuth tokens or raw API keys in the frontend code. This UI simulates the flow; real execution should happen in a secure Node.js environment.
                                 </p>
                             </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
      </div>
    </div>
  );
};

export default App;