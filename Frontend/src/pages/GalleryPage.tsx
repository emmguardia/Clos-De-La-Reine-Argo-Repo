import { useState, useEffect } from 'react';
import { safeJsonResponse } from '../utils/security';
import Pagination from '../components/Pagination';

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';
const ITEMS_PER_PAGE = 12;

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
  const [pagePro, setPagePro] = useState(1);
  const [pageClient, setPageClient] = useState(1);

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

  const paginatedPro = professionalImages.slice((pagePro - 1) * ITEMS_PER_PAGE, pagePro * ITEMS_PER_PAGE);
  const paginatedClient = clientImages.slice((pageClient - 1) * ITEMS_PER_PAGE, pageClient * ITEMS_PER_PAGE);
  const totalPagesPro = Math.ceil(professionalImages.length / ITEMS_PER_PAGE);
  const totalPagesClient = Math.ceil(clientImages.length / ITEMS_PER_PAGE);

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
          <a
            href="https://studiozangarelli.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-full border border-gray-300 text-sm text-gray-800 hover:border-gray-900 hover:bg-gray-50 transition-colors"
          >
            Studio Zangarelli
            <span className="text-xs">↗</span>
          </a>
        </div>
        {professionalImages.length > 0 && (
          <section className="mb-16">
            <div className="mb-8">
              <h2 className="text-3xl font-light text-gray-900 mb-2">Professionnelle</h2>
              <p className="text-gray-600">Nos créations et séances photo</p>
            </div>
            <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 mb-8">
              {paginatedPro.map((item, index) => {
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
            <Pagination
              currentPage={pagePro}
              totalPages={totalPagesPro}
              onPageChange={setPagePro}
              className="mt-6"
            />
          </section>
        )}
        {clientImages.length > 0 && (
          <section>
            <div className="mb-8">
              <h2 className="text-3xl font-light text-gray-900 mb-2">Clients</h2>
              <p className="text-gray-600">Nos créations prennent tout leur sens lorsqu'elles accompagnent vos fidèles.</p>
            </div>
            <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 mb-8">
              {paginatedClient.map((item, index) => {
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
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="absolute bottom-3 left-3 right-3">
                        <p className="text-white text-xs">{item.name}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <Pagination
              currentPage={pageClient}
              totalPages={totalPagesClient}
              onPageChange={setPageClient}
              className="mt-6"
            />
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
