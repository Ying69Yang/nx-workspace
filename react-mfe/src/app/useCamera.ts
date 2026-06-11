import { useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export const useCamera = () => {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const takePhoto = async () => {
    try {
      setError(null);
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Prompt // Prompts user to choose from gallery or take a photo
      });

      if (image.webPath) {
        setPhotoUrl(image.webPath);
      }
    } catch (err: any) {
      console.error('Error taking photo:', err);
      setError(err.message || 'Failed to take photo');
    }
  };

  return { photoUrl, error, takePhoto };
};
