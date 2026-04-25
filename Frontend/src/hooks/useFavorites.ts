import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTokenFromStorage, safeJsonResponse } from '../utils/security';

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';

export function useFavorites() {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState<number[]>([]);
  const [loading, setLoading] = useState(() => !!getTokenFromStorage());

  const fetchFavorites = async () => {
    if (!getTokenFromStorage()) return;

    try {
      const response = await fetch(`${API_URL}/api/favorites`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await safeJsonResponse(response, []);
        const idsResponse = await fetch(`${API_URL}/api/products/ids`);
        if (idsResponse.ok) {
          const { ids: existingProductIds } = await safeJsonResponse(idsResponse, { ids: [] }) as { ids: number[] };
          const validFavorites = data.filter((id: number) =>
            Number.isInteger(id) && id > 0 && existingProductIds.includes(id)
          );
          setFavorites(validFavorites);
          if (validFavorites.length !== data.length) {
            await fetch(`${API_URL}/api/favorites`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ productIds: validFavorites })
            });
          }
        } else {
          setFavorites(data);
        }
      }
    } catch (error) {
      console.error('Erreur lors de la récupération des favoris:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!getTokenFromStorage()) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFavorites();
  }, []);

  const addFavorite = async (productId: number) => {
    if (!getTokenFromStorage()) {
      navigate('/connexion');
      return;
    }

    if (!Number.isInteger(productId) || productId <= 0) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/favorites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ productId })
      });
      if (response.ok) {
        const data = await safeJsonResponse(response, { productIds: [] });
        if (data.productIds && Array.isArray(data.productIds)) {
          setFavorites(data.productIds);
          window.dispatchEvent(new Event('favoritesUpdated'));
        }
      }
    } catch (error) {
      console.error('Erreur lors de l\'ajout aux favoris:', error);
    }
  };

  const removeFavorite = async (productId: number) => {
    if (!getTokenFromStorage()) return;

    if (!Number.isInteger(productId) || productId <= 0) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/favorites/${productId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (response.ok) {
        const data = await safeJsonResponse(response, { productIds: [] });
        if (data.productIds && Array.isArray(data.productIds)) {
          setFavorites(data.productIds);
          window.dispatchEvent(new Event('favoritesUpdated'));
        }
      }
    } catch (error) {
      console.error('Erreur lors de la suppression des favoris:', error);
    }
  };

  const isFavorite = (productId: number) => {
    if (!Number.isInteger(productId) || productId <= 0) {
      return false;
    }
    return favorites.includes(productId);
  };

  return { favorites, loading, addFavorite, removeFavorite, isFavorite, refreshFavorites: fetchFavorites };
}

