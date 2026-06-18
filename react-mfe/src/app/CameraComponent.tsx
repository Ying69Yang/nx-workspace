import React from 'react';
import { useCamera } from './useCamera';

export const CameraComponent: React.FC = () => {
  const { photoUrl, error, takePhoto } = useCamera();

  return (
    <div className="flex flex-col items-center p-4 sm:p-8 bg-white rounded-xl shadow-md text-center">
      <h2 className="text-xl sm:text-2xl font-semibold text-gray-800 mb-2">Camera Micro Frontend</h2>
      <p className="text-gray-500 text-sm sm:text-base mb-4">
        Click the button below to take a picture using your device's camera.
      </p>

      <button
        onClick={takePhoto}
        className="bg-primary-700 hover:bg-primary-800 text-white border-none px-6 py-3 text-base sm:text-lg rounded-lg cursor-pointer transition-colors flex items-center gap-2 my-4"
      >
        📸 Take Photo
      </button>

      {error && (
        <div className="text-red-700 bg-red-50 p-4 rounded mt-4 w-full text-sm">
          {error}
        </div>
      )}

      {photoUrl && (
        <div className="mt-6 w-full">
          <h3 className="text-lg font-medium text-gray-700 mb-2">Preview:</h3>
          <img
            src={photoUrl}
            alt="Captured"
            className="max-w-full max-h-[400px] rounded-lg shadow object-contain mx-auto"
          />
        </div>
      )}
    </div>
  );
};
