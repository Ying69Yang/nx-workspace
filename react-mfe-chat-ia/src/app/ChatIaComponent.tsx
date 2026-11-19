import React, { useState, useRef, useEffect } from 'react';

type ExecutionMode = 'browser' | 'cloud';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  mode: ExecutionMode;
  modelName: string;
}

interface ModelOption {
  id: string;
  name: string;
  description: string;
  size?: string;
  badge?: string;
}

const BROWSER_MODELS: ModelOption[] = [
  {
    id: 'qwen-0.5b',
    name: 'Qwen 2.5 (0.5B)',
    description: 'Ultraligero, rápido y excelente soporte en español.',
    size: '~350 MB',
    badge: 'Recomendado',
  },
  {
    id: 'llama-1b',
    name: 'Llama 3.2 (1B)',
    description: 'Modelo de Meta optimizado para conversación fluida.',
    size: '~800 MB',
  },
  {
    id: 'smollm-360m',
    name: 'SmolLM2 (360M)',
    description: 'Extremadamente pequeño, ideal para pruebas inmediatas.',
    size: '~200 MB',
  },
];

const CLOUD_MODELS: ModelOption[] = [
  {
    id: 'gemini-flash',
    name: 'Google Gemini 2.0 Flash',
    description: 'Multimodal, alta velocidad y tier gratuito generoso.',
    badge: 'Google AI Studio',
  },
  {
    id: 'deepseek-r1',
    name: 'DeepSeek R1',
    description: 'Modelo puntero de razonamiento paso a paso (Chain-of-Thought).',
    badge: 'OpenRouter / Groq',
  },
  {
    id: 'groq-llama',
    name: 'Llama 3.3 70B (Groq)',
    description: 'Inferencia ultrarrápida (~300 tokens/s) vía Groq Cloud.',
    badge: 'Groq Cloud',
  },
];

const SUGGESTIONS = [
  '¿Cuál es la diferencia entre ejecutar una IA en el navegador y en la nube?',
  'Explícame cómo funciona WebGPU y WebAssembly',
  'Dame una idea de arquitectura para microfrontends con Native Federation',
  '¿Qué ventajas tiene el modelo DeepSeek R1 frente a otros?',
];

export const ChatIaComponent: React.FC = () => {
  const [mode, setMode] = useState<ExecutionMode>('browser');
  const [browserModel, setBrowserModel] = useState<string>('qwen-0.5b');
  const [cloudModel, setCloudModel] = useState<string>('gemini-flash');
  const [cloudApiKey, setCloudApiKey] = useState<string>(() => {
    return localStorage.getItem('chat_ia_cloud_api_key') || '';
  });
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Estado del modelo en navegador (WebLLM UI)
  const [modelLoading, setModelLoading] = useState<boolean>(false);
  const [modelProgress, setModelProgress] = useState<number>(0);
  const [modelReady, setModelReady] = useState<boolean>(false);

  // Chat
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        '¡Hola! Soy tu asistente de IA. Puedes elegir si quieres que razone **localmente en tu navegador** con WebGPU/Wasm (100% privado y sin enviar datos) o conectarme a **modelos en la nube** (Gemini, DeepSeek, Llama). ¿En qué te puedo ayudar hoy?',
      timestamp: 'Ahora',
      mode: 'browser',
      modelName: 'Qwen 2.5 (0.5B)',
    },
  ]);
  const [input, setInput] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSaveApiKey = (key: string) => {
    setCloudApiKey(key);
    localStorage.setItem('chat_ia_cloud_api_key', key);
  };

  // Simulación de carga de modelo en navegador
  const handleLoadBrowserModel = () => {
    setModelLoading(true);
    setModelProgress(0);
    const interval = setInterval(() => {
      setModelProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setModelLoading(false);
          setModelReady(true);
          return 100;
        }
        return prev + 25;
      });
    }, 400);
  };

  // Simulación de envío de mensaje (mock temporal hasta integrar SDKs reales)
  const handleSendMessage = (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isTyping) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mode,
      modelName:
        mode === 'browser'
          ? BROWSER_MODELS.find((m) => m.id === browserModel)?.name || 'WebLLM'
          : CLOUD_MODELS.find((m) => m.id === cloudModel)?.name || 'Cloud AI',
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    // Mock response
    setTimeout(() => {
      let botResponse = '';
      const currentModelName =
        mode === 'browser'
          ? BROWSER_MODELS.find((m) => m.id === browserModel)?.name
          : CLOUD_MODELS.find((m) => m.id === cloudModel)?.name;

      if (mode === 'browser') {
        botResponse = `⚡ **[Respuesta simulada local]**\nHe procesado tu consulta utilizando **${currentModelName}** en local a través del navegador con WebGPU.\n\nPronto integraremos la conexión real con \`@mlc-ai/web-llm\` para que esta respuesta sea generada por los pesos del modelo en tu memoria local.`;
      } else {
        botResponse = `☁️ **[Respuesta simulada en la nube]**\nConsulta recibida para **${currentModelName}**.\n\nPronto integraremos la llamada con streaming a la API seleccionada ${
          cloudApiKey ? 'usando tu API Key guardada' : '(recuerda configurar tu API Key gratuita en los ajustes)'
        }.`;
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: botResponse,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mode,
        modelName: currentModelName || 'AI',
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 1000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const currentBrowserModelObj = BROWSER_MODELS.find((m) => m.id === browserModel);
  const currentCloudModelObj = CLOUD_MODELS.find((m) => m.id === cloudModel);

  return (
    <div className="flex flex-col bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden min-h-[640px] max-h-[820px]">
      {/* 1. Header con Selector de Modo (Navegador vs Nube) */}
      <div className="p-4 bg-gray-50/80 border-b border-gray-200 backdrop-blur-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Tabs Selector */}
          <div className="inline-flex p-1 bg-gray-200/70 rounded-xl">
            <button
              onClick={() => setMode('browser')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                mode === 'browser'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="text-base">🌐</span>
              <span>En el Navegador (WebLLM)</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                Local
              </span>
            </button>

            <button
              onClick={() => setMode('cloud')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                mode === 'cloud'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="text-base">☁️</span>
              <span>En la Nube (API)</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                Cloud
              </span>
            </button>
          </div>

          {/* Selector de modelos y ajustes según modo activo */}
          <div className="flex items-center gap-3">
            {mode === 'browser' ? (
              <div className="flex items-center gap-2">
                <select
                  value={browserModel}
                  onChange={(e) => {
                    setBrowserModel(e.target.value);
                    setModelReady(false);
                  }}
                  className="bg-white border border-gray-300 text-gray-800 text-xs font-medium rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {BROWSER_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.size})
                    </option>
                  ))}
                </select>

                {!modelReady ? (
                  <button
                    onClick={handleLoadBrowserModel}
                    disabled={modelLoading}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-xs font-semibold rounded-lg transition shadow-sm flex items-center gap-1.5"
                  >
                    {modelLoading ? (
                      <>
                        <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                        <span>{modelProgress}%</span>
                      </>
                    ) : (
                      <>
                        <span>📥</span>
                        <span>Cargar en GPU</span>
                      </>
                    )}
                  </button>
                ) : (
                  <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold rounded-lg flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    En memoria
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  value={cloudModel}
                  onChange={(e) => setCloudModel(e.target.value)}
                  className="bg-white border border-gray-300 text-gray-800 text-xs font-medium rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {CLOUD_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`p-2 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 ${
                    cloudApiKey
                      ? 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                      : 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                  }`}
                  title="Configurar API Key"
                >
                  <span>⚙️</span>
                  <span>{cloudApiKey ? 'Key configurada' : 'Añadir API Key'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Banner informativo del modo */}
        <div className="mt-3 text-xs flex items-center justify-between text-gray-500 bg-white/60 px-3 py-1.5 rounded-lg border border-gray-200/60">
          {mode === 'browser' ? (
            <div className="flex items-center gap-2">
              <span className="text-emerald-600 font-semibold">🔒 100% Privado</span>
              <span>•</span>
              <span>Inferencia en cliente con WebGPU & Wasm</span>
              <span>•</span>
              <span className="text-gray-400">{currentBrowserModelObj?.description}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-blue-600 font-semibold">⚡ Máxima Potencia</span>
              <span>•</span>
              <span>Servidores cloud sin consumo de tu hardware</span>
              <span>•</span>
              <span className="text-gray-400">{currentCloudModelObj?.description}</span>
            </div>
          )}
        </div>

        {/* Modal / Panel desplegable para configurar API Key */}
        {showSettings && mode === 'cloud' && (
          <div className="mt-3 p-4 bg-white border border-indigo-100 rounded-xl shadow-sm text-xs space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-gray-900 text-sm">Configuración de API Key (BYOK)</h4>
              <button
                onClick={() => setShowSettings(false)}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                ✕
              </button>
            </div>
            <p className="text-gray-600">
              Tu API key se guarda exclusivamente en el <code className="bg-gray-100 px-1 py-0.5 rounded">localStorage</code> de tu navegador y nunca viaja a servidores intermedios.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="Pega aquí tu API Key (Google AI Studio, Groq u OpenRouter)..."
                value={cloudApiKey}
                onChange={(e) => handleSaveApiKey(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
              />
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition"
              >
                Guardar
              </button>
            </div>
            <div className="text-[11px] text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
              <span>🔑 <strong>Gemini:</strong> Obtén gratis en <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="text-indigo-600 underline">aistudio.google.com</a></span>
              <span>⚡ <strong>Groq:</strong> Obtén gratis en <a href="https://console.groq.com/" target="_blank" rel="noreferrer" className="text-indigo-600 underline">console.groq.com</a></span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Área de Mensajes */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-gradient-to-b from-gray-50/30 to-white">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-3xl ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm shadow-sm ${
                  isUser
                    ? 'bg-indigo-600 text-white font-bold'
                    : msg.mode === 'browser'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-blue-600 text-white'
                }`}
              >
                {isUser ? 'Tú' : msg.mode === 'browser' ? '🌐' : '☁️'}
              </div>

              {/* Burbuja */}
              <div className="flex flex-col gap-1">
                <div className={`flex items-center gap-2 text-[11px] text-gray-400 ${isUser ? 'justify-end' : ''}`}>
                  {!isUser && (
                    <span className="font-semibold text-gray-700">
                      {msg.modelName}
                    </span>
                  )}
                  <span>{msg.timestamp}</span>
                </div>

                <div
                  className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-tr-none'
                      : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div className="flex gap-3 max-w-xl mr-auto items-center">
            <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs animate-pulse">
              💭
            </div>
            <div className="bg-white border border-gray-200 px-4 py-2.5 rounded-2xl rounded-tl-none text-xs text-gray-500 flex items-center gap-2 shadow-sm">
              <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-bounce" />
              <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.2s]" />
              <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:0.4s]" />
              <span className="ml-1 text-gray-400 font-medium">Generando respuesta...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Sugerencias Rápidas (Chips) */}
      {messages.length <= 2 && (
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center gap-2 overflow-x-auto text-xs no-scrollbar">
          <span className="text-gray-400 font-medium whitespace-nowrap">💡 Sugerencias:</span>
          {SUGGESTIONS.map((s, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(s)}
              className="bg-white hover:bg-gray-100 text-gray-600 border border-gray-200 px-3 py-1 rounded-full whitespace-nowrap transition shadow-2xs"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* 3. Input de Texto y Controles */}
      <div className="p-4 bg-white border-t border-gray-200">
        <div className="flex items-end gap-2 bg-gray-50 border border-gray-300 rounded-xl p-2 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent transition">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === 'browser'
                ? 'Escribe tu mensaje (se procesará en tu navegador con WebGPU)...'
                : 'Escribe tu mensaje (se enviará a la API en la nube)...'
            }
            rows={1}
            className="flex-1 bg-transparent border-0 focus:outline-none resize-none text-sm text-gray-900 max-h-32 px-2 py-1 placeholder-gray-400"
          />

          <button
            onClick={() => handleSendMessage()}
            disabled={!input.trim() || isTyping}
            className="p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white rounded-lg transition shadow-sm shrink-0 flex items-center justify-center"
            title="Enviar mensaje (Enter)"
          >
            <svg
              className="w-4 h-4 transform rotate-90"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400 px-1">
          <span>Presiona <kbd className="bg-gray-100 border border-gray-300 rounded px-1 py-0.5 font-mono text-[10px]">Enter ↵</kbd> para enviar, <kbd className="bg-gray-100 border border-gray-300 rounded px-1 py-0.5 font-mono text-[10px]">Shift+Enter</kbd> para salto de línea</span>
          {messages.length > 1 && (
            <button
              onClick={() =>
                setMessages([
                  {
                    id: 'welcome',
                    role: 'assistant',
                    content: 'Conversación reiniciada. ¿En qué te puedo ayudar?',
                    timestamp: 'Ahora',
                    mode,
                    modelName:
                      mode === 'browser'
                        ? BROWSER_MODELS.find((m) => m.id === browserModel)?.name || 'WebLLM'
                        : CLOUD_MODELS.find((m) => m.id === cloudModel)?.name || 'Cloud AI',
                  },
                ])
              }
              className="hover:text-red-500 transition"
            >
              Limpiar chat
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatIaComponent;
