import { useState } from 'react';
import { Upload, X } from 'lucide-react';
import { validateFileType, validateFileSize, safeJsonResponse } from '../utils/security';

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';

interface ImageUploadProps {
  onImageUploaded: (imageUrl: string) => void;
  currentImage?: string;
  label?: string;
}

export default function ImageUpload({ onImageUploaded, currentImage, label = 'Image' }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!validateFileType(file, ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])) {
      setError('Type de fichier non autorisé. Utilisez JPG, PNG ou WebP.');
      return;
    }

    if (!validateFileSize(file, 5)) {
      setError('L\'image est trop grande (max 5MB)');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        if (!base64 || base64.length > 10 * 1024 * 1024) {
          setError('Erreur lors de la lecture du fichier');
          setUploading(false);
          return;
        }
        
        const adminToken = localStorage.getItem('adminToken');
        if (!adminToken) {
          setError('Session expirée. Veuillez vous reconnecter.');
          setUploading(false);
          return;
        }
        
        const response = await fetch(`${API_URL}/api/images/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          body: JSON.stringify({
            image: base64,
            name: file.name.slice(0, 255).replace(/[^a-zA-Z0-9._-]/g, '_')
          })
        });

        if (!response.ok) {
          throw new Error('Erreur lors de l\'upload');
        }

        const data = await safeJsonResponse(response, { url: '' });
        if (data.url) {
          onImageUploaded(data.url);
        } else {
          throw new Error('URL d\'image non reçue');
        }
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'upload');
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {currentImage ? (
        <div className="relative">
          <img src={currentImage} alt="Preview" className="w-full h-48 object-cover rounded-lg" />
          <button
            type="button"
            onClick={() => onImageUploaded('')}
            className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <label className="cursor-pointer">
            <span className="text-sm text-gray-600">Cliquez pour uploader</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={uploading}
              className="hidden"
            />
          </label>
          {uploading && <p className="text-sm text-gray-500 mt-2">Upload en cours...</p>}
        </div>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

