import React, { useState, useRef, useEffect } from 'react';
import type { AutomaticSpeechRecognitionPipeline, ProgressInfo } from '@huggingface/transformers';

type SttEngine = 'webspeech' | 'whisper';

interface WhisperModel {
  id: string;
  name: string;
  description: string;
  size: string;
  recommended: 'mobile' | 'desktop';
}

const WHISPER_MODELS: WhisperModel[] = [
  {
    id: 'onnx-community/whisper-base',
    name: 'Whisper Base',
    description: 'Ligero y rápido, ideal para smartphones y equipos con poca RAM.',
    size: '~74 MB',
    recommended: 'mobile',
  },
  {
    id: 'onnx-community/whisper-large-v3-turbo',
    name: 'Whisper Large v3 Turbo',
    description: 'Alta precisión con velocidad optimizada, ideal para computadoras.',
    size: '~809 MB',
    recommended: 'desktop',
  },
];

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  modelName: string;
}

interface ModelOption {
  id: string;
  name: string;
  description: string;
  badge?: string;
}

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

// Detectar si el navegador soporta Web Speech API
const hasWebSpeechAPI = (): boolean =>
  typeof window !== 'undefined' &&
  ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

export const ChatIaComponent: React.FC = () => {
  // ─── Modelo cloud ─────────────────────────────────────────────────────────────
  const [cloudModel, setCloudModel] = useState<string>(CLOUD_MODELS[0].id);
  const [cloudApiKey, setCloudApiKey] = useState<string>(() =>
    localStorage.getItem('chat_ia_cloud_api_key') || ''
  );
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // ─── Chat ─────────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        '¡Hola! Soy tu asistente de IA en la nube. Selecciona un modelo, configura tu API Key gratuita y empieza a chatear. También puedes dictarme tus mensajes con el botón 🎙️.',
      timestamp: 'Ahora',
      modelName: CLOUD_MODELS[0].name,
    },
  ]);
  const [input, setInput] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // ─── STT (Speech-to-Text) ────────────────────────────────────────────────────
  // Firefox no tiene Web Speech API → Whisper por defecto y descarga automática
  const [sttEngine, setSttEngine] = useState<SttEngine>(() =>
    hasWebSpeechAPI() ? 'webspeech' : 'whisper'
  );
  const [isListening, setIsListening] = useState<boolean>(false);
  const [whisperLoading, setWhisperLoading] = useState<boolean>(false);
  const [whisperProgress, setWhisperProgress] = useState<number>(0);
  const [whisperStatusText, setWhisperStatusText] = useState<string>('');
  const [whisperModel, setWhisperModel] = useState<string>(WHISPER_MODELS[0].id);
  const [whisperReady, setWhisperReady] = useState<boolean>(false);
  const [whisperError, setWhisperError] = useState<string | null>(null);

  // Tipos mínimos para Web Speech API (no siempre presentes en lib.dom)
  interface SpeechRecognitionStatic {
    new (): SpeechRecognition;
  }

  interface SpeechRecognition {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionError) => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
  }

  interface SpeechRecognitionEvent {
    resultIndex: number;
    results: SpeechRecognitionResultList;
  }

  interface SpeechRecognitionResultList {
    length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
  }

  interface SpeechRecognitionResult {
    length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
    isFinal: boolean;
  }

  interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
  }

  interface SpeechRecognitionError {
    error: string;
    message?: string;
  }

  const whisperPipelineRef = useRef<AutomaticSpeechRecognitionPipeline | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // ─── Carga Whisper via @huggingface/transformers ─────────────────────────────
  const handleLoadWhisper = async () => {
    setWhisperLoading(true);
    setWhisperProgress(0);
    setWhisperStatusText('Iniciando descarga de Whisper...');
    setWhisperError(null);
    const selectedWhisper = WHISPER_MODELS.find((m) => m.id === whisperModel);
    if (!selectedWhisper) {
      setWhisperError('Modelo Whisper no encontrado.');
      setWhisperLoading(false);
      return;
    }
    try {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.allowLocalModels = false;

      const pipe = await pipeline(
        'automatic-speech-recognition',
        selectedWhisper.id as string,
        {
          progress_callback: (p: ProgressInfo) => {
            if (typeof p.progress === 'number') {
              setWhisperProgress(Math.round(p.progress));
              setWhisperStatusText(
                p.file ? `Descargando ${p.file}...` : `Cargando ${selectedWhisper.name}...`
              );
            }
          },
        }
      );
      whisperPipelineRef.current = pipe;
      setWhisperReady(true);
      setWhisperLoading(false);
      setWhisperStatusText(`${selectedWhisper.name} listo`);
    } catch (err) {
      console.error('Error cargando Whisper:', err);
      const message = err instanceof Error ? err.message : 'Error al descargar Whisper. Comprueba la conexión.';
      setWhisperError(message);
      setWhisperLoading(false);
    }
  };

  const loadWhisperRef = useRef(handleLoadWhisper);
  loadWhisperRef.current = handleLoadWhisper;

  // Auto-cargar Whisper en Firefox (no tiene Web Speech API)
  useEffect(() => {
    if (!hasWebSpeechAPI() && !whisperReady && !whisperLoading) {
      loadWhisperRef.current();
    }
  }, [whisperReady, whisperLoading]);

  // Si el usuario cambia de modelo Whisper, resetear el pipeline cargado
  useEffect(() => {
    if (whisperPipelineRef.current) {
      void whisperPipelineRef.current.dispose();
      whisperPipelineRef.current = null;
    }
    setWhisperReady(false);
    setWhisperProgress(0);
    setWhisperError(null);
  }, [whisperModel]);

  // ─── API Key ──────────────────────────────────────────────────────────────────
  const handleSaveApiKey = (key: string) => {
    setCloudApiKey(key);
    localStorage.setItem('chat_ia_cloud_api_key', key);
  };

  // ─── Control del micrófono (unificado Web Speech API + Whisper) ──────────────
  const handleMicToggle = async () => {
    // Detener si ya está escuchando
    if (isListening) {
      if (sttEngine === 'webspeech' && recognitionRef.current) {
        recognitionRef.current.stop();
      } else if (sttEngine === 'whisper' && mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    if (sttEngine === 'webspeech') {
      const SpeechRecognitionCtor =
        typeof window !== 'undefined' &&
        ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
          ? ((window as unknown as {
              SpeechRecognition?: SpeechRecognitionStatic;
              webkitSpeechRecognition?: SpeechRecognitionStatic;
            }).SpeechRecognition ??
              (window as unknown as {
                webkitSpeechRecognition?: SpeechRecognitionStatic;
              }).webkitSpeechRecognition)
          : undefined;
      if (!SpeechRecognitionCtor) {
        setWhisperError('Web Speech API no está disponible en este navegador.');
        setIsListening(false);
        return;
      }
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = 'es-ES';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInput(transcript);
      };
      recognition.onerror = (e: SpeechRecognitionError) => {
        console.error('Web Speech error:', e.error);
        setIsListening(false);
      };
      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    } else {
      // Whisper: primero asegurarse de que esté cargado
      if (!whisperReady) {
        await handleLoadWhisper();
        // El usuario deberá pulsar el micrófono de nuevo una vez cargado
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunksRef.current = [];

        const recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        recorder.onstop = async () => {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const audioUrl = URL.createObjectURL(blob);
          try {
            const pipelineFn = whisperPipelineRef.current;
            if (!pipelineFn) {
              throw new Error('Pipeline de Whisper no está inicializado.');
            }
            const result = await pipelineFn(audioUrl, {
              language: 'spanish',
              task: 'transcribe',
            });
            setInput((prev) =>
              (prev ? prev + ' ' : '') + (result?.text || '').trim()
            );
          } catch (err) {
            console.error('Error en transcripción Whisper:', err);
          } finally {
            URL.revokeObjectURL(audioUrl);
            stream.getTracks().forEach((t) => t.stop());
          }
        };

        mediaRecorderRef.current = recorder;
        recorder.start();
        setIsListening(true);
      } catch (err) {
        console.error('Error accediendo al micrófono:', err);
        setWhisperError(
          'No se pudo acceder al micrófono. Comprueba los permisos del navegador.'
        );
      }
    }
  };

  // ─── Envío de mensaje (cloud mock) ───────────────────────────────────────────
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isTyping) return;

    const currentModelObj = CLOUD_MODELS.find((m) => m.id === cloudModel);

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      modelName: currentModelObj?.name || 'Cloud AI',
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    // Mock temporal — aquí irá la llamada streaming a la API cloud
    setTimeout(() => {
      const botResponse = `☁️ **[Respuesta simulada]**\nConsulta recibida para **${currentModelObj?.name}**.\n\nPronto integraremos la llamada con streaming a la API seleccionada ${cloudApiKey
        ? 'usando tu API Key guardada'
        : '(recuerda configurar tu API Key gratuita en los ajustes)'
        }.`;

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: botResponse,
          timestamp: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          modelName: currentModelObj?.name || 'Cloud AI',
        },
      ]);
      setIsTyping(false);
    }, 1000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const currentCloudModelObj = CLOUD_MODELS.find((m) => m.id === cloudModel);

  return (
    <div className="flex flex-col bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden min-h-[640px] max-h-[820px]">

      {/* ── 1. Header ─────────────────────────────────────────────────────────── */}
      <div className="p-4 bg-gray-50/80 border-b border-gray-200 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

          {/* Título + badge */}
          <div className="flex items-center gap-2">
            <span className="text-xl">☁️</span>
            <div>
              <h2 className="text-sm font-bold text-gray-800">Chat IA Multi-Motor</h2>
              <p className="text-[11px] text-gray-500">Modelos en la nube · dictado por voz</p>
            </div>
          </div>

          {/* Selector de modelo + ajustes */}
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
              className={`p-2 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 ${cloudApiKey
                ? 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                : 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                }`}
              title="Configurar API Key"
            >
              <span>⚙️</span>
              <span>{cloudApiKey ? 'Key configurada' : 'Añadir API Key'}</span>
            </button>
          </div>
        </div>

        {/* Barra de progreso Whisper */}
        {whisperLoading && (
          <div className="mt-3 p-3 bg-violet-50 border border-violet-200 text-violet-900 text-xs rounded-xl space-y-1.5">
            <div className="flex justify-between items-center font-medium">
              <span className="truncate pr-2">
                🎙️ {whisperStatusText || `Descargando ${WHISPER_MODELS.find((m) => m.id === whisperModel)?.name}...`}
              </span>
              <span className="font-bold shrink-0">{whisperProgress}%</span>
            </div>
            <div className="w-full bg-violet-200/80 rounded-full h-2 overflow-hidden">
              <div
                className="bg-violet-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${whisperProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Banner modelo activo */}
        <div className="mt-3 text-xs flex items-center gap-2 text-gray-500 bg-white/60 px-3 py-1.5 rounded-lg border border-gray-200/60">
          <span className="text-blue-600 font-semibold">⚡ Máxima Potencia</span>
          <span>•</span>
          <span>Servidores cloud sin consumo de tu hardware</span>
          <span>•</span>
          <span className="text-gray-400">{currentCloudModelObj?.description}</span>
        </div>

        {/* Panel API Key */}
        {showSettings && (
          <div className="mt-3 p-4 bg-white border border-indigo-100 rounded-xl shadow-sm text-xs space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-gray-900 text-sm">
                Configuración de API Key (BYOK)
              </h4>
              <button
                onClick={() => setShowSettings(false)}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                ✕
              </button>
            </div>
            <p className="text-gray-600">
              Tu API key se guarda exclusivamente en el{' '}
              <code className="bg-gray-100 px-1 py-0.5 rounded">localStorage</code>{' '}
              de tu navegador y nunca viaja a servidores intermedios.
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
              <span>
                🔑 <strong>Gemini:</strong> Obtén gratis en{' '}
                <a
                  href="https://aistudio.google.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-600 underline"
                >
                  aistudio.google.com
                </a>
              </span>
              <span>
                ⚡ <strong>Groq:</strong> Obtén gratis en{' '}
                <a
                  href="https://console.groq.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-600 underline"
                >
                  console.groq.com
                </a>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── 2. Área de mensajes ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-gradient-to-b from-gray-50/30 to-white">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-3xl ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'
                }`}
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm shadow-sm ${isUser
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'bg-blue-600 text-white'
                  }`}
              >
                {isUser ? 'Tú' : '☁️'}
              </div>

              {/* Burbuja */}
              <div className="flex flex-col gap-1">
                <div
                  className={`flex items-center gap-2 text-[11px] text-gray-400 ${isUser ? 'justify-end' : ''
                    }`}
                >
                  {!isUser && (
                    <span className="font-semibold text-gray-700">
                      {msg.modelName}
                    </span>
                  )}
                  <span>{msg.timestamp}</span>
                </div>

                <div
                  className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${isUser
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

      {/* Sugerencias rápidas */}
      {messages.length <= 2 && (
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center gap-2 overflow-x-auto text-xs no-scrollbar">
          <span className="text-gray-400 font-medium whitespace-nowrap">
            💡 Sugerencias:
          </span>
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

      {/* ── 3. Input de texto y controles ─────────────────────────────────────── */}
      <div className="p-4 bg-white border-t border-gray-200">
        <div className="flex items-end gap-2 bg-gray-50 border border-gray-300 rounded-xl p-2 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent transition">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe o dicta tu mensaje (se enviará al modelo en la nube)..."
            rows={1}
            className="flex-1 bg-transparent border-0 focus:outline-none resize-none text-sm text-gray-900 max-h-32 px-2 py-1 placeholder-gray-400"
          />

          {/* Botón micrófono */}
          <button
            onClick={handleMicToggle}
            disabled={sttEngine === 'whisper' && whisperLoading}
            title={
              isListening
                ? 'Detener dictado'
                : sttEngine === 'whisper' && whisperLoading
                  ? `Cargando Whisper ${whisperProgress}%...`
                  : 'Dictar por voz'
            }
            className={`p-2.5 rounded-lg transition shadow-sm shrink-0 flex items-center justify-center text-base ${isListening
              ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
              : sttEngine === 'whisper' && whisperLoading
                ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
              }`}
          >
            {isListening ? '⏹️' : '🎙️'}
          </button>

          {/* Botón enviar */}
          <button
            onClick={() => handleSendMessage()}
            disabled={!input.trim() || isTyping}
            className="p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white rounded-lg transition shadow-sm shrink-0 flex items-center justify-center"
            title="Enviar mensaje (Enter)"
          >
            <svg className="w-4 h-4 transform rotate-90" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </div>

        {/* Footer: atajos + estado STT + limpiar */}
        <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400 px-1">
          <span>
            Presiona{' '}
            <kbd className="bg-gray-100 border border-gray-300 rounded px-1 py-0.5 font-mono text-[10px]">
              Enter ↵
            </kbd>{' '}
            para enviar,{' '}
            <kbd className="bg-gray-100 border border-gray-300 rounded px-1 py-0.5 font-mono text-[10px]">
              Shift+Enter
            </kbd>{' '}
            para salto de línea
          </span>
          {messages.length > 1 && (
            <button
              onClick={() =>
                setMessages([
                  {
                    id: 'welcome',
                    role: 'assistant',
                    content: 'Conversación reiniciada. ¿En qué te puedo ayudar?',
                    timestamp: 'Ahora',
                    modelName:
                      CLOUD_MODELS.find((m) => m.id === cloudModel)?.name ||
                      'Cloud AI',
                  },
                ])
              }
              className="hover:text-red-500 transition"
            >
              Limpiar chat
            </button>
          )}
        </div>

        {/* Selector de motor de dictado + modelo Whisper + estado */}
        <div className="mt-1.5 flex items-center gap-2 px-1 text-[11px] text-gray-400 flex-wrap">
          <span>🎙️ Dictado:</span>

          {hasWebSpeechAPI() ? (
            /* Chrome / Edge / Safari: alternar entre Web Speech y Whisper */
            <button
              onClick={() =>
                setSttEngine(sttEngine === 'webspeech' ? 'whisper' : 'webspeech')
              }
              className="underline hover:text-indigo-600 transition"
            >
              {sttEngine === 'webspeech'
                ? 'Web Speech API (activo) — cambiar a Whisper Local'
                : 'Whisper Local (activo) — cambiar a Web Speech API'}
            </button>
          ) : (
            /* Firefox: Whisper obligatorio */
            <span className="text-amber-600 font-medium">
              Firefox detectado — usando Whisper Local automáticamente
            </span>
          )}

          {/* Selector de modelo Whisper (visible cuando Whisper está activo) */}
          {sttEngine === 'whisper' && (
            <select
              value={whisperModel}
              onChange={(e) => setWhisperModel(e.target.value)}
              disabled={whisperLoading}
              className="bg-white border border-gray-200 text-gray-600 rounded-md px-1.5 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
            >
              {WHISPER_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.size}) — {m.recommended === 'mobile' ? '📱 Móvil' : '💻 PC'}
                </option>
              ))}
            </select>
          )}

          {sttEngine === 'whisper' && !whisperReady && !whisperLoading && (
            <button
              onClick={handleLoadWhisper}
              className="underline text-indigo-500 hover:text-indigo-700 transition"
            >
              Cargar {WHISPER_MODELS.find((m) => m.id === whisperModel)?.name} ({WHISPER_MODELS.find((m) => m.id === whisperModel)?.size})
            </button>
          )}
          {sttEngine === 'whisper' && whisperLoading && (
            <span className="text-violet-600">{whisperProgress}% cargando...</span>
          )}
          {sttEngine === 'whisper' && whisperReady && (
            <span className="text-emerald-600 font-medium">
              ✓ {WHISPER_MODELS.find((m) => m.id === whisperModel)?.name} listo
            </span>
          )}
          {whisperError && (
            <span className="text-red-500">⚠️ {whisperError}</span>
          )}
          {isListening && (
            <span className="text-red-500 font-medium animate-pulse">
              ● Escuchando...
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatIaComponent;
