import { useState, useEffect, useCallback } from 'react';
import { fetchProductsMinimalPaginated, type Product } from '../data/products';

const PRODUCTS_PER_PAGE = 6;

export function useProductsForAdmin(searchTerm = '') {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const { products: data, total: t } = await fetchProductsMinimalPaginated(p, PRODUCTS_PER_PAGE, searchTerm);
      setProducts(data);
      setTotal(t);
      setPage(p);
    } catch {
      setProducts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    refetch(1);
  }, [refetch]);

  const goToPage = useCallback((p: number) => {
    refetch(p);
  }, [refetch]);

  const totalPages = Math.ceil(total / PRODUCTS_PER_PAGE);

  return { products, total, page, totalPages, loading, refetch: () => refetch(page), goToPage };
}
