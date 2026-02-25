import { useState, useEffect } from 'react';
import { getTokenFromStorage, safeJsonResponse } from '../utils/security';

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';

let cartFetchPromise: Promise<CartItem[]> | null = null;

export interface CartItem {
  productId: number;
  quantity: number;
  size?: string;
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getTokenFromStorage();
    if (!token) {
      setItems([]);
      setLoading(false);
      return;
    }
    fetchCart();
  }, []);

  const fetchCart = async () => {
    const token = getTokenFromStorage();
    if (!token) return;
    
    const doFetch = async (): Promise<CartItem[]> => {
      const response = await fetch(`${API_URL}/api/cart`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await safeJsonResponse(response, []);
      return Array.isArray(data) ? data : [];
    };

    try {
      if (!cartFetchPromise) {
        cartFetchPromise = doFetch();
      }
      const data = await cartFetchPromise;
      setItems(data);
    } catch (error) {
      console.error('Erreur lors de la récupération du panier:', error);
    } finally {
      cartFetchPromise = null;
      setLoading(false);
    }
  };

  const addToCart = async (productId: number, quantity: number = 1, size?: string, productName?: string) => {
    const token = getTokenFromStorage();
    if (!token) {
      window.location.href = '/connexion';
      return;
    }

    if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity <= 0 || quantity > 10) {
      alert('Données invalides');
      return;
    }

    const currentTotalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    if (currentTotalItems + quantity > 10) {
      alert('Le panier est limité à 10 articles maximum');
      return;
    }

    try {
      const body: { productId: number; quantity: number; size?: string } = { productId, quantity };
      if (size) body.size = size;
      const response = await fetch(`${API_URL}/api/cart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      if (response.ok) {
        const data = await safeJsonResponse(response, { items: [] });
        if (data.items && Array.isArray(data.items)) {
          setItems(data.items);
          window.dispatchEvent(new Event('cartUpdated'));
          window.dispatchEvent(new CustomEvent('cartItemAdded', { detail: { productName } }));
        }
      }
    } catch (error) {
      console.error('Erreur lors de l\'ajout au panier:', error);
    }
  };

  const updateQuantity = async (productId: number, quantity: number, size?: string) => {
    const token = getTokenFromStorage();
    if (!token) return;

    if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity <= 0 || quantity > 10) {
      alert('Données invalides');
      return;
    }

    const sizeKey = size ?? undefined;
    const otherItemsTotal = items
      .filter(item => !(item.productId === productId && (item.size || undefined) === sizeKey))
      .reduce((sum, item) => sum + item.quantity, 0);
    
    if (otherItemsTotal + quantity > 10) {
      alert('Le panier est limité à 10 articles maximum');
      return;
    }

    try {
      const body: { quantity: number; size?: string } = { quantity };
      if (size) body.size = size;
      const response = await fetch(`${API_URL}/api/cart/${productId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      if (response.ok) {
        const data = await safeJsonResponse(response, { items: [] });
        if (data.items && Array.isArray(data.items)) {
          setItems(data.items);
          window.dispatchEvent(new Event('cartUpdated'));
        }
      }
    } catch (error) {
      console.error('Erreur lors de la mise à jour du panier:', error);
    }
  };

  const removeFromCart = async (productId: number, size?: string) => {
    const token = getTokenFromStorage();
    if (!token) return;

    if (!Number.isInteger(productId) || productId <= 0) {
      return;
    }

    try {
      const url = size ? `${API_URL}/api/cart/${productId}?size=${encodeURIComponent(size)}` : `${API_URL}/api/cart/${productId}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await safeJsonResponse(response, { items: [] });
        if (data.items && Array.isArray(data.items)) {
          setItems(data.items);
          window.dispatchEvent(new Event('cartUpdated'));
        }
      }
    } catch (error) {
      console.error('Erreur lors de la suppression du panier:', error);
    }
  };

  return { items, loading, addToCart, updateQuantity, removeFromCart, refreshCart: fetchCart };
}

