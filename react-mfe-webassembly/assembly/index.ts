// Procesamiento de imágenes con SIMD (v128)
// Box blur 3x3 sobre buffer RGBA almacenado como f32x4 por píxel
// Cada píxel = 4 f32 (R, G, B, A) = 16 bytes, ideal para v128

// Genera un patrón de prueba (degradado + checkerboard) en f32
// pixelPtr: puntero al buffer f32 (R, G, B, A por píxel)
export function generateTestImage(ptr: usize, w: i32, h: i32): void {
  const wf = w as f32;
  const hf = h as f32;
  const c255: f32 = 255.0;
  const c05: f32 = 0.5;
  const c1: f32 = 1.0;

  for (let y: i32 = 0; y < h; y++) {
    for (let x: i32 = 0; x < w; x++) {
      const idx = ((y * w + x) << 4) as usize;

      const xf = x as f32;
      const yf = y as f32;

      const r: f32 = (xf / wf) * c255;
      const g: f32 = (yf / hf) * c255;
      const b: f32 = c255 - (xf / wf) * c255;
      const checker: f32 = (((x / 16 + y / 16) & 1) == 1) ? c05 : c1;

      store<f32>(ptr + idx, r * checker);
      store<f32>(ptr + idx + 4, g * checker);
      store<f32>(ptr + idx + 8, b);
      store<f32>(ptr + idx + 12, c255);
    }
  }
}

// Convierte buffer RGBA u32 (0xAABBGGRR) a f32x4 (R, G, B, A normalizados)
// Usado para pasar de la entrada del canvas a formato SIMD
export function u32ToF32(
  srcPtr: usize,  // entrada: u32 en formato 0xAABBGGRR
  dstPtr: usize,  // salida: f32x4 (R, G, B, A)
  pixelCount: i32
): void {
  const a255: f32 = 255.0;
  for (let i: i32 = 0; i < pixelCount; i++) {
    const pixel = load<u32>(srcPtr + (i << 2));
    const r = (pixel & 0xFF) as f32;
    const g = ((pixel >> 8) & 0xFF) as f32;
    const b = ((pixel >> 16) & 0xFF) as f32;

    const off = (i << 4) as usize;
    store<f32>(dstPtr + off, r);
    store<f32>(dstPtr + off + 4, g);
    store<f32>(dstPtr + off + 8, b);
    store<f32>(dstPtr + off + 12, a255);
  }
}

// Convierte buffer f32x4 de vuelta a u32 0xAABBGGRR
export function f32ToU32(
  srcPtr: usize,  // entrada: f32x4
  dstPtr: usize,  // salida: u32 en formato 0xAABBGGRR
  pixelCount: i32
): void {
  for (let i: i32 = 0; i < pixelCount; i++) {
    const off = (i << 4) as usize;
    const r = load<f32>(srcPtr + off) as u32;
    const g = load<f32>(srcPtr + off + 4) as u32;
    const b = load<f32>(srcPtr + off + 8) as u32;

    store<u32>(dstPtr + (i << 2), 0xFF000000 | (b << 16) | (g << 8) | r);
  }
}

// Box blur 3x3 con SIMD (v128)
// Procesa 4 componentes (R,G,B,A) simultáneamente usando f32x4
// src, dst: buffers f32x4 (16 bytes por píxel)
export function blurSIMD(
  srcPtr: usize,
  dstPtr: usize,
  w: i32,
  h: i32
): void {
  // Kernel box blur 3x3 normalizado (1/9)
  const zero: f32 = 0.0;
  const inv9Val: f32 = 1.0 / 9.0;
  const inv9: v128 = f32x4.splat(inv9Val);

  for (let y: i32 = 1; y < h - 1; y++) {
    for (let x: i32 = 1; x < w - 1; x++) {
      const center = ((y * w + x) << 4) as usize;

      // Sumar los 9 píxeles vecinos (cada uno es un f32x4)
      let sum = f32x4.splat(zero);

      // Fila superior (y-1)
      sum = f32x4.add(sum, v128.load(srcPtr + (((y - 1) * w + (x - 1)) << 4)));
      sum = f32x4.add(sum, v128.load(srcPtr + (((y - 1) * w + x) << 4)));
      sum = f32x4.add(sum, v128.load(srcPtr + (((y - 1) * w + (x + 1)) << 4)));

      // Fila central (y)
      sum = f32x4.add(sum, v128.load(srcPtr + ((y * w + (x - 1)) << 4)));
      sum = f32x4.add(sum, v128.load(srcPtr + ((y * w + x) << 4)));
      sum = f32x4.add(sum, v128.load(srcPtr + ((y * w + (x + 1)) << 4)));

      // Fila inferior (y+1)
      sum = f32x4.add(sum, v128.load(srcPtr + (((y + 1) * w + (x - 1)) << 4)));
      sum = f32x4.add(sum, v128.load(srcPtr + (((y + 1) * w + x) << 4)));
      sum = f32x4.add(sum, v128.load(srcPtr + (((y + 1) * w + (x + 1)) << 4)));

      // Dividir por 9
      const result = f32x4.mul(sum, inv9);

      v128.store(dstPtr + center, result);
    }
  }

  // Copiar bordes (los dejamos igual)
  for (let y: i32 = 0; y < h; y++) {
    for (let x: i32 = 0; x < w; x++) {
      if (x == 0 || x == w - 1 || y == 0 || y == h - 1) {
        const idx = ((y * w + x) << 4) as usize;
        v128.store(dstPtr + idx, v128.load(srcPtr + idx));
      }
    }
  }
}