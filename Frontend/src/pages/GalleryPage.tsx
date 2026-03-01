import { useState, useEffect } from 'react';
import { safeJsonResponse } from '../utils/security';

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';

interface GalleryItem {
  id: string;
  name: string;
  data: string;
  type: 'professional' | 'client';
  createdAt: string;
}

export default function GalleryPage() {
  const [professionalImages, setProfessionalImages] = useState<GalleryItem[]>([]);
  const [clientImages, setClientImages] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGallery();
  }, []);

  const fetchGallery = async () => {
    try {
      const response = await fetch(`${API_URL}/api/gallery`);
      if (response.ok) {
        const data = await safeJsonResponse(response, []);
        if (Array.isArray(data)) {
          setProfessionalImages(data.filter((item: GalleryItem) => item.type === 'professional'));
          setClientImages(data.filter((item: GalleryItem) => item.type === 'client'));
        }
      }
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-600">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-light text-gray-900 mb-2">Galerie</h1>
          <p className="text-gray-600 max-w-3xl mx-auto">
            Joanne imagine et supervise chaque direction artistique — des lieux aux décors — pour façonner un univers fidèle à l'esprit du Clos de la Reine.
            Depuis les débuts, le regard d'Émilie Zangarrelli et son équipe en capte l'essence et en révèle toute la subtilité.
          </p>
        </div>
        {professionalImages.length > 0 && (
          <section className="mb-16">
            <div className="mb-8">
              <h2 className="text-3xl font-light text-gray-900 mb-2">Professionnelle</h2>
              <p className="text-gray-600">Nos créations et photos de studio</p>
            </div>
            <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 mb-8">
              {professionalImages.map((item, index) => {
                const sizes = ['tall', 'wide', 'normal'];
                const size = sizes[index % sizes.length];
                return (
                  <div
                    key={item.id}
                    className={`relative group overflow-hidden rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 mb-6 break-inside-avoid ${
                      size === 'tall' ? 'h-96' : size === 'wide' ? 'h-64' : 'h-80'
                    }`}
                  >
                    <img
                      src={item.data}
                      loading="lazy"
                      alt={item.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="absolute bottom-4 left-4 right-4">
                        <p className="text-white text-sm font-medium">{item.name}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
        {clientImages.length > 0 && (
          <section>
            <div className="mb-8">
              <h2 className="text-3xl font-light text-gray-900 mb-2">Clients</h2>
              <p className="text-gray-600">Nos créations prennent tout leur sens lorsqu'elles accompagnent vos fidèles.</p>
            </div>
            <div className="columns-2 sm:columns-3 lg:columns-4 gap-4 mb-8">
              {clientImages.map((item, index) => {
                const sizes = ['tall', 'wide', 'normal'];
                const size = sizes[index % sizes.length];
                return (
                  <div
                    key={item.id}
                    className={`relative group overflow-hidden rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 mb-4 break-inside-avoid ${
                      size === 'tall' ? 'h-72' : size === 'wide' ? 'h-48' : 'h-56'
                    }`}
                  >
                    <img
                      src={item.data}
                      loading="lazy"
                      alt={item.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="absolute bottom-3 left-3 right-3">
                        <p className="text-white text-xs">{item.name}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
        {professionalImages.length === 0 && clientImages.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p>Aucune image dans la galerie</p>
          </div>
        )}
      </div>
    </div>
  );
}
