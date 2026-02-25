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
  surcharge1m20?: number | null;
  surchargeSurMesure?: number | null;
  stock?: number;
  isNew?: boolean;
  briefDescription?: string;
}

import { safeJsonResponse } from '../utils/security';

const API_URL = import.meta.env.VITE_API_URL || '';

const productsCache: { data: Product[] | null; expires: number } = { data: null, expires: 0 };
const CACHE_TTL_MS = 60_000;

export function getCachedProducts(): Product[] | null {
  if (productsCache.data && productsCache.expires > Date.now()) {
    return productsCache.data;
  }
  return null;
}

export async function fetchProducts(): Promise<Product[]> {
  const now = Date.now();
  if (productsCache.data && productsCache.expires > now) {
    return productsCache.data;
  }
  try {
    const response = await fetch(`${API_URL}/api/products`);
    if (!response.ok) {
      throw new Error('Erreur lors de la récupération des produits');
    }
    const products = await safeJsonResponse(response, []);
    const mapped = products.map((p: Record<string, unknown>) => ({
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
      surcharge1m20: (p.surcharge1m20 as number | null | undefined) ?? null,
      surchargeSurMesure: (p.surchargeSurMesure as number | null | undefined) ?? null,
      isNew: (p.isNew as boolean) || false,
      briefDescription: (p.briefDescription as string) || undefined
    }));
    productsCache.data = mapped;
    productsCache.expires = now + CACHE_TTL_MS;
    return mapped;
  } catch (err) {
    console.error('Erreur lors du chargement des produits:', err);
    return [];
  }
}
