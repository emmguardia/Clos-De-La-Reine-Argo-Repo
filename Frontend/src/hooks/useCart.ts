import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTokenFromStorage, safeJsonResponse } from '../utils/security';

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';

export interface CartItem {
  productId: number;
  quantity: number;
  size?: string;
}

export function useCart() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(() => !!getTokenFromStorage());
  // Chaque instance du hook a sa propre promise — évite les race conditions
  // entre Header et CartPage qui utilisent tous les deux useCart.
  const fetchPromiseRef = useRef<Promise<CartItem[]> | null>(null);

  const fetchCart = async () => {
    if (!getTokenFromStorage()) return;

    const doFetch = async (): Promise<CartItem[]> => {
      const response = await fetch(`${API_URL}/api/cart`, {
        credentials: 'include'
      });
      const data = await safeJsonResponse(response, []);
      return Array.isArray(data) ? data : [];
    };

    try {
      if (!fetchPromiseRef.current) {
        fetchPromiseRef.current = doFetch();
      }
      const data = await fetchPromiseRef.current;
      setItems(data);
    } catch (error) {
      console.error('Erreur lors de la récupération du panier:', error);
    } finally {
      fetchPromiseRef.current = null;
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!getTokenFromStorage()) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCart();
  }, []);

  const addToCart = async (productId: number, quantity: number = 1, size?: string, productName?: string) => {
    if (!getTokenFromStorage()) {
      navigate('/connexion');
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
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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
    if (!getTokenFromStorage()) return;

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
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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
    if (!getTokenFromStorage()) return;

    if (!Number.isInteger(productId) || productId <= 0) {
      return;
    }

    try {
      const url = size ? `${API_URL}/api/cart/${productId}?size=${encodeURIComponent(size)}` : `${API_URL}/api/cart/${productId}`;
      const response = await fetch(url, {
        method: 'DELETE',
        credentials: 'include'
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

