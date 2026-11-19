import React, { useRef } from 'react';
import { useWebAssembly } from './useWebAssembly';

export const WebAssemblyComponent: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const {
    loading,
    error,
    wasmBlurTime,
    jsBlurTime,
    fps,
    speedupFactor,
    runBenchmarks,
  } = useWebAssembly(canvasRef);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow-lg border border-gray-100 max-w-xl mx-auto my-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4"></div>
        <p className="text-gray-600 font-medium">Loading WebAssembly Module...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 text-red-800 rounded-xl max-w-xl mx-auto my-8 shadow-sm">
        <h3 className="font-semibold text-lg mb-2">Failed to load Wasm</h3>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Canvas */}
      <div className="bg-black rounded-xl overflow-hidden shadow-2xl border border-gray-700">
        <canvas
          ref={canvasRef}
          width={400}
          height={400}
          className="block max-w-full"
        />
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-4 items-center justify-center text-sm font-mono">
        <div className="bg-gray-800 text-green-400 px-3 py-1.5 rounded-lg border border-gray-700">
          FPS: <span className="font-bold text-white">{fps}</span>
        </div>
        <div className="bg-gray-800 text-blue-400 px-3 py-1.5 rounded-lg border border-gray-700">
          Wasm SIMD: <span className="font-bold text-white">{wasmBlurTime !== null ? `${wasmBlurTime.toFixed(2)} ms` : 'N/A'}</span>
        </div>
        <div className="bg-gray-800 text-orange-400 px-3 py-1.5 rounded-lg border border-gray-700">
          JS escalar: <span className="font-bold text-white">{jsBlurTime !== null ? `${jsBlurTime.toFixed(2)} ms` : 'N/A'}</span>
        </div>
        {speedupFactor && (
          <div className={`px-3 py-1.5 rounded-lg border font-sans font-bold ${parseFloat(speedupFactor) > 1.5
            ? 'bg-green-900/50 text-green-300 border-green-700'
            : 'bg-yellow-900/50 text-yellow-300 border-yellow-700'
            }`}>
            {parseFloat(speedupFactor) > 1
              ? `🚀 Wasm SIMD ${speedupFactor}x más rápido`
              : `🐌 Wasm ${(1 / parseFloat(speedupFactor)).toFixed(1)}x más lento`
            }
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center justify-center">
        <button
          onClick={runBenchmarks}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition text-sm"
        >
          Ejecutar Benchmark (blur {5} pasadas)
        </button>
      </div>

      <p className="text-gray-500 text-xs text-center max-w-xl">
        🔬 3×3 box blur applied {5} times on a 400×400 image (160,000 pixels).
        The benchmark runs 2 passes: one applying the blur with JavaScript and another with WebAssembly (Wasm).
        Wasm uses SIMD (v128) to process 4 RGBA components simultaneously, whereas JS processes component by component (scalar).
        Only pure computation is timed, excluding canvas rendering.
      </p>
    </div>
  );
};

export default WebAssemblyComponent;