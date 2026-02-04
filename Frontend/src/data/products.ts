export type ProductCategory = 'colliers' | 'laisses' | 'harnais';
export interface Product {
  id: number;
  name: string;
  price: number;
  image: string;
  secondImage?: string; 
  additionalImages?: string[]; 
  category: ProductCategory;
  collection: string;
  color: string | string[]; 
  sizes: string[];
  stock?: number;
  isNew?: boolean;
}

import { safeJsonResponse } from '../utils/security';

const API_URL = import.meta.env.VITE_API_URL || '';

export async function fetchProducts(): Promise<Product[]> {
  try {
    const response = await fetch(`${API_URL}/api/products`);
    if (!response.ok) {
      throw new Error('Erreur lors de la récupération des produits');
    }
    const products = await safeJsonResponse(response, []);
    return products.map((p: any) => ({
      id: p.id || p._id,
      name: p.name,
      price: p.price,
      image: p.image,
      secondImage: p.secondImage,
      additionalImages: p.additionalImages || [],
      category: p.category,
      collection: p.collection,
      color: p.color,
      sizes: p.sizes,
      isNew: p.isNew || false
    }));
  } catch (error) {
    console.error('Erreur lors du chargement des produits:', error);
    return [];
  }
}
