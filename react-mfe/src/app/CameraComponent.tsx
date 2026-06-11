import React from 'react';
import { useCamera } from './useCamera';
import './CameraComponent.css';

export const CameraComponent: React.FC = () => {
  const { photoUrl, error, takePhoto } = useCamera();

  return (
    <div className="camera-container">
      <h2>Camera Micro Frontend</h2>
      <p>Click the button below to take a picture using your device's camera.</p>
      
      <button onClick={takePhoto} className="camera-btn">
        📸 Take Photo
      </button>

      {error && <div className="error-message">{error}</div>}

      {photoUrl && (
        <div className="photo-preview">
          <h3>Preview:</h3>
          <img src={photoUrl} alt="Captured" />
        </div>
      )}
    </div>
  );
};
