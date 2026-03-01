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

const mapProduct = (p: Record<string, unknown>): Product => ({
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
  isNew: p.isNew === true || p.isNew === 'true',
  briefDescription: (p.briefDescription as string) || undefined
});

export function invalidateProductsCache(): void {
  productsCache.data = null;
  productsCache.expires = 0;
}

export function getCachedProducts(): Product[] | null {
  if (productsCache.data && productsCache.expires > Date.now()) return productsCache.data;
  return null;
}

const productsCache: { data: Product[] | null; expires: number } = { data: null, expires: 0 };
const CACHE_TTL_MS = 60_000;

export interface ProductsPage {
  products: Product[];
  total: number;
}

export interface ProductsPageWithFilters extends ProductsPage {
  collections?: string[];
  colors?: string[];
}

export async function fetchProductsPaginated(params: {
  page?: number;
  limit?: number;
  category?: string;
  collection?: string;
  color?: string;
  isNew?: boolean;
  includeFilters?: boolean;
}): Promise<ProductsPageWithFilters> {
  const sp = new URLSearchParams();
  sp.set('minimal', '1');
  if (params.page) sp.set('page', String(params.page));
  if (params.limit) sp.set('limit', String(params.limit));
  if (params.category) sp.set('category', params.category);
  if (params.collection) sp.set('collection', params.collection);
  if (params.color) sp.set('color', params.color);
  if (params.isNew) sp.set('isNew', '1');
  if (params.includeFilters) sp.set('includeFilters', '1');
  const response = await fetch(`${API_URL}/api/products?${sp}`);
  if (!response.ok) throw new Error('Erreur lors de la récupération des produits');
  const data = await safeJsonResponse(response, { products: [], total: 0 });
  const products = (data as { products?: unknown[] }).products ?? [];
  const total = (data as { total?: number }).total ?? 0;
  const result: ProductsPageWithFilters = {
    products: (products as Record<string, unknown>[]).map((p) => mapProduct({ ...p, secondImage: undefined, additionalImages: [] })),
    total
  };
  if ((data as { collections?: string[] }).collections) result.collections = (data as { collections?: string[] }).collections;
  if ((data as { colors?: string[] }).colors) result.colors = (data as { colors?: string[] }).colors;
  return result;
}

export async function fetchProductsMinimalPaginated(page = 1, limit = 20, search = ''): Promise<ProductsPage> {
  const sp = new URLSearchParams({ minimal: '1', page: String(page), limit: String(limit) });
  if (search) sp.set('search', search);
  const response = await fetch(`${API_URL}/api/products?${sp}`);
  if (!response.ok) throw new Error('Erreur lors de la récupération des produits');
  const data = await safeJsonResponse(response, { products: [], total: 0 });
  const products = (data as { products?: unknown[] }).products ?? [];
  const total = (data as { total?: number }).total ?? 0;
  return {
    products: (products as Record<string, unknown>[]).map((p) => mapProduct({ ...p, secondImage: undefined, additionalImages: [] })),
    total
  };
}

export async function fetchProductsByIds(ids: number[]): Promise<Product[]> {
  if (ids.length === 0) return [];
  const response = await fetch(`${API_URL}/api/products?minimal=1&ids=${ids.join(',')}`);
  if (!response.ok) return [];
  const data = await safeJsonResponse(response, []);
  const products = Array.isArray(data) ? data : [];
  return products.map((p: Record<string, unknown>) => mapProduct({ ...p, secondImage: undefined, additionalImages: [] }));
}

export async function fetchFeaturedProducts(limit = 4): Promise<Product[]> {
  const { products } = await fetchProductsPaginated({ limit, isNew: true });
  return products;
}

export async function fetchProductIds(): Promise<number[]> {
  const response = await fetch(`${API_URL}/api/products/ids`);
  if (!response.ok) return [];
  const data = await safeJsonResponse(response, { ids: [] });
  return (data as { ids?: number[] }).ids ?? [];
}

export async function fetchProductById(id: number): Promise<Product | null> {
  try {
    const response = await fetch(`${API_URL}/api/products/${id}`);
    if (!response.ok) return null;
    const p = await safeJsonResponse(response, null) as Record<string, unknown> | null;
    if (!p) return null;
    const cat = p.category as string;
    const sizes = (p.sizes as string[] | undefined)?.length ? (p.sizes as string[]) : (cat === 'laisses' ? ['1m', '1m20'] : ['XS', 'S', 'M', 'L', 'XL']);
    return mapProduct({ ...p, sizes });
  } catch (err) {
    console.error('Erreur fetchProductById:', err);
    return null;
  }
}

/** @deprecated Utiliser fetchProductsPaginated ou fetchProductsByIds selon le cas */
export async function fetchProductsMinimal(): Promise<Product[]> {
  const { products } = await fetchProductsMinimalPaginated(1, 500);
  return products;
}

/** @deprecated Utiliser fetchProductsPaginated pour la boutique */
export async function fetchProducts(): Promise<Product[]> {
  const now = Date.now();
  if (productsCache.data && productsCache.expires > now) return productsCache.data;
  const { products } = await fetchProductsPaginated({ page: 1, limit: 100 });
  productsCache.data = products;
  productsCache.expires = now + CACHE_TTL_MS;
  return products;
}
