import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useProducts } from '../hooks/useProducts';
import { sanitizeInput, sanitizeEmail, sanitizePhone, getTokenFromStorage, safeJsonResponse } from '../utils/security';

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';

interface OrderItem { productId: number; quantity: number; price: number }
interface PaymentOrder {
  id: string;
  total: number;
  items: OrderItem[];
  shippingAddress?: Record<string, unknown>;
  promoCode?: { code?: string; discountAmount?: number };
  originalTotal?: number;
}

export default function PaymentPage() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const { products } = useProducts();
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [paymentData, setPaymentData] = useState({
    paymentMethod: 'card',
    cardNumber: '',
    expiryDate: '',
    cvv: '',
    cardholderName: ''
  });
  const [shippingAddress, setShippingAddress] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    postalCode: '',
    country: 'France'
  });

  useEffect(() => {
    fetchOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const fetchOrder = async () => {
    try {
      const token = getTokenFromStorage();
      if (!token) {
        navigate('/connexion');
        return;
      }
      
      const response = await fetch(`${API_URL}/api/orders`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const orders = await safeJsonResponse(response, []) as Array<{ id: string; status?: string; shippingAddress?: { firstName?: string; lastName?: string; email?: string; phone?: string; address?: string; city?: string; postalCode?: string; country?: string } }>;
        const foundOrder = orders.find((o) => o.id === orderId);
        if (foundOrder) {
          if (foundOrder.status !== 'validated') {
            navigate('/profil?tab=commandes');
            return;
          }
          setOrder(foundOrder);
          if (foundOrder.shippingAddress) {
            setShippingAddress({
              firstName: foundOrder.shippingAddress.firstName || '',
              lastName: foundOrder.shippingAddress.lastName || '',
              email: foundOrder.shippingAddress.email || '',
              phone: foundOrder.shippingAddress.phone || '',
              address: foundOrder.shippingAddress.address || '',
              city: foundOrder.shippingAddress.city || '',
              postalCode: foundOrder.shippingAddress.postalCode || '',
              country: foundOrder.shippingAddress.country || 'France'
            });
          }
        } else {
          navigate('/profil?tab=commandes');
        }
      }
    } catch {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const token = getTokenFromStorage();
      if (!token) {
        setError('Session expirée. Veuillez vous reconnecter.');
        navigate('/connexion');
        return;
      }
      
      const response = await fetch(`${API_URL}/api/orders/${orderId}/payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...paymentData,
          shippingAddress
        })
      });

      if (!response.ok) {
        const data = await safeJsonResponse(response, { error: 'Erreur lors du paiement' });
        throw new Error(data.error || 'Erreur lors du paiement');
      }

      navigate('/profil?tab=commandes');
    } catch {
      setError(err instanceof Error ? err.message : 'Erreur lors du paiement');
    } finally {
      setSubmitting(false);
    }
  };

  const getProductName = (productId: number) => {
    const product = products.find(p => p.id === productId);
    return product ? product.name : `Produit #${productId}`;
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Chargement...</div>;
  }

  if (!order) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-light text-gray-900 mb-8">Paiement</h1>

        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-xl font-light mb-6">Adresse de livraison</h2>
            <div className="mb-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prénom *</label>
                  <input
                    type="text"
                    required
                    value={shippingAddress.firstName}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, firstName: sanitizeInput(e.target.value).slice(0, 50) })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                  <input
                    type="text"
                    required
                    value={shippingAddress.lastName}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, lastName: sanitizeInput(e.target.value).slice(0, 50) })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={shippingAddress.email}
                    onChange={(e) => {
                      const sanitized = sanitizeEmail(e.target.value) || e.target.value.slice(0, 255);
                      setShippingAddress({ ...shippingAddress, email: sanitized });
                    }}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone *</label>
                <input
                  type="tel"
                  required
                  value={shippingAddress.phone}
                    onChange={(e) => {
                      const value = sanitizePhone(e.target.value).slice(0, 10);
                      setShippingAddress({ ...shippingAddress, phone: value });
                    }}
                  maxLength={10}
                  pattern="[0-9]{10}"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                />
                <p className="text-xs text-gray-500 mt-1">10 chiffres maximum</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Adresse *</label>
                <input
                  type="text"
                  required
                  value={shippingAddress.address}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, address: sanitizeInput(e.target.value).slice(0, 200) })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code postal *</label>
                  <input
                    type="text"
                    required
                    value={shippingAddress.postalCode}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, postalCode: sanitizeInput(e.target.value).slice(0, 10) })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ville *</label>
                  <input
                    type="text"
                    required
                    value={shippingAddress.city}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, city: sanitizeInput(e.target.value).slice(0, 100) })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pays *</label>
                <input
                  type="text"
                  required
                  value={shippingAddress.country}
                    onChange={(e) => setShippingAddress({ ...shippingAddress, country: sanitizeInput(e.target.value).slice(0, 100) })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                />
              </div>
            </div>
            <h2 className="text-xl font-light mb-6 mt-8">Informations de paiement</h2>
            {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Méthode de paiement *</label>
                <select
                  value={paymentData.paymentMethod}
                  onChange={(e) => setPaymentData({ ...paymentData, paymentMethod: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                >
                  <option value="card">Carte bancaire</option>
                  <option value="paypal">PayPal</option>
                </select>
              </div>
              {paymentData.paymentMethod === 'card' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Numéro de carte *</label>
                    <input
                      type="text"
                      required
                      value={paymentData.cardNumber}
                      onChange={(e) => setPaymentData({ ...paymentData, cardNumber: e.target.value.replace(/\D/g, '').slice(0, 19) })}
                      placeholder="1234 5678 9012 3456"
                      maxLength={16}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date d'expiration *</label>
                      <input
                        type="text"
                        required
                        value={paymentData.expiryDate}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                          const formatted = value.length >= 2 ? `${value.slice(0, 2)}/${value.slice(2)}` : value;
                          setPaymentData({ ...paymentData, expiryDate: formatted });
                        }}
                        placeholder="MM/AA"
                        maxLength={5}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">CVV *</label>
                      <input
                        type="text"
                        required
                        value={paymentData.cvv}
                        onChange={(e) => setPaymentData({ ...paymentData, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                        placeholder="123"
                        maxLength={4}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nom sur la carte *</label>
                    <input
                      type="text"
                      required
                      value={paymentData.cardholderName}
                      onChange={(e) => setPaymentData({ ...paymentData, cardholderName: sanitizeInput(e.target.value).slice(0, 100) })}
                      placeholder="Jean Dupont"
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                    />
                  </div>
                </>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-3 rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                <Lock className="w-4 h-4" />
                {submitting ? 'Traitement...' : `Payer ${order.total.toFixed(2)}€`}
              </button>
            </form>
          </div>
          <div>
            <h2 className="text-xl font-light mb-6">Récapitulatif</h2>
            <div className="bg-white rounded-lg p-6 space-y-6">
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Produits</h3>
                <div className="space-y-2">
                  {order.items.map((item: OrderItem, idx: number) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span>{getProductName(item.productId)} x{item.quantity}</span>
                      <span>{(item.price * item.quantity).toFixed(2)}€</span>
                    </div>
                  ))}
                </div>
              </div>
              {order.shippingAddress && (
                <div className="border-t pt-4">
                  <h3 className="font-medium text-gray-900 mb-3">Adresse de livraison</h3>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>{order.shippingAddress.firstName} {order.shippingAddress.lastName}</p>
                    <p>{order.shippingAddress.email}</p>
                    <p>{order.shippingAddress.phone}</p>
                    {order.shippingAddress.address && (
                      <>
                        <p>{order.shippingAddress.address}</p>
                        <p>{order.shippingAddress.postalCode} {order.shippingAddress.city}</p>
                        <p>{order.shippingAddress.country}</p>
                      </>
                    )}
                  </div>
                </div>
              )}
              {order.promoCode && (
                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Sous-total</span>
                    <span>{(order.originalTotal ?? order.total).toFixed(2)}€</span>
                  </div>
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Réduction ({order.promoCode.code ?? String(order.promoCode)})</span>
                    <span>-{(order.promoCode.discountAmount ?? 0).toFixed(2)}€</span>
                  </div>
                </div>
              )}
              <div className="border-t pt-4">
                <div className="flex justify-between text-lg font-medium">
                  <span>Total</span>
                  <span>{order.total.toFixed(2)}€</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

