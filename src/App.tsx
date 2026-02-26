import { useState, useEffect, useRef } from 'react';
import {
  getInstalledModels,
  pullModel,
  generatePrompt,
  generatePromptStream,
  OllamaModel,
  DEFAULT_OLLAMA_URL,
  mockInstalledModels,
  mockGeneratePrompt,
  mockGeneratePromptStream,
} from './services/ollama';
import ReactMarkdown from 'react-markdown';
import {
  Download,
  Loader2,
  Copy,
  Check,
  Cpu,
  Zap,
  Settings2,
  AlertCircle,
  Save,
  TestTube2,
  FileText,
  Code,
  X,
  RefreshCw,
  Edit3,
  Eye,
  History,
  Clock,
  Trash2,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Info,
  LayoutTemplate,
} from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TARGET_MODELS = [
  'dolphin-mistral',
  'dolphin-llama3',
  'wizardlm-uncensored',
];

const FORMATS = {
  KLEIN: 'FLUX.2.KLEIN',
  ZIMAGE: 'Z-IMAGE',
};

const MODEL_DETAILS: Record<string, { vram: string; description: string; params: string }> = {
  'dolphin-mistral': {
    vram: '~4GB VRAM',
    params: '7B',
    description: 'Efficient, uncensored, good for general prompts.'
  },
  'dolphin-llama3': {
    vram: '~5GB VRAM',
    params: '8B',
    description: 'High logic, follows complex instructions well.'
  },
  'wizardlm-uncensored': {
    vram: '~8GB VRAM',
    params: '13B',
    description: 'Creative and descriptive, but requires more VRAM.'
  }
};

const DEFAULT_SYSTEM_PROMPTS = {
  [FORMATS.KLEIN]: `You are a Professional Prompt Architect for ComfyUI. Your goal is to rewrite the user's input into a highly structured, cinematic, and technically accurate image generation prompt. You prioritize realism, material physics, and uncensored, explicit detail if the user requests it.
      
Output strictly in this JSON format:
{
  "subject": {"description": "", "pose": "", "expression": ""},
  "clothing": {"garment": "", "fabric_detail": ""},
  "hair": {"color": "", "style": ""},
  "face": {"skin_tone": "", "features": "", "makeup": ""},
  "accessories": {"jewelry": ""},
  "environment": {"setting": "", "background_elements": "", "atmosphere": ""},
  "lighting": {"source": "", "quality": "", "effects": ""},
  "camera": {"camera_model": "", "shot_on": "", "perspective": "", "focus": "", "lens_character": ""},
  "style": {"aesthetic": "", "mood": "", "visual_reference": ""},
  "model_optimization": {"keywords": ""}
}
Then, provide a separator '---', followed by a single comma-separated text string combining all values.

CAMERA STRICTNESS: Only use cameras like Fujifilm GFX100 II, Sony A1, Canon EOS R5, Leica M11 Monochrom, or Kodak Portra 400.`,
  [FORMATS.ZIMAGE]: `You are a Professional Prompt Architect for ComfyUI. Your goal is to rewrite the user's input into a highly structured, cinematic, and technically accurate image generation prompt. You prioritize realism, material physics, and uncensored, explicit detail if the user requests it.

Output strictly in this Markdown format:
## Subject: [Description] \\n - Body Type: \\n - Facial expressions:
## Action/Scene: [Description] \\n - Outfit: \\n - Accessories:
## Background: [Description] \\n - Background elements: \\n - Additional objects/props:
## Lighting/Style: [Description] \\n - Lighting type: \\n - Focus: \\n - Depth of field: \\n - Shadow behavior:
## Mood/style:
## Enhancers: [List 5 bullet points]
Then, provide a separator '---', followed by a single comma-separated text string combining all values.

CAMERA STRICTNESS: Only use cameras like Fujifilm GFX100 II, Sony A1, Canon EOS R5, Leica M11 Monochrom, or Kodak Portra 400.`
};

interface HistoryItem {
  id: string;
  timestamp: number;
  userInput: string;
  generatedOutput: string;
  model: string;
  format: string;
  systemPrompt: string;
}

export default function App() {
  // State
  const [installedModels, setInstalledModels] = useState<OllamaModel[]>([]);
  
  // Persisted State Loaders
  const [selectedModel, setSelectedModel] = useState<string>(() => localStorage.getItem('selectedModel') || TARGET_MODELS[0]);
  const [selectedFormat, setSelectedFormat] = useState<string>(() => localStorage.getItem('selectedFormat') || FORMATS.KLEIN);
  const [userInput, setUserInput] = useState(() => localStorage.getItem('userInput') || '');
  
  const [generatedOutput, setGeneratedOutput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<'idle' | 'loading_model' | 'generating' | 'completed'>('idle');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [downloadDetails, setDownloadDetails] = useState<{ completed: number, total: number } | null>(null);
  const [downloadSpeed, setDownloadSpeed] = useState<string>('');
  const [downloadEta, setDownloadEta] = useState<string>('');
  
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [ollamaUrl, setOllamaUrl] = useState(DEFAULT_OLLAMA_URL);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // New Feature State
  const [outputMode, setOutputMode] = useState<'markdown' | 'raw'>('markdown');
  const [jsonCodeBlock, setJsonCodeBlock] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState(() => localStorage.getItem('systemPrompt') || DEFAULT_SYSTEM_PROMPTS[FORMATS.KLEIN]);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  
  // Custom Select State
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  
  // History State
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem('prompt_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [showHistory, setShowHistory] = useState(false);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const downloadStatsRef = useRef<{ lastBytes: number; lastTime: number } | null>(null);

  // Initial Load
  useEffect(() => {
    checkInstalledModels(ollamaUrl);
  }, []);

  // Persistence Effects
  useEffect(() => { localStorage.setItem('selectedModel', selectedModel); }, [selectedModel]);
  useEffect(() => { localStorage.setItem('selectedFormat', selectedFormat); }, [selectedFormat]);
  useEffect(() => { localStorage.setItem('userInput', userInput); }, [userInput]);
  useEffect(() => { localStorage.setItem('systemPrompt', systemPrompt); }, [systemPrompt]);
  useEffect(() => {
    localStorage.setItem('prompt_history', JSON.stringify(history));
  }, [history]);

  // Update system prompt when format changes, but only if user hasn't heavily modified it?
  // We'll reset it if it matches one of the defaults, otherwise keep user edits?
  // For now, let's stick to the previous behavior but respect the persisted value on load.
  // Actually, if the user changes format, we probably WANT to switch the system prompt template.
  useEffect(() => {
    // Only auto-switch if the current prompt matches one of the defaults (i.e., user hasn't customized it heavily)
    // OR if we just want to enforce the format's template.
    // Let's enforce the template for the new format to ensure correct output structure.
    setSystemPrompt(DEFAULT_SYSTEM_PROMPTS[selectedFormat as keyof typeof DEFAULT_SYSTEM_PROMPTS]);
  }, [selectedFormat]);

  const addToHistory = (output: string) => {
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      userInput,
      generatedOutput: output,
      model: selectedModel,
      format: selectedFormat,
      systemPrompt,
    };
    setHistory(prev => [newItem, ...prev]);
  };

  const loadHistoryItem = (item: HistoryItem) => {
    setUserInput(item.userInput);
    setGeneratedOutput(item.generatedOutput);
    setSelectedModel(item.model);
    setSelectedFormat(item.format);
    setSystemPrompt(item.systemPrompt);
    setShowHistory(false);
  };

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const clearHistory = () => {
    if (confirm('Are you sure you want to clear all history?')) {
      setHistory([]);
    }
  };

  const checkInstalledModels = async (url: string) => {
    if (isDemoMode) {
      setInstalledModels(mockInstalledModels);
      setError(null);
      return;
    }

    try {
      const models = await getInstalledModels(url);
      setInstalledModels(models);
      setError(null);
    } catch (err: any) {
      const errorMessage = err.message || 'Could not connect to Ollama.';
      
      // Auto-switch to Demo Mode if we detect the cloud preview environment issue
      // Also catch 500 errors which usually mean the proxy failed to connect (ECONNREFUSED)
      if (errorMessage.includes('Received HTML instead of JSON') || 
          errorMessage.includes('cloud preview') || 
          errorMessage.includes('Cloud Preview detected') ||
          errorMessage.includes('500') || 
          errorMessage.includes('Proxy error') ||
          errorMessage.includes('ECONNREFUSED') ||
          errorMessage.includes('Ollama Server Error')) {
         console.log('Connection issue detected: Auto-enabled Demo Mode.');
         setIsDemoMode(true);
         setInstalledModels(mockInstalledModels);
         setError(null); // Clear error to prevent red banner
      } else {
         setError(errorMessage);
         setInstalledModels([]);
      }
    }
  };

  const toggleDemoMode = () => {
    const newMode = !isDemoMode;
    setIsDemoMode(newMode);
    if (newMode) {
      setInstalledModels(mockInstalledModels);
      setError(null);
    } else {
      setInstalledModels([]);
      checkInstalledModels(ollamaUrl);
    }
  };

  const isModelInstalled = (modelName: string) => {
    return installedModels.some((m) => m.name.includes(modelName));
  };

  const handleDownload = async () => {
    if (isDemoMode) {
      setIsDownloading(true);
      setDownloadStatus('Simulating download...');
      setDownloadSpeed('15.5 MB/s');
      let progress = 0;
      const interval = setInterval(() => {
        progress += 5;
        setDownloadProgress(progress);
        const total = 4000000000; // 4GB
        const completed = (progress / 100) * total;
        setDownloadDetails({ completed, total });
        
        // Simulating ETA
        const remaining = total - completed;
        const speed = 15500000; // ~15.5MB/s
        const seconds = remaining / speed;
        setDownloadEta(`${Math.ceil(seconds)}s`);

        if (progress >= 100) {
          clearInterval(interval);
          setIsDownloading(false);
          setDownloadDetails(null);
          setDownloadSpeed('');
          setDownloadEta('');
          setInstalledModels(prev => [...prev, { 
            name: `${selectedModel}:latest`, 
            modified_at: new Date().toISOString(), 
            size: 0, 
            digest: 'mock', 
            details: { format: 'gguf', family: 'llama', families: ['llama'], parameter_size: '7B', quantization_level: 'Q4_0' } 
          }]);
        }
      }, 200);
      return;
    }

    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadStatus('Starting download...');
    setDownloadDetails(null);
    setDownloadSpeed('');
    setDownloadEta('');
    setError(null);

    abortControllerRef.current = new AbortController();
    downloadStatsRef.current = { lastBytes: 0, lastTime: Date.now() };

    try {
      await pullModel(selectedModel, (data) => {
        setDownloadProgress(data.progress);
        setDownloadStatus(data.status);
        
        if (data.completed && data.total) {
          setDownloadDetails({ completed: data.completed, total: data.total });
          
          // Calculate Speed and ETA
          const now = Date.now();
          const stats = downloadStatsRef.current;
          
          if (stats && now - stats.lastTime > 1000) {
            const bytesDiff = data.completed - stats.lastBytes;
            const timeDiff = (now - stats.lastTime) / 1000; // seconds
            const speedBytesPerSec = bytesDiff / timeDiff;
            
            setDownloadSpeed(`${(speedBytesPerSec / 1024 / 1024).toFixed(1)} MB/s`);
            
            const remainingBytes = data.total - data.completed;
            const etaSeconds = remainingBytes / speedBytesPerSec;
            
            if (etaSeconds < 60) {
              setDownloadEta(`${Math.ceil(etaSeconds)}s`);
            } else {
              setDownloadEta(`${Math.ceil(etaSeconds / 60)}m ${Math.ceil(etaSeconds % 60)}s`);
            }
            
            downloadStatsRef.current = { lastBytes: data.completed, lastTime: now };
          } else if (!stats) {
             downloadStatsRef.current = { lastBytes: data.completed, lastTime: now };
          }
        }
      }, ollamaUrl, abortControllerRef.current.signal);
      
      await checkInstalledModels(ollamaUrl);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setDownloadStatus('Download cancelled');
      } else {
        const errorMessage = err.message || 'Failed to download model.';
        if (errorMessage.includes('Received HTML instead of JSON') || 
            errorMessage.includes('cloud preview') || 
            errorMessage.includes('500') || 
            errorMessage.includes('ECONNREFUSED') ||
            errorMessage.includes('Ollama Server Error')) {
           console.log('Connection issue detected during download: Auto-enabled Demo Mode.');
           setIsDemoMode(true);
           setInstalledModels(mockInstalledModels);
           setError(null);
        } else {
           setError(`Failed to download model: ${errorMessage}`);
        }
      }
    } finally {
      setIsDownloading(false);
      setDownloadDetails(null);
      setDownloadSpeed('');
      setDownloadEta('');
      abortControllerRef.current = null;
      downloadStatsRef.current = null;
    }
  };

  const cancelDownload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleGenerate = async () => {
    if (!userInput.trim()) return;
    
    setIsGenerating(true);
    setGenerationStatus('loading_model');
    setError(null);
    setGeneratedOutput('');

    if (isDemoMode) {
      try {
        let fullResponse = '';
        // Use mock stream
        const stream = mockGeneratePromptStream(selectedModel, '', userInput);
        
        let isFirstChunk = true;
        for await (const chunk of stream) {
          if (isFirstChunk) {
            setGenerationStatus('generating');
            isFirstChunk = false;
          }
          fullResponse += chunk;
          setGeneratedOutput(prev => prev + chunk);
        }
        addToHistory(fullResponse);
        setGenerationStatus('completed');
      } finally {
        setIsGenerating(false);
        setGenerationStatus('idle');
      }
      return;
    }

    try {
      let fullResponse = '';
      const stream = generatePromptStream(selectedModel, systemPrompt, userInput, ollamaUrl);
      
      let isFirstChunk = true;
      for await (const chunk of stream) {
        if (isFirstChunk) {
          setGenerationStatus('generating');
          isFirstChunk = false;
        }
        fullResponse += chunk;
        setGeneratedOutput(prev => prev + chunk);
      }
      addToHistory(fullResponse);
      setGenerationStatus('completed');
    } catch (err: any) {
      const errorMessage = err.message || 'Generation failed.';
      if (errorMessage.includes('Received HTML instead of JSON') || 
          errorMessage.includes('cloud preview') || 
          errorMessage.includes('500') || 
          errorMessage.includes('ECONNREFUSED') ||
          errorMessage.includes('Ollama Server Error')) {
         console.log('Connection issue detected during generation: Auto-enabled Demo Mode.');
         setIsDemoMode(true);
         setInstalledModels(mockInstalledModels);
         setError(null);
      } else {
         setError(`Generation failed: ${errorMessage}`);
      }
    } finally {
      setIsGenerating(false);
      setGenerationStatus('idle');
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-black text-neutral-200 font-sans selection:bg-indigo-500/30 relative overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-900/20 rounded-full blur-[120px] animate-blob mix-blend-screen" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-900/10 rounded-full blur-[120px] animate-blob animation-delay-2000 mix-blend-screen" />
        <div className="absolute top-[20%] right-[20%] w-[30%] h-[30%] bg-blue-900/10 rounded-full blur-[100px] animate-blob animation-delay-4000 mix-blend-screen" />
        <div className="absolute bottom-[20%] left-[20%] w-[25%] h-[25%] bg-purple-900/10 rounded-full blur-[100px] animate-blob-reverse mix-blend-screen" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-4 lg:p-8 space-y-8">
        
        {/* Header */}
        <header className="flex items-center justify-between border-b border-white/5 pb-6 backdrop-blur-sm relative z-20">
          <div className="flex items-center gap-4 group">
            <div className="p-3 bg-gradient-to-br from-white/10 to-white/5 border border-white/10 rounded-2xl shadow-[0_0_15px_rgba(255,255,255,0.05)] backdrop-blur-xl group-hover:shadow-[0_0_25px_rgba(99,102,241,0.4)] transition-all duration-500 group-hover:border-indigo-500/50 group-hover:scale-105">
              <Cpu className="w-6 h-6 text-indigo-400 group-hover:text-indigo-300 transition-colors drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-neutral-200 to-neutral-400 tracking-tight drop-shadow-sm group-hover:to-indigo-300 transition-all duration-500 font-display">Prompt Architect</h1>
              <p className="text-sm text-neutral-500 font-medium tracking-wide group-hover:text-neutral-400 transition-colors">Local ComfyUI Optimization Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className={cn(
                "p-3 rounded-xl transition-all border backdrop-blur-xl shadow-lg hover:scale-105 active:scale-95",
                showHistory 
                  ? "bg-white/10 border-white/20 text-white shadow-indigo-500/20" 
                  : "bg-white/5 border-white/5 text-neutral-400 hover:text-white hover:bg-white/10 hover:border-white/10"
              )}
              title="Prompt History"
            >
              <History className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className={cn(
                "p-3 rounded-xl transition-all border backdrop-blur-xl shadow-lg hover:scale-105 active:scale-95",
                showSettings 
                  ? "bg-white/10 border-white/20 text-white shadow-indigo-500/20" 
                  : "bg-white/5 border-white/5 text-neutral-400 hover:text-white hover:bg-white/10 hover:border-white/10"
              )}
              title="Settings"
            >
              <Settings2 className="w-5 h-5" />
            </button>
            <div className={cn(
              "flex items-center gap-2 text-xs font-mono px-4 py-2.5 rounded-full border backdrop-blur-xl transition-all shadow-lg",
              installedModels.length > 0 
                ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20 shadow-emerald-500/10" 
                : "text-red-300 bg-red-500/10 border-red-500/20 shadow-red-500/10"
            )}>
              <div className={cn(
                "w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]",
                installedModels.length > 0 ? "bg-emerald-400 animate-pulse" : "bg-red-400"
              )} />
              {isDemoMode ? "DEMO MODE" : (installedModels.length > 0 ? "OLLAMA ONLINE" : "DISCONNECTED")}
            </div>
          </div>
        </header>

        {/* Settings Panel */}
        {showSettings && (
          <div className="bg-neutral-900/60 backdrop-blur-2xl border-t border-l border-white/10 border-b border-r border-black/50 rounded-2xl p-6 animate-in slide-in-from-top-2 shadow-2xl bg-gradient-to-br from-white/10 to-transparent">
            <div className="flex flex-col gap-6">
              <div className="flex items-end gap-4">
                <div className="flex-1 space-y-2">
                  <label className="text-xs uppercase tracking-wider text-neutral-400 font-semibold pl-1 text-shadow-sm">Ollama API URL</label>
                  <input 
                    type="text" 
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    disabled={isDemoMode}
                    className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/50 outline-none disabled:opacity-50 transition-all text-white placeholder:text-neutral-600 shadow-inner"
                    placeholder="http://127.0.0.1:11434 or /ollama"
                  />
                </div>
                <button 
                  onClick={() => checkInstalledModels(ollamaUrl)}
                  disabled={isDemoMode}
                  className="bg-white/90 text-black px-6 py-3 rounded-xl text-sm font-semibold hover:bg-white transition-all flex items-center gap-2 disabled:opacity-50 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.2)]"
                >
                  <Save className="w-4 h-4" />
                  Test Connection
                </button>
              </div>
              
              <div className="flex items-center justify-between border-t border-white/5 pt-4">
                <div className="text-xs text-neutral-400">
                  <p>Enable Demo Mode to test UI without a local Ollama instance.</p>
                </div>
                <button
                  onClick={toggleDemoMode}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border shadow-lg",
                    isDemoMode 
                      ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/30 shadow-indigo-500/10" 
                      : "bg-white/5 text-neutral-400 border-white/5 hover:bg-white/10 hover:text-white hover:border-white/10"
                  )}
                >
                  <TestTube2 className="w-4 h-4" />
                  {isDemoMode ? "Disable Demo Mode" : "Enable Demo Mode"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {error && !isDemoMode && (
          <div className="bg-red-500/10 backdrop-blur-xl border border-red-500/20 text-red-300 p-4 rounded-xl flex items-center justify-between gap-3 shadow-lg shadow-red-500/5 bg-gradient-to-r from-red-900/20 to-transparent">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
            <button 
              onClick={toggleDemoMode}
              className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-200 px-4 py-2 rounded-lg transition-colors whitespace-nowrap font-medium border border-red-500/10"
            >
              Switch to Demo Mode
            </button>
          </div>
        )}

        <main className="grid lg:grid-cols-12 gap-8 relative">
          
          {/* Left Column: Controls & Input */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Model Selection */}
            <section className="bg-neutral-900/40 backdrop-blur-2xl border-t border-l border-white/10 border-b border-r border-black/50 rounded-3xl p-6 space-y-5 shadow-2xl bg-gradient-to-br from-white/5 to-transparent relative overflow-hidden group hover:shadow-[0_0_30px_rgba(99,102,241,0.1)] transition-all duration-500 hover:border-white/20">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
              
              <div className="flex items-center gap-2 text-sm font-medium text-white/90 relative z-10">
                <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 group-hover:border-indigo-500/40 transition-colors">
                  <Cpu className="w-4 h-4 text-indigo-400 group-hover:text-indigo-300 drop-shadow-[0_0_5px_rgba(99,102,241,0.5)] transition-all" />
                </div>
                <h3 className="text-shadow-sm group-hover:text-white transition-colors">Model Configuration</h3>
              </div>
              
              <div className="space-y-3 relative z-30">
                <label className="text-xs uppercase tracking-wider text-neutral-500 font-semibold pl-1">Target Model</label>
                
                {/* Custom Select Dropdown */}
                <div className="relative z-50">
                  <button
                    onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                    className={cn(
                      "w-full bg-black/40 border rounded-xl px-4 py-3.5 text-sm text-left flex items-center justify-between focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all text-white shadow-inner backdrop-blur-md group/dropdown",
                      isModelDropdownOpen 
                        ? "border-indigo-500/50 bg-black/60 shadow-[0_0_15px_rgba(99,102,241,0.15)]" 
                        : "border-white/10 hover:bg-white/5 hover:border-white/20"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-1.5 rounded-lg transition-colors",
                        isModelDropdownOpen ? "bg-indigo-500/20 text-indigo-300" : "bg-white/5 text-neutral-400 group-hover/dropdown:text-white"
                      )}>
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col items-start gap-0.5">
                        <span className="font-medium tracking-wide text-neutral-200 group-hover/dropdown:text-white transition-colors">
                          {selectedModel}
                        </span>
                        {MODEL_DETAILS[selectedModel] && (
                           <span className="text-[10px] text-neutral-500 font-mono flex items-center gap-1.5">
                             <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 animate-pulse" />
                             {MODEL_DETAILS[selectedModel].params}
                           </span>
                        )}
                      </div>
                    </div>
                    <ChevronDown className={cn("w-4 h-4 text-neutral-500 transition-transform duration-300", isModelDropdownOpen && "rotate-180 text-indigo-400")} />
                  </button>

                  {isModelDropdownOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-40"
                        onClick={() => setIsModelDropdownOpen(false)}
                      />
                      <div className="absolute top-full left-0 right-0 mt-2 bg-[#0a0a0a]/95 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 ring-1 ring-white/5 origin-top">
                        <div className="p-2 space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar">
                          {TARGET_MODELS.map(model => (
                            <button
                              key={model}
                              onClick={() => {
                                setSelectedModel(model);
                                setIsModelDropdownOpen(false);
                              }}
                              className={cn(
                                "w-full text-left px-3 py-3 rounded-lg transition-all flex items-start gap-3 group/item relative overflow-hidden",
                                selectedModel === model 
                                  ? "bg-indigo-500/10 border border-indigo-500/20" 
                                  : "hover:bg-white/5 border border-transparent hover:border-white/5"
                              )}
                            >
                              {selectedModel === model && (
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 rounded-l-lg shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                              )}
                              
                              <div className="flex-1 pl-1">
                                <div className="flex items-center justify-between mb-1">
                                  <span className={cn(
                                    "text-sm font-medium transition-colors", 
                                    selectedModel === model ? "text-indigo-300" : "text-neutral-300 group-hover/item:text-white"
                                  )}>
                                    {model}
                                  </span>
                                  {MODEL_DETAILS[model] && (
                                    <span className={cn(
                                      "text-[10px] px-1.5 py-0.5 rounded border transition-colors font-mono",
                                      selectedModel === model
                                        ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                                        : "bg-black/40 text-neutral-500 border-white/5 group-hover/item:border-white/10"
                                    )}>
                                      {MODEL_DETAILS[model].vram}
                                    </span>
                                  )}
                                </div>
                                
                                {MODEL_DETAILS[model] && (
                                  <div className="flex items-center justify-between gap-4">
                                    <p className="text-[10px] text-neutral-500 group-hover/item:text-neutral-400 transition-colors line-clamp-1">
                                      {MODEL_DETAILS[model].description}
                                    </p>
                                    <span className="text-[10px] text-neutral-600 font-mono whitespace-nowrap">
                                      {MODEL_DETAILS[model].params}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                        <div className="px-3 py-2 bg-black/40 border-t border-white/5 text-[10px] text-neutral-500 text-center font-mono">
                          Select a model optimized for your hardware
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {!isModelInstalled(selectedModel) && (
                  <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 space-y-3 backdrop-blur-sm relative overflow-hidden">
                    <div className="absolute inset-0 bg-indigo-500/5 animate-pulse pointer-events-none" />
                    <div className="flex items-center justify-between relative z-10">
                      <span className="text-sm text-indigo-300 font-medium">Model not found locally</span>
                      {!isDownloading && (
                        <button 
                          onClick={handleDownload}
                          className="flex items-center gap-2 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-all font-medium shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40"
                        >
                          <Download className="w-3 h-3" />
                          Download
                        </button>
                      )}
                    </div>
                    
                    {isDownloading && (
                      <div className="space-y-3 relative z-10">
                        <div className="flex justify-between items-end text-xs text-indigo-300/70">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium text-indigo-300">{downloadStatus}</span>
                            {downloadDetails && (
                              <div className="flex items-center gap-2 font-mono text-[10px] opacity-80">
                                <span>{formatBytes(downloadDetails.completed)} / {formatBytes(downloadDetails.total)}</span>
                                {downloadSpeed && (
                                  <>
                                    <span className="w-1 h-1 rounded-full bg-indigo-500/50" />
                                    <span>{downloadSpeed}</span>
                                  </>
                                )}
                                {downloadEta && (
                                  <>
                                    <span className="w-1 h-1 rounded-full bg-indigo-500/50" />
                                    <span>ETA: {downloadEta}</span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          <span className="text-lg font-bold text-indigo-400">{downloadProgress}%</span>
                        </div>
                        <div className="h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
                          <div 
                            className="h-full bg-indigo-500 transition-all duration-300 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                            style={{ width: `${downloadProgress}%` }}
                          />
                        </div>
                        <button 
                          onClick={cancelDownload}
                          className="w-full flex items-center justify-center gap-2 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 py-2 rounded-lg transition-colors border border-red-500/10 hover:border-red-500/30"
                        >
                          <X className="w-3 h-3" />
                          Cancel Download
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-2 relative z-10">
                <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold pl-1 flex items-center gap-1.5">
                  <LayoutTemplate className="w-3 h-3" />
                  Output Format
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {Object.values(FORMATS).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => setSelectedFormat(fmt)}
                      className={cn(
                        "px-3 py-3 rounded-xl text-xs font-medium border transition-all duration-500 relative overflow-hidden group/fmt",
                        selectedFormat === fmt 
                          ? "bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.1)] scale-[1.02]" 
                          : "bg-black/40 text-neutral-400 border-white/5 hover:border-white/20 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      {selectedFormat === fmt && <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />}
                      <span className="relative z-10 flex items-center justify-center gap-2">
                        {fmt === 'JSON' ? <Code className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                        {fmt}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* System Prompt Editor Toggle */}
              <div className="pt-2 relative z-10">
                <button
                  onClick={() => setShowSystemPrompt(!showSystemPrompt)}
                  className="flex items-center gap-2 text-xs text-neutral-500 hover:text-white transition-colors pl-1 group"
                >
                  {showSystemPrompt ? <Eye className="w-3 h-3 group-hover:text-indigo-400 transition-colors" /> : <Edit3 className="w-3 h-3 group-hover:text-indigo-400 transition-colors" />}
                  {showSystemPrompt ? 'Hide System Prompt' : 'Edit System Prompt'}
                </button>
                
                {showSystemPrompt && (
                  <div className="mt-3 animate-in slide-in-from-top-2 fade-in bg-black/20 rounded-xl p-3 border border-white/5">
                     <div className="flex items-center justify-between mb-3 pl-1">
                        <label className="text-[10px] uppercase tracking-wider text-indigo-400 font-semibold flex items-center gap-1.5">
                          <Code className="w-3 h-3" />
                          System Instructions
                        </label>
                        <button 
                          onClick={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPTS[selectedFormat as keyof typeof DEFAULT_SYSTEM_PROMPTS])}
                          className="text-[10px] flex items-center gap-1 text-neutral-500 hover:text-indigo-300 transition-colors bg-white/5 hover:bg-white/10 px-2 py-1 rounded-md border border-white/5"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Reset
                        </button>
                     </div>
                     <textarea
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        className="w-full h-32 bg-black/40 border border-white/10 rounded-lg p-3 text-xs font-mono text-neutral-300 focus:ring-1 focus:ring-indigo-500/50 outline-none resize-y placeholder:text-neutral-700 shadow-inner custom-scrollbar"
                      />
                      <button
                        onClick={() => setShowSystemPrompt(false)}
                        className="w-full mt-3 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 hover:border-indigo-500/30 text-indigo-300 hover:text-white py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/5"
                      >
                        <Check className="w-3 h-3" />
                        Save & Close
                      </button>
                  </div>
                )}
              </div>
            </section>

            {/* Input Area */}
            <section className="bg-neutral-900/40 backdrop-blur-2xl border-t border-l border-white/10 border-b border-r border-black/50 rounded-3xl p-6 space-y-5 shadow-2xl flex flex-col bg-gradient-to-br from-white/5 to-transparent group relative overflow-hidden hover:shadow-[0_0_30px_rgba(245,158,11,0.05)] transition-all duration-500 hover:border-white/20">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
              
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-2 text-sm font-medium text-white/90">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 group-hover:border-amber-500/40 transition-colors">
                    <Zap className="w-4 h-4 text-amber-400 group-hover:text-amber-300 drop-shadow-[0_0_5px_rgba(245,158,11,0.5)] transition-all" />
                  </div>
                  <h3 className="text-shadow-sm group-hover:text-white transition-colors font-display tracking-wide">Concept Input</h3>
                </div>
                <button 
                  onClick={() => setUserInput('')}
                  className="text-[10px] text-neutral-500 hover:text-red-400 transition-colors flex items-center gap-1 px-2 py-1 rounded-md hover:bg-red-500/10 border border-transparent hover:border-red-500/20"
                  title="Clear Input"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear
                </button>
              </div>
              
              <div className="relative flex-1 group/input z-10">
                <textarea
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder="Describe your image concept in detail..."
                  className="w-full h-48 bg-black/40 border border-white/10 rounded-2xl p-5 text-sm font-mono text-neutral-200 focus:ring-2 focus:ring-amber-500/50 outline-none resize-none placeholder:text-neutral-600 shadow-inner transition-all group-hover/input:border-white/20 group-hover/input:bg-black/50 custom-scrollbar"
                />
                <div className="absolute bottom-4 right-4 text-[10px] text-neutral-600 font-mono bg-black/60 px-2 py-1 rounded border border-white/5 backdrop-blur-sm pointer-events-none">
                  {userInput.length} chars
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={isGenerating || !userInput.trim() || (!isModelInstalled(selectedModel) && !isDownloading)}
                className={cn(
                  "w-full py-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-500 relative overflow-hidden group/btn z-20",
                  isGenerating 
                    ? "bg-neutral-800/50 text-neutral-500 cursor-not-allowed border border-white/5"
                    : "bg-white text-black hover:scale-[1.02] shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_40px_rgba(255,255,255,0.3)] border border-white/50"
                )}
              >
                {!isGenerating && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-full group-hover/btn:animate-[shimmer_1.5s_infinite] pointer-events-none" />}
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {generationStatus === 'loading_model' ? 'Loading Model into VRAM...' : 'Architecting Prompt...'}
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-current" />
                    Generate Production Prompt
                  </>
                )}
              </button>
              
              <p className="text-[10px] text-neutral-500 text-center relative z-10">
                * Auto-unloads model from VRAM after generation (keep_alive: 0)
              </p>
            </section>
          </div>

          {/* Right Column: Output */}
          <div className="lg:col-span-7">
            <section className="bg-neutral-900/60 backdrop-blur-3xl border-t border-l border-white/10 border-b border-r border-black/50 rounded-3xl p-6 h-full min-h-[600px] flex flex-col relative overflow-hidden shadow-2xl bg-gradient-to-br from-white/5 to-transparent group hover:shadow-[0_0_30px_rgba(16,185,129,0.05)] transition-all duration-500 hover:border-white/20">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
              
              <div className="flex items-center justify-between mb-6 relative z-10">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-white/90">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 group-hover:border-emerald-500/40 transition-colors">
                      <FileText className="w-4 h-4 text-emerald-400 group-hover:text-emerald-300 drop-shadow-[0_0_5px_rgba(16,185,129,0.5)] transition-all" />
                    </div>
                    <h3 className="text-shadow-sm group-hover:text-white transition-colors font-display tracking-wide">Architected Output</h3>
                  </div>
                  
                  {/* Output Controls */}
                  <div className="flex items-center bg-black/40 rounded-lg p-1 border border-white/5 backdrop-blur-md shadow-inner group-hover:border-white/10 transition-colors">
                    <button
                      onClick={() => setOutputMode('markdown')}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-[10px] font-medium transition-all flex items-center gap-1.5",
                        outputMode === 'markdown' ? "bg-neutral-700/50 text-white shadow-sm border border-white/10" : "text-neutral-500 hover:text-neutral-300 hover:bg-white/5"
                      )}
                    >
                      <FileText className="w-3 h-3" />
                      Markdown
                    </button>
                    <button
                      onClick={() => setOutputMode('raw')}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-[10px] font-medium transition-all flex items-center gap-1.5",
                        outputMode === 'raw' ? "bg-neutral-700/50 text-white shadow-sm border border-white/10" : "text-neutral-500 hover:text-neutral-300 hover:bg-white/5"
                      )}
                    >
                      <Code className="w-3 h-3" />
                      Raw Text
                    </button>
                  </div>

                  {outputMode === 'markdown' && (
                     <button
                      onClick={() => setJsonCodeBlock(!jsonCodeBlock)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors border backdrop-blur-sm",
                        jsonCodeBlock 
                          ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20 hover:bg-indigo-500/20 shadow-[0_0_10px_rgba(99,102,241,0.1)]" 
                          : "bg-black/20 text-neutral-500 border-white/5 hover:text-neutral-300 hover:bg-white/5"
                      )}
                    >
                      {jsonCodeBlock ? 'JSON Formatted' : 'JSON Raw'}
                    </button>
                  )}
                </div>

                <button
                  onClick={copyToClipboard}
                  disabled={!generatedOutput}
                  className={cn(
                    "flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg transition-all font-medium border shadow-lg backdrop-blur-md",
                    generatedOutput 
                      ? "bg-white/5 hover:bg-white/10 border-white/10 text-neutral-300 hover:text-white hover:border-white/20 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)]" 
                      : "bg-transparent border-transparent text-neutral-700 cursor-not-allowed"
                  )}
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy Output'}
                </button>
              </div>

              <div className="flex-1 bg-black/20 rounded-2xl border border-white/5 p-6 overflow-y-auto font-mono text-sm leading-relaxed text-neutral-300 shadow-inner custom-scrollbar relative z-10 group/output">
                {generatedOutput ? (
                  outputMode === 'markdown' ? (
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown 
                        components={{
                          h1: ({node, ...props}) => <h1 className="text-xl font-light text-white mb-4 pb-2 border-b border-white/10 tracking-tight" {...props} />,
                          h2: ({node, ...props}) => <h2 className="text-emerald-400 font-bold mt-8 mb-4 uppercase text-[10px] tracking-[0.2em] border-b border-emerald-500/20 pb-2 flex items-center gap-2" {...props} />,
                          h3: ({node, ...props}) => <h3 className="text-white font-medium mt-6 mb-3 text-sm tracking-wide" {...props} />,
                          p: ({node, ...props}) => <p className="mb-4 text-neutral-300/90 leading-7 font-light" {...props} />,
                          ul: ({node, ...props}) => <ul className="list-disc list-outside mb-4 text-neutral-400 space-y-2 pl-4" {...props} />,
                          li: ({node, ...props}) => <li className="pl-1 marker:text-emerald-500/50" {...props} />,
                          strong: ({node, ...props}) => <strong className="text-white font-semibold" {...props} />,
                          code: ({node, className, children, ...props}) => {
                            const match = /language-(\w+)/.exec(className || '')
                            return !match ? (
                              <code className="bg-white/5 px-1.5 py-0.5 rounded text-emerald-300 border border-white/5 text-xs font-mono" {...props}>
                                {children}
                              </code>
                            ) : (
                              <SyntaxHighlighter
                                style={vscDarkPlus}
                                language={match[1]}
                                PreTag="div"
                                className="rounded-xl !bg-black/60 !p-4 !m-0 text-sm border border-white/10 shadow-xl"
                                {...props}
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            )
                          },
                          pre: ({node, children, ...props}) => (
                            <div className="relative group/code my-6">
                              <div className="absolute -inset-2 bg-gradient-to-r from-emerald-500/10 to-blue-500/10 rounded-xl blur opacity-0 group-hover/code:opacity-100 transition-opacity duration-500" />
                              <div className="relative">
                                {children}
                              </div>
                            </div>
                          ),
                          hr: ({node, ...props}) => <hr className="my-8 border-white/10" {...props} />,
                          blockquote: ({node, ...props}) => <blockquote className="border-l-2 border-emerald-500/50 pl-4 italic text-neutral-400 my-4 bg-emerald-500/5 py-2 pr-2 rounded-r-lg" {...props} />,
                        }}
                      >
                        {generatedOutput}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="relative group/raw">
                      <div className="absolute -inset-4 bg-gradient-to-br from-white/5 to-transparent rounded-3xl opacity-0 group-hover/raw:opacity-100 transition-opacity duration-500 pointer-events-none" />
                      <pre className="whitespace-pre-wrap font-mono text-xs text-neutral-300 leading-relaxed p-4 rounded-xl border border-white/5 bg-black/40 shadow-inner">
                        {generatedOutput}
                      </pre>
                    </div>
                  )
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-neutral-700 gap-6">
                    <div className="w-24 h-24 rounded-3xl bg-white/5 border border-white/5 flex items-center justify-center shadow-2xl backdrop-blur-sm group-hover:scale-110 transition-transform duration-500">
                      <FileText className="w-10 h-10 opacity-20 text-white group-hover:text-emerald-400/50 transition-colors duration-500" />
                    </div>
                    <div className="text-center space-y-2">
                      <p className="text-xs uppercase tracking-widest font-medium text-neutral-600 group-hover:text-neutral-500 transition-colors">Ready to generate</p>
                      <p className="text-[10px] text-neutral-700 max-w-[200px] mx-auto">
                        Your optimized prompt will appear here in structured Markdown format.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* History Sidebar */}
          <div className={cn(
            "fixed inset-y-0 right-0 w-96 bg-[#0a0a0a]/95 backdrop-blur-2xl border-l border-white/10 transform transition-transform duration-300 ease-in-out z-50 shadow-2xl",
            showHistory ? "translate-x-0" : "translate-x-full"
          )}>
            <div className="flex flex-col h-full">
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5 backdrop-blur-md">
                <div className="flex items-center gap-2 text-white">
                  <History className="w-5 h-5 text-indigo-400" />
                  <h2 className="font-bold text-lg text-shadow-sm">Prompt History</h2>
                </div>
                <div className="flex items-center gap-2">
                  {history.length > 0 && (
                    <button 
                      onClick={clearHistory}
                      className="p-2 hover:bg-red-500/10 text-neutral-500 hover:text-red-400 rounded-lg transition-colors"
                      title="Clear History"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button 
                    onClick={() => setShowHistory(false)}
                    className="p-2 hover:bg-white/10 text-neutral-400 hover:text-white rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-neutral-500 gap-3">
                    <History className="w-8 h-8 opacity-20" />
                    <p className="text-sm">No history yet</p>
                  </div>
                ) : (
                  history.map((item) => (
                    <div 
                      key={item.id}
                      onClick={() => loadHistoryItem(item)}
                      className="group bg-white/5 border border-white/5 hover:border-indigo-500/30 hover:bg-indigo-500/5 rounded-xl p-4 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-mono text-neutral-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(item.timestamp).toLocaleString()}
                        </span>
                        <button
                          onClick={(e) => deleteHistoryItem(item.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 text-neutral-500 hover:text-red-400 rounded transition-all"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-xs text-neutral-300 line-clamp-2 font-medium mb-2">{item.userInput}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/20 text-neutral-400 border border-white/5">
                          {item.model.split(':')[0]}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/20 text-neutral-400 border border-white/5">
                          {item.format === FORMATS.KLEIN ? 'KLEIN' : 'Z-IMAGE'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Overlay for mobile/sidebar */}
          {showHistory && (
            <div 
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setShowHistory(false)}
            />
          )}

        </main>
      </div>
    </div>
  );
}
