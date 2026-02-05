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
  briefDescription?: string;
}

import { safeJsonResponse } from '../utils/security';

const API_URL = import.meta.env.VITE_API_URL || '';

export async function fetchProducts(): Promise<Product[]> {
  try {
    const response = await fetch(`${API_URL}/api/products`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Erreur lors de la récupération des produits');
    }
    const products = await safeJsonResponse(response, []);
    return products.map((p: Record<string, unknown>) => ({
      id: (p.id ?? p._id) as number,
      name: p.name as string,
      price: p.price as number,
      image: p.image as string,
      secondImage: p.secondImage as string | undefined,
      additionalImages: (p.additionalImages as string[] | undefined) || [],
      category: p.category as ProductCategory,
      collection: p.collection as string,
      color: p.color as string | string[],
      sizes: (p.sizes as string[]) || [],
      isNew: (p.isNew as boolean) || false,
      briefDescription: (p.briefDescription as string) || undefined
    }));
  } catch (err) {
    console.error('Erreur lors du chargement des produits:', err);
    return [];
  }
}
