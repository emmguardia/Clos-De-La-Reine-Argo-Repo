import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../hooks/useCart';
import { useProducts } from '../hooks/useProducts';
import { Trash2, Plus, Minus } from 'lucide-react';

export default function CartPage() {
  const navigate = useNavigate();
  const { items, loading, updateQuantity, removeFromCart } = useCart();
  const { products } = useProducts();

  const cartProducts = items.map(item => {
    const product = products.find(p => p.id === item.productId);
    return product ? { ...product, quantity: item.quantity } : null;
  }).filter(Boolean) as Array<{ id: number; name: string; price: number; image: string; quantity: number }>;

  const total = cartProducts.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#f8f4ef] via-white to-[#e5f2eb] flex items-center justify-center">
        <p className="text-gray-600">Chargement du panier...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8f4ef] via-white to-[#e5f2eb]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-10">
        <div className="space-y-3 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#e5f2eb] text-2xl">🧺</div>
          <h1 className="text-3xl sm:text-4xl font-light text-gray-900">Votre panier</h1>
        </div>
        {cartProducts.length === 0 ? (
          <div className="rounded-[28px] border border-black/5 bg-white/80 backdrop-blur-sm p-10 text-center shadow-sm">
            <p className="text-lg text-gray-700">Panier vide.</p>
            <p className="text-sm text-gray-500 mt-2">Explorez nos sélections pour remplir votre panier.</p>
            <div className="flex justify-center gap-3 mt-6">
              <Link
                to="/boutique?category=colliers"
                className="px-5 py-3 rounded-full bg-gray-900 text-white text-sm hover:bg-gray-800 transition-colors"
              >
                Colliers
              </Link>
              <Link
                to="/boutique?category=laisses"
                className="px-5 py-3 rounded-full bg-white text-gray-900 border border-black/10 text-sm hover:border-gray-900 transition-colors"
              >
                Laisses
              </Link>
              <Link
                to="/boutique?category=harnais"
                className="px-5 py-3 rounded-full bg-white text-gray-900 border border-black/10 text-sm hover:border-gray-900 transition-colors"
              >
                Harnais
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-black/5 shadow-sm p-6 space-y-4">
              {cartProducts.map(item => (
                <div key={item.id} className="flex gap-4 pb-4 border-b border-gray-100 last:border-0 last:pb-0">
                  <img src={item.image} alt={item.name} className="w-20 h-20 object-cover rounded-lg" />
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">{item.name}</h3>
                    <p className="text-sm text-gray-600">{item.price}€</p>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center">{item.quantity}</span>
                      <button
                        onClick={() => {
                          const totalItems = cartProducts.reduce((sum, p) => sum + (p.id === item.id ? 0 : p.quantity), 0);
                          if (totalItems + item.quantity + 1 > 10) {
                            alert('Le panier est limité à 10 articles maximum');
                            return;
                          }
                          updateQuantity(item.id, item.quantity + 1);
                        }}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col items-end justify-between">
                    <p className="font-medium">{item.price * item.quantity}€</p>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="pt-4 border-t border-gray-200">
                <div className="flex justify-between text-lg font-medium mb-4">
                  <span>Total</span>
                  <span>{total.toFixed(2)}€</span>
                </div>
                <button
                  onClick={() => navigate('/checkout')}
                  className="w-full bg-gray-900 text-white py-3 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Passer la commande
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
