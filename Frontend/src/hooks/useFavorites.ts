import { useState, useEffect } from 'react';
import { getTokenFromStorage, safeJsonResponse } from '../utils/security';

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';

export function useFavorites() {
  const [favorites, setFavorites] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getTokenFromStorage();
    if (!token) {
      setFavorites([]);
      setLoading(false);
      return;
    }
    fetchFavorites();
  }, []);

  const fetchFavorites = async () => {
    const token = getTokenFromStorage();
    if (!token) return;
    
    try {
      const response = await fetch(`${API_URL}/api/favorites`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await safeJsonResponse(response, []);
        const productsResponse = await fetch(`${API_URL}/api/products`);
        if (productsResponse.ok) {
          const products = await safeJsonResponse(productsResponse, []);
          const existingProductIds = products.map((p: any) => p.id || p._id);
          const validFavorites = data.filter((id: number) => 
            Number.isInteger(id) && id > 0 && existingProductIds.includes(id)
          );
          setFavorites(validFavorites);
          if (validFavorites.length !== data.length) {
            const token = getTokenFromStorage();
            if (token) {
              await fetch(`${API_URL}/api/favorites`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ productIds: validFavorites })
              });
            }
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

  const addFavorite = async (productId: number) => {
    const token = getTokenFromStorage();
    if (!token) {
      window.location.href = '/connexion';
      return;
    }

    if (!Number.isInteger(productId) || productId <= 0) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/favorites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
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
    const token = getTokenFromStorage();
    if (!token) return;

    if (!Number.isInteger(productId) || productId <= 0) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/favorites/${productId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
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

