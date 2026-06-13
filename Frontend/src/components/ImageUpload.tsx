import { useState, useRef, useEffect } from 'react';
import { Upload, X, ImagePlus } from 'lucide-react';
import { validateFileType, validateFileSize, safeJsonResponse, getSafeImageSrc } from '../utils/security';

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';

/** Affiche une image après re-validation par getSafeImageSrc (allowlist stricte).
 *  Toute URL non whitelistée (javascript:, data:image/svg+xml, etc.) tombe en placeholder.
 *  Cette validation locale est rendue explicite pour que CodeQL voie le sink protégé. */
function SafeImagePreview({ url, className, alt }: { url: string; className?: string; alt?: string }) {
  const safeUrl = getSafeImageSrc(url);
  if (!safeUrl) return <div className={`${className || ''} bg-gray-100`} aria-hidden="true" />;

  // Data URIs sûrs (png/jpeg/jpg/gif/webp uniquement) : affichage direct
  if (safeUrl.startsWith('data:image/')) {
    return <img src={safeUrl} alt={alt || 'Preview'} className={className} />;
  }

  return <SafeImagePreviewRemote url={safeUrl} className={className} alt={alt} />;
}

interface RemoteState {
  url: string;
  blobUrl: string | null;
  failed: boolean;
}

function SafeImagePreviewRemote({ url, className, alt }: { url: string; className?: string; alt?: string }) {
  // state.url permet de savoir si state correspond à la prop courante (évite setState() synchrone en début d'effet)
  const [state, setState] = useState<RemoteState>(() => ({ url: '', blobUrl: null, failed: false }));
  const blobRef = useRef<string | null>(null);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url, { mode: 'cors' })
      .then((r) => r.blob())
      .then((blob) => {
        if (cancelled) return;
        const u = URL.createObjectURL(blob);
        blobRef.current = u;
        setState({ url, blobUrl: u, failed: false });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ url, blobUrl: null, failed: true });
      });
    return () => {
      cancelled = true;
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, [url]);

  const isCurrent = state.url === url;
  if (isCurrent && state.blobUrl) {
    return <img src={state.blobUrl} alt={alt || 'Preview'} className={className} referrerPolicy="no-referrer" />;
  }
  if (isCurrent && state.failed) {
    // Re-validation explicite avant fallback (defense in depth pour CodeQL)
    const safeFallback = getSafeImageSrc(url);
    if (!safeFallback) return <div className={`${className || ''} bg-gray-100`} aria-hidden="true" />;
    return <img src={safeFallback} alt={alt || 'Preview'} className={className} referrerPolicy="no-referrer" />;
  }
  return <div className={`${className || ''} bg-gray-100 animate-pulse`} />;
}

interface ImageUploadProps {
  onImageUploaded: (imageUrl: string) => void;
  currentImage?: string;
  label?: string;
}

export default function ImageUpload({ onImageUploaded, currentImage, label = 'Image' }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        
        if (!localStorage.getItem('isAdminLoggedIn')) {
          setError('Session expirée. Veuillez vous reconnecter.');
          setUploading(false);
          return;
        }

        const response = await fetch(`${API_URL}/api/images/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            image: base64,
            name: file.name.slice(0, 255).replace(/[^a-zA-Z0-9._-]/g, '_'),
          }),
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

  const triggerFileInput = () => {
    if (uploading) return;
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        onChange={handleFileChange}
        disabled={uploading}
        className="hidden"
        aria-hidden
      />
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {(() => {
        const safeSrc = getSafeImageSrc(currentImage);
        return safeSrc ? (
        <div className="relative">
          <SafeImagePreview url={safeSrc} className="w-full h-48 object-cover rounded-lg" />
          <div className="absolute top-2 right-2 flex gap-1">
            <button
              type="button"
              onClick={triggerFileInput}
              disabled={uploading}
              className="p-1.5 bg-white/95 text-gray-900 rounded-full border border-gray-200 hover:bg-white shadow hover:scale-105 transition-all"
              title="Remplacer l'image"
            >
              <ImagePlus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onImageUploaded('')}
              className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600"
              title="Supprimer l'image"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
              <span className="text-sm text-white font-medium">Upload en cours...</span>
            </div>
          )}
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={triggerFileInput}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); triggerFileInput(); } }}
          className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50/50 transition-colors"
        >
          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <span className="text-sm text-gray-600">Cliquez pour uploader</span>
          {uploading && <p className="text-sm text-gray-500 mt-2">Upload en cours...</p>}
        </div>
      );
})()}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

