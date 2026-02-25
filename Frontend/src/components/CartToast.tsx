import { useState, useEffect } from 'react';
import { ShoppingCart, Check } from 'lucide-react';

export default function CartToast() {
  const [visible, setVisible] = useState(false);
  const [productName, setProductName] = useState<string | null>(null);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout>;
    const handleAdded = (e: Event) => {
      const detail = (e as CustomEvent<{ productName?: string }>).detail;
      setProductName(detail?.productName ?? null);
      setVisible(true);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setVisible(false), 2500);
    };
    window.addEventListener('cartItemAdded', handleAdded);
    return () => {
      window.removeEventListener('cartItemAdded', handleAdded);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-slideUp flex items-center gap-3 px-5 py-4 rounded-2xl bg-gray-900 text-white shadow-xl border border-gray-700/50"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-white/20">
        <Check className="w-5 h-5 text-green-300" />
      </div>
      <div>
        <p className="font-medium">Article ajouté au panier</p>
        {productName && <p className="text-sm text-gray-300 truncate max-w-[200px]">{productName}</p>}
      </div>
      <ShoppingCart className="w-5 h-5 text-gray-400" />
    </div>
  );
}
