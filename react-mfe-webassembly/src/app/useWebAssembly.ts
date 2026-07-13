import { useEffect, useState, useRef, useCallback, RefObject } from 'react';

// --- Constantes ---
const CANVAS_W = 400;
const CANVAS_H = 400;
const PIXEL_COUNT = CANVAS_W * CANVAS_H;
const BLUR_PASSES = 5;

// --- JS Implementation (blur escalar, sin SIMD) ---
// Box blur 3x3 escalar (componente por componente)
function blurJS(
  src: Uint8Array,   // RGBA bytes
  dst: Uint8Array,
  w: number,
  h: number
): void {
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const center = (y * w + x) * 4;
      let r = 0, g = 0, b = 0, a = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * w + (x + kx)) * 4;
          r += src[idx];
          g += src[idx + 1];
          b += src[idx + 2];
          a += src[idx + 3];
        }
      }

      dst[center] = r / 9;
      dst[center + 1] = g / 9;
      dst[center + 2] = b / 9;
      dst[center + 3] = a / 9;
    }
  }

  // Bordes
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || x === w - 1 || y === 0 || y === h - 1) {
        const idx = (y * w + x) * 4;
        dst[idx] = src[idx];
        dst[idx + 1] = src[idx + 1];
        dst[idx + 2] = src[idx + 2];
        dst[idx + 3] = src[idx + 3];
      }
    }
  }
}

interface WasmExports {
  memory: WebAssembly.Memory;
  generateTestImage: (ptr: number, w: number, h: number) => void;
  u32ToF32: (srcPtr: number, dstPtr: number, pixelCount: number) => void;
  f32ToU32: (srcPtr: number, dstPtr: number, pixelCount: number) => void;
  blurSIMD: (srcPtr: number, dstPtr: number, w: number, h: number) => void;
}

export const useWebAssembly = (canvasRef: RefObject<HTMLCanvasElement | null>) => {
  const [wasmInstance, setWasmInstance] = useState<WasmExports | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pixelBufferRef = useRef<Uint32Array | null>(null);
  const animFrameRef = useRef<number>(0);
  const runningRef = useRef(false);

  const [wasmBlurTime, setWasmBlurTime] = useState<number | null>(null);
  const [jsBlurTime, setJsBlurTime] = useState<number | null>(null);
  const [fps, setFps] = useState<number>(0);

  // --- Initialize Wasm ---
  useEffect(() => {
    const initWasm = async () => {
      let wasmUrl = 'Mandelbrot.wasm';
      try {
        const res = await fetch('/federation.manifest.json');
        if (res.ok) {
          const manifest = await res.json();
          const remoteEntry = manifest['react-mfe-webassembly'];
          if (remoteEntry) {
            wasmUrl = new URL('Mandelbrot.wasm', remoteEntry).href;
          }
        }
      } catch (_e) { /* use default */ }

      try {
        const response = await fetch(wasmUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const wasmBytes = await response.arrayBuffer();
        const importObj = {
          env: {
            abort: () => { console.error('[Wasm] abort'); },
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            trace: () => { },
            seed: () => Date.now()
          }
        };
        const obj = await WebAssembly.instantiate(wasmBytes, importObj);
        const wasm = obj.instance.exports as unknown as WasmExports;

        // Layout en memoria lineal:
        // [0 .. PIXEL_COUNT*4) = pixel buffer u32 (0xAABBGGRR)
        // [PIXEL_COUNT*4 .. PIXEL_COUNT*4 + PIXEL_COUNT*16) = buffer f32x4 (entrada blur)
        // [... + PIXEL_COUNT*16 .. ... + PIXEL_COUNT*32) = buffer f32x4 (salida blur)
        const pixelBytes = PIXEL_COUNT * 4;
        const f32Bytes = PIXEL_COUNT * 16;
        const totalBytes = pixelBytes + f32Bytes * 2;
        const wasmMemory = wasm.memory;
        while (wasmMemory.buffer.byteLength < totalBytes) {
          wasmMemory.grow(1);
        }

        const pixels = new Uint32Array(wasmMemory.buffer, 0, PIXEL_COUNT);
        pixelBufferRef.current = pixels;

        // Generar imagen de prueba
        const f32Src = pixelBytes;
        wasm.generateTestImage(f32Src, CANVAS_W, CANVAS_H);

        // Convertir f32 → u32 para mostrar
        wasm.f32ToU32(f32Src, 0, PIXEL_COUNT);

        setWasmInstance(wasm);
        setLoading(false);
      } catch (err: any) {
        setError(`Error: ${err.message}`);
        setLoading(false);
      }
    };

    initWasm();
  }, []);

  // --- Draw frame ---
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || !pixelBufferRef.current || !wasmInstance) return;

    const buf = pixelBufferRef.current;
    const imageData = ctx.createImageData(CANVAS_W, CANVAS_H);
    const data = imageData.data;
    for (let i = 0; i < PIXEL_COUNT; i++) {
      const pixel = buf[i];
      const idx = i * 4;
      data[idx] = pixel & 0xFF;
      data[idx + 1] = (pixel >> 8) & 0xFF;
      data[idx + 2] = (pixel >> 16) & 0xFF;
      data[idx + 3] = 0xFF;
    }
    ctx.putImageData(imageData, 0, 0);
  }, [canvasRef, wasmInstance]);

  // --- Draw initial frame when Wasm is ready ---
  useEffect(() => {
    if (loading || error || !wasmInstance) return;
    const raf = requestAnimationFrame(() => {
      drawFrame();
    });
    return () => cancelAnimationFrame(raf);
  }, [loading, error, wasmInstance, drawFrame]);

  // --- Run benchmarks (solo cálculo, sin putImageData) ---
  const runBenchmarks = useCallback(() => {
    if (!wasmInstance) return;
    const wasm = wasmInstance;
    const pixelBytes = PIXEL_COUNT * 4;
    const f32Src = pixelBytes;
    const f32Dst = pixelBytes + PIXEL_COUNT * 16;
    const passes = BLUR_PASSES;

    // --- Wasm SIMD benchmark ---
    // Primero convertir u32 → f32
    wasm.u32ToF32(0, f32Src, PIXEL_COUNT);

    const t0 = performance.now();
    for (let p = 0; p < passes; p++) {
      // Alternar src/dst para cada pasada
      if (p % 2 === 0) {
        wasm.blurSIMD(f32Src, f32Dst, CANVAS_W, CANVAS_H);
      } else {
        wasm.blurSIMD(f32Dst, f32Src, CANVAS_W, CANVAS_H);
      }
    }
    const t1 = performance.now();
    setWasmBlurTime((t1 - t0) / passes);

    // Convertir resultado final a u32 para mostrar
    const finalPtr = (passes % 2 === 0) ? f32Src : f32Dst;
    wasm.f32ToU32(finalPtr, 0, PIXEL_COUNT);

    // --- JS benchmark ---
    // Crear copia Uint8Array del buffer para JS
    const srcBuf = new Uint8Array(wasm.memory.buffer, 0, PIXEL_COUNT * 4);
    const tmp1 = new Uint8Array(PIXEL_COUNT * 4);
    const tmp2 = new Uint8Array(PIXEL_COUNT * 4);

    const t2 = performance.now();
    for (let p = 0; p < passes; p++) {
      const src = (p === 0) ? srcBuf : ((p % 2 === 0) ? tmp1 : tmp2);
      const dst = (p % 2 === 0) ? tmp1 : tmp2;
      blurJS(src, dst, CANVAS_W, CANVAS_H);
    }
    const t3 = performance.now();
    setJsBlurTime((t3 - t2) / passes);

    // Refrescar canvas con el resultado
    requestAnimationFrame(() => drawFrame());
  }, [wasmInstance, drawFrame]);

  const speedupFactor = (wasmBlurTime !== null && jsBlurTime !== null)
    ? (jsBlurTime / wasmBlurTime).toFixed(1)
    : null;

  return {
    loading,
    error,
    wasmBlurTime,
    jsBlurTime,
    fps,
    speedupFactor,
    runBenchmarks,
  };
};