import { useState, useEffect } from 'react';
import { getTokenFromStorage, safeJsonResponse } from '../utils/security';

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';

interface CartItem {
  productId: number;
  quantity: number;
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
    
    try {
      const response = await fetch(`${API_URL}/api/cart`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await safeJsonResponse(response, []);
        if (Array.isArray(data)) {
          setItems(data);
        }
      }
    } catch (error) {
      console.error('Erreur lors de la récupération du panier:', error);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = async (productId: number, quantity: number = 1) => {
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
      const response = await fetch(`${API_URL}/api/cart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ productId, quantity })
      });
      if (response.ok) {
        const data = await safeJsonResponse(response, { items: [] });
        if (data.items && Array.isArray(data.items)) {
          setItems(data.items);
          window.dispatchEvent(new Event('cartUpdated'));
        }
      }
    } catch (error) {
      console.error('Erreur lors de l\'ajout au panier:', error);
    }
  };

  const updateQuantity = async (productId: number, quantity: number) => {
    const token = getTokenFromStorage();
    if (!token) return;

    if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity <= 0 || quantity > 10) {
      alert('Données invalides');
      return;
    }

    const otherItemsTotal = items
      .filter(item => item.productId !== productId)
      .reduce((sum, item) => sum + item.quantity, 0);
    
    if (otherItemsTotal + quantity > 10) {
      alert('Le panier est limité à 10 articles maximum');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/cart/${productId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ quantity })
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

  const removeFromCart = async (productId: number) => {
    const token = getTokenFromStorage();
    if (!token) return;

    if (!Number.isInteger(productId) || productId <= 0) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/cart/${productId}`, {
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

