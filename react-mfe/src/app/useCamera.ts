import { useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

/**
 * Detecta si la app se ejecuta en un entorno nativo (Capacitor) o en web/PWA.
 * En web/PWA usamos `navigator.mediaDevices` para capturar un frame de camara.
 * En nativo usamos el plugin `@capacitor/camera` (camara nativa con opciones
 * de galeria).
 */
function isNativePlatform(): boolean {
  try {
    return !!(window as any).Capacitor?.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Captura un frame de la camara usando `getUserMedia` y lo devuelve como
 * data URL (base64). Funciona en cualquier navegador moderno (escritorio y PWA).
 */
async function captureFrameFromWebcam(): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });

  return new Promise<string>((resolve, reject) => {
    // Usamos un elemento <video> oculto para recibir el stream
    const video = document.createElement('video');
    video.srcObject = stream;
    video.playsInline = true;
    video.muted = true;

    video.onloadeddata = () => {
      video.play();

      // Esperamos 500ms para que el primer fotograma esté disponible
      setTimeout(() => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(video, 0, 0);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

          // Limpieza: paramos el stream y liberamos recursos
          stream.getTracks().forEach((track) => track.stop());
          video.remove();
          canvas.remove();

          resolve(dataUrl);
        } catch (err) {
          stream.getTracks().forEach((track) => track.stop());
          video.remove();
          reject(err);
        }
      }, 500);
    };

    video.onerror = (err) => {
      stream.getTracks().forEach((track) => track.stop());
      video.remove();
      reject(err);
    };
  });
}

export const useCamera = () => {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const takePhoto = async () => {
    try {
      setError(null);

      if (isNativePlatform()) {
        // Modo nativo (Capacitor): abre la camara nativa del dispositivo
        const image = await Camera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: CameraSource.Prompt,
        });

        if (image.webPath) {
          setPhotoUrl(image.webPath);
        }
      } else {
        // Modo web/PWA: captura un frame desde la webcam
        const dataUrl = await captureFrameFromWebcam();
        setPhotoUrl(dataUrl);
      }
    } catch (err: any) {
      const message = err?.message || err?.toString() || 'No se pudo acceder a la cámara';
      console.error('Error taking photo:', err);
      setError(message);

      // Si el error es por permisos, damos un mensaje mas claro
      if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('denied')) {
        setError('Permiso de cámara denegado. Actívalo en la configuración del navegador.');
      }
    }
  };

  return { photoUrl, error, takePhoto };
};