import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Lock, MapPin, CreditCard, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { useProducts } from '../hooks/useProducts';
import { sanitizeInput, sanitizeEmail, sanitizePhone, getTokenFromStorage, safeJsonResponse } from '../utils/security';

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';
const ADRESSE_API = 'https://api-adresse.data.gouv.fr/search';
const SHIPPING_LA_POSTE = 5.9;
const FRAIS_TAUX = 0.019;

interface OrderItem { productId: number; quantity: number; price: number }
interface PaymentOrder {
  id: string;
  total: number;
  items: OrderItem[];
  shippingAddress?: Record<string, unknown>;
  shippingAmount?: number;
  feesAmount?: number;
}

interface AdresseSuggestion {
  label: string;
  city: string;
  postcode: string;
  street?: string;
  housenumber?: string;
}

export default function PaymentPage() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const { products } = useProducts();
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [addressQuery, setAddressQuery] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<AdresseSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
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

  const progressPercent = step === 1 ? 50 : 100;
  const canGoToStep2 =
    shippingAddress.firstName &&
    shippingAddress.lastName &&
    shippingAddress.email &&
    shippingAddress.phone &&
    shippingAddress.address &&
    shippingAddress.postalCode &&
    shippingAddress.city;

  const fetchOrder = useCallback(async () => {
    try {
      const token = getTokenFromStorage();
      if (!token) {
        navigate('/connexion');
        return;
      }
      const response = await fetch(`${API_URL}/api/orders`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const orders = await safeJsonResponse(response, []) as Array<{
          id: string;
          status?: string;
          shippingAddress?: Record<string, string>;
        }>;
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
            setAddressQuery(foundOrder.shippingAddress.address || '');
          }
        } else {
          navigate('/profil?tab=commandes');
        }
      }
    } catch {
      console.error('Erreur chargement commande');
    } finally {
      setLoading(false);
    }
  }, [navigate, orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  useEffect(() => {
    if (!addressQuery.trim() || addressQuery.length < 3) {
      setAddressSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${ADRESSE_API}/?q=${encodeURIComponent(addressQuery)}&limit=6`
        );
        const data = await res.json();
        if (data.features && Array.isArray(data.features)) {
          const list: AdresseSuggestion[] = data.features.map((f: { properties?: Record<string, string> }) => {
            const p = f.properties || {};
            return {
              label: p.label || '',
              city: p.city || '',
              postcode: p.postcode || '',
              street: p.street,
              housenumber: p.housenumber
            };
          });
          setAddressSuggestions(list);
        } else {
          setAddressSuggestions([]);
        }
      } catch {
        setAddressSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [addressQuery]);

  const selectAddress = (s: AdresseSuggestion) => {
    setShippingAddress((prev) => ({
      ...prev,
      address: s.label,
      city: s.city,
      postalCode: s.postcode,
      country: 'France'
    }));
    setAddressQuery(s.label);
    setShowSuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      setStep(2);
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const token = getTokenFromStorage();
      if (!token) {
        setError('Session expirée.');
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
          paymentMethod: 'stripe',
          shippingAddress
        })
      });
      if (!response.ok) {
        const data = await safeJsonResponse(response, { error: 'Erreur paiement' });
        throw new Error(data.error || 'Erreur lors du paiement');
      }
      navigate('/profil?tab=commandes');
    } catch (err) {
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f4ef]">
        <p className="text-gray-600">Chargement...</p>
      </div>
    );
  }

  if (!order) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8f4ef] via-white to-[#e5f2eb] py-10 px-4">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => navigate('/profil?tab=commandes')}
          className="mb-6 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour aux commandes
        </button>

        <h1 className="text-3xl font-light text-gray-900 mb-8">Paiement sécurisé</h1>

        {/* Parcours utilisateur — barre d’étapes */}
        <div className="mb-12">
          <div className="flex items-center justify-between max-w-xl mx-auto">
            <div className="flex flex-col items-center flex-1">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-medium transition-all duration-300 ${
                  step >= 1 ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-500'
                }`}
              >
                {step > 1 ? <Check className="w-6 h-6" /> : '1'}
              </div>
              <span className={`mt-2 text-sm font-medium ${step >= 1 ? 'text-gray-900' : 'text-gray-400'}`}>
                Adresse
              </span>
            </div>
            <div className="flex-1 h-1 mx-2 rounded-full bg-gray-200 overflow-hidden" style={{ maxWidth: '120px' }}>
              <div
                className="h-full bg-gray-900 rounded-full transition-all duration-500 ease-out"
                style={{ width: step >= 2 ? '100%' : '0%' }}
              />
            </div>
            <div className="flex flex-col items-center flex-1">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-medium transition-all duration-300 ${
                  step >= 2 ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-500'
                }`}
              >
                {step >= 2 ? '2' : ''}
              </div>
              <span className={`mt-2 text-sm font-medium ${step >= 2 ? 'text-gray-900' : 'text-gray-400'}`}>
                Paiement
              </span>
            </div>
          </div>
          <div className="mt-4 text-center">
            <span className="text-sm text-gray-500">Étape {step} sur 2</span>
            <div className="mt-2 h-1.5 w-full max-w-xs mx-auto bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#f2dedd] to-[#e5f2eb] rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-sm">
                  {error}
                </div>
              )}

              {step === 1 ? (
                <>
                  <div className="bg-white rounded-3xl shadow-lg border border-black/5 p-6 md:p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center">
                        <MapPin className="w-5 h-5 text-white" />
                      </div>
                      <h2 className="text-xl font-light text-gray-900">Adresse de livraison (France)</h2>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Prénom *</label>
                        <input
                          type="text"
                          required
                          value={shippingAddress.firstName}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, firstName: sanitizeInput(e.target.value).slice(0, 50) })}
                          className="w-full px-4 py-3 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                        <input
                          type="text"
                          required
                          value={shippingAddress.lastName}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, lastName: sanitizeInput(e.target.value).slice(0, 50) })}
                          className="w-full px-4 py-3 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                      <input
                        type="email"
                        required
                        value={shippingAddress.email}
                        onChange={(e) => setShippingAddress({ ...shippingAddress, email: sanitizeEmail(e.target.value) || e.target.value.slice(0, 255) })}
                        className="w-full px-4 py-3 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      />
                    </div>

                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone *</label>
                      <input
                        type="tel"
                        required
                        value={shippingAddress.phone}
                        onChange={(e) => setShippingAddress({ ...shippingAddress, phone: sanitizePhone(e.target.value).slice(0, 10) })}
                        maxLength={10}
                        pattern="[0-9]{10}"
                        className="w-full px-4 py-3 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 mt-1">10 chiffres</p>
                    </div>

                    <div className="mt-4 relative">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Adresse *</label>
                      <input
                        type="text"
                        required
                        value={addressQuery}
                        onChange={(e) => {
                          setAddressQuery(e.target.value);
                          setShippingAddress((prev) => ({ ...prev, address: e.target.value }));
                          setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(addressSuggestions.length > 0)}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        placeholder="Commencez à taper une adresse..."
                        className="w-full px-4 py-3 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      />
                      {showSuggestions && addressSuggestions.length > 0 && (
                        <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
                          {addressSuggestions.map((s, i) => (
                            <li key={i}>
                              <button
                                type="button"
                                onClick={() => selectAddress(s)}
                                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors text-sm"
                              >
                                {s.label}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Code postal *</label>
                        <input
                          type="text"
                          required
                          value={shippingAddress.postalCode}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, postalCode: sanitizeInput(e.target.value).slice(0, 10) })}
                          className="w-full px-4 py-3 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Ville *</label>
                        <input
                          type="text"
                          required
                          value={shippingAddress.city}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, city: sanitizeInput(e.target.value).slice(0, 100) })}
                          className="w-full px-4 py-3 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Pays</label>
                      <input
                        type="text"
                        value={shippingAddress.country}
                        readOnly
                        className="w-full px-4 py-3 border border-gray-200 rounded-2xl bg-gray-50 text-gray-600"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={!canGoToStep2}
                    className="w-full py-4 rounded-2xl bg-gray-900 text-white font-medium flex items-center justify-center gap-2 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Continuer vers le paiement
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </>
              ) : (
                <>
                  <div className="bg-white rounded-3xl shadow-lg border border-black/5 p-6 md:p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-white" />
                      </div>
                      <h2 className="text-xl font-light text-gray-900">Paiement sécurisé (Stripe)</h2>
                    </div>

                    {/* Placeholder Stripe — à connecter avec vos clés (VITE_STRIPE_PUBLISHABLE_KEY) */}
                    <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-8 text-center">
                      <Lock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-700 font-medium mb-2">Paiement par carte (Stripe)</p>
                      <p className="text-sm text-gray-500 mb-6">
                        Configurez <code className="bg-gray-200 px-1 rounded">VITE_STRIPE_PUBLISHABLE_KEY</code> dans votre projet et connectez le backend Stripe pour activer le paiement. Le formulaire carte Stripe s&apos;affichera ici.
                      </p>
                      <p className="text-lg font-light text-gray-900">Total à payer : <strong>{order.total.toFixed(2)} €</strong></p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="flex-1 py-4 rounded-2xl border border-gray-200 font-medium flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
                    >
                      <ArrowLeft className="w-5 h-5" />
                      Retour
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 py-4 rounded-2xl bg-gray-900 text-white font-medium flex items-center justify-center gap-2 hover:bg-gray-800 disabled:opacity-50 transition-colors"
                    >
                      <Lock className="w-5 h-5" />
                      {submitting ? 'Traitement...' : `Payer ${order.total.toFixed(2)} €`}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>

          <div>
            <div className="bg-white rounded-3xl shadow-lg border border-black/5 p-6 sticky top-8">
              <h2 className="text-xl font-light text-gray-900 mb-4">Récapitulatif</h2>
              <div className="space-y-3 mb-4">
                {order.items.map((item: OrderItem, idx: number) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span>{getProductName(item.productId)} x{item.quantity}</span>
                    <span>{(item.price * item.quantity).toFixed(2)} €</span>
                  </div>
                ))}
              </div>
              {/* Toujours afficher le détail des frais (livraison + TVA/frais) */}
              {(() => {
                const subtotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
                const shipping = typeof order.shippingAmount === 'number' && order.shippingAmount >= 0
                  ? order.shippingAmount
                  : SHIPPING_LA_POSTE;
                const beforeFees = subtotal + shipping;
                const fees = typeof order.feesAmount === 'number' && order.feesAmount >= 0
                  ? order.feesAmount
                  : Math.round(beforeFees * FRAIS_TAUX * 100) / 100;
                return (
                  <div className="space-y-2 mb-4 text-sm text-gray-600 border-t border-gray-200 pt-4">
                    <div className="flex justify-between">
                      <span>Sous-total</span>
                      <span>{subtotal.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Livraison (La Poste)</span>
                      <span>{shipping.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between">
                      <span>TVA et frais applicables (1,9 %)</span>
                      <span>{fees.toFixed(2)} €</span>
                    </div>
                  </div>
                );
              })()}
              {step === 2 && shippingAddress.address && (
                <div className="border-t border-gray-200 pt-4 mb-4">
                  <h3 className="text-sm font-medium text-gray-900 mb-2">Livraison</h3>
                  <p className="text-sm text-gray-600">
                    {shippingAddress.address}<br />
                    {shippingAddress.postalCode} {shippingAddress.city}<br />
                    {shippingAddress.country}
                  </p>
                </div>
              )}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex justify-between text-lg font-medium text-gray-900">
                  <span>Total</span>
                  <span>{order.total.toFixed(2)} €</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
