import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Lock, MapPin, CreditCard, ArrowRight, ArrowLeft, Package, CheckCircle, Truck } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useProducts } from '../hooks/useProducts';
import { sanitizeInput, sanitizeEmail, sanitizePhone, getTokenFromStorage, safeJsonResponse } from '../utils/security';

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';
const ADRESSE_API = 'https://api-adresse.data.gouv.fr/search';
const SHIPPING_LA_POSTE = 5.9;
const FRAIS_TAUX = 0.019;
const STRIPE_PUBLISHABLE_KEY_ENV = import.meta.env?.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

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

function StripePaymentForm({
  orderId,
  clientSecret,
  shippingAddress,
  total,
  onConfirmSuccess,
  onError
}: {
  orderId: string;
  clientSecret: string;
  shippingAddress: Record<string, string>;
  total: number;
  onConfirmSuccess: (paymentIntentId: string) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    onError('');
    try {
      try {
        sessionStorage.setItem(`payment_address_${orderId}`, JSON.stringify(shippingAddress));
        sessionStorage.setItem(`stripe_redirect_${orderId}`, Date.now().toString());
      } catch {
        /* ignore */
      }
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/commande/${orderId}/paiement`,
          receipt_email: shippingAddress.email || undefined
        }
      });
      if (error) {
        onError(error.message || 'Paiement refusé');
        return;
      }
      const paymentIntentId = clientSecret.split('_secret_')[0];
      if (paymentIntentId) {
        await onConfirmSuccess(paymentIntentId);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erreur paiement');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement options={{ layout: 'tabs' }} />
      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="flex-1 py-4 rounded-2xl border border-gray-200 font-medium flex items-center justify-center gap-2 hover:bg-gray-50"
        >
          <ArrowLeft className="w-5 h-5" />
          Retour
        </button>
        <button
          type="submit"
          disabled={submitting || !stripe}
          className="flex-1 py-4 rounded-2xl bg-gray-900 text-white font-medium flex items-center justify-center gap-2 hover:bg-gray-800 disabled:opacity-50"
        >
          <Lock className="w-5 h-5" />
          {submitting ? 'Traitement...' : `Payer ${total.toFixed(2)} €`}
        </button>
      </div>
    </form>
  );
}

export default function PaymentPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { orderId } = useParams();
  const { products } = useProducts();
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
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
  const [stripePublishableKey, setStripePublishableKey] = useState<string | null>(null);
  const effectiveStripeKey = (stripePublishableKey !== null ? stripePublishableKey : STRIPE_PUBLISHABLE_KEY_ENV) || undefined;

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
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/config`);
        if (!res.ok || cancelled) return;
        const data = await safeJsonResponse(res, { stripePublishableKey: '' });
        if (!cancelled) setStripePublishableKey(typeof data.stripePublishableKey === 'string' ? data.stripePublishableKey : '');
      } catch {
        if (!cancelled) setStripePublishableKey('');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const [paymentIntentFromHash, setPaymentIntentFromHash] = useState<string | null>(null);
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash?.replace(/^#/, '') : '';
    if (hash) {
      const params = new URLSearchParams(hash);
      const pi = params.get('payment_intent');
      if (pi) setPaymentIntentFromHash(pi);
    }
  }, []);
  const paymentIntentIdFromStorage = useMemo(() => {
    if (!orderId || typeof window === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(`payment_client_secret_${orderId}`);
      if (raw && raw.includes('_secret_')) {
        const id = raw.split('_secret_')[0];
        if (id && id.startsWith('pi_')) return id;
      }
    } catch {
      /* ignore */
    }
    return null;
  }, [orderId]);
  const paymentIntentIdFromUrl = searchParams.get('payment_intent') || paymentIntentFromHash;
  const paymentIntentId = paymentIntentIdFromUrl || paymentIntentIdFromStorage;
  const hasReturnFromStripeFlag = useMemo(() => {
    if (!orderId) return false;
    try {
      const raw = sessionStorage.getItem(`stripe_redirect_${orderId}`);
      if (!raw) return false;
      const t = parseInt(raw, 10);
      if (Number.isNaN(t)) return false;
      return Date.now() - t < 15 * 60 * 1000;
    } catch {
      return false;
    }
  }, [orderId]);
  const isReturnFromStripeRedirect = Boolean(
    paymentIntentIdFromUrl || (paymentIntentIdFromStorage && !clientSecret && hasReturnFromStripeFlag)
  );
  const paymentConfirmationDone = useRef(false);
  useEffect(() => {
    if (!orderId || !paymentIntentId || !isReturnFromStripeRedirect) return;
    const sentKey = `payment_confirm_sent_${orderId}_${paymentIntentId}`;
    try {
      if (sessionStorage.getItem(sentKey)) return;
    } catch {
      /* ignore */
    }
    if (paymentConfirmationDone.current) return;
    paymentConfirmationDone.current = true;
    try {
      sessionStorage.setItem(sentKey, '1');
      sessionStorage.removeItem(`payment_client_secret_${orderId}`);
      sessionStorage.removeItem(`stripe_redirect_${orderId}`);
    } catch {
      /* ignore */
    }
    const token = getTokenFromStorage();
    if (!token) {
      setError('Session expirée. Connectez-vous pour confirmer le paiement.');
      return;
    }
    let ship: Record<string, string> = {};
    try {
      const saved = sessionStorage.getItem(`payment_address_${orderId}`);
      if (saved) {
        ship = JSON.parse(saved) as Record<string, string>;
        sessionStorage.removeItem(`payment_address_${orderId}`);
      }
    } catch {
      /* ignore */
    }
    (async () => {
      try {
        const url = `${API_URL}/api/orders/${orderId}/payment`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ paymentIntentId, shippingAddress: ship })
        });
        if (res.ok) {
          try {
            sessionStorage.removeItem(sentKey);
          } catch {
            /* ignore */
          }
          setSearchParams({});
          navigate(`/commande/${orderId}/merci`);
        } else {
          const data = await safeJsonResponse(res, { error: '' });
          const msg = data.error || 'Erreur lors de la confirmation du paiement.';
          const isCardRefused = /annulé|refusé|refus/.test(msg);
          setError(isCardRefused ? `${msg} Vous pouvez réessayer en cliquant sur « Payer » ci-dessous.` : msg);
          setStep(2);
          setShippingAddress({
            firstName: ship.firstName ?? '',
            lastName: ship.lastName ?? '',
            email: ship.email ?? '',
            phone: ship.phone ?? '',
            address: ship.address ?? '',
            city: ship.city ?? '',
            postalCode: ship.postalCode ?? '',
            country: ship.country ?? 'France'
          });
          setAddressQuery(ship.address ?? '');
          setClientSecret(null);
          try {
            sessionStorage.setItem(`payment_address_${orderId}`, JSON.stringify(ship));
          } catch {
            /* ignore */
          }
        }
      } catch (_err) {
        setError('Impossible de joindre le serveur. Vérifiez votre connexion.');
      }
    })();
  }, [orderId, paymentIntentId, isReturnFromStripeRedirect, navigate, setSearchParams]);

  useEffect(() => {
    if (step !== 2 || !orderId || !effectiveStripeKey || !order) return;
    const token = getTokenFromStorage();
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/orders/${orderId}/create-payment-intent`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok || cancelled) return;
        const data = await safeJsonResponse(res, {});
        if (data.clientSecret) {
          setClientSecret(data.clientSecret);
          try {
            sessionStorage.setItem(`payment_client_secret_${orderId}`, data.clientSecret);
          } catch {
            /* ignore */
          }
        }
      } catch {
        if (!cancelled) setError('Impossible de préparer le paiement.');
      }
    })();
    return () => { cancelled = true; };
  }, [step, orderId, order, effectiveStripeKey]);

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
    if (!effectiveStripeKey || clientSecret) return;
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

  const handlePaymentConfirmed = useCallback(async (paymentIntentId: string) => {
    const token = getTokenFromStorage();
    if (!token || !orderId) return;
    const res = await fetch(`${API_URL}/api/orders/${orderId}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ paymentIntentId, shippingAddress })
    });
    if (res.ok) {
      navigate(`/commande/${orderId}/merci`);
    } else {
      const data = await safeJsonResponse(res, { error: '' });
      setError(data.error || 'Erreur lors de la confirmation du paiement.');
    }
  }, [orderId, shippingAddress, navigate]);

  const stripePromise = useMemo(
    () => (effectiveStripeKey ? loadStripe(effectiveStripeKey) : null),
    [effectiveStripeKey]
  );

  const isReturnFromStripe = isReturnFromStripeRedirect;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f4ef]">
        <p className="text-gray-600">Chargement...</p>
      </div>
    );
  }

  if (isReturnFromStripe && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f4ef]">
        <p className="text-gray-600">Confirmation du paiement en cours...</p>
      </div>
    );
  }

  if (!order) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8f4ef] via-white to-[#e5f2eb] py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => navigate('/profil?tab=commandes')}
          className="mb-8 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour aux commandes
        </button>


        <div className="mb-12 bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl shadow-black/10 p-8 border border-black/5">
          <h1 className="text-3xl font-light text-gray-900 mb-6 text-center">Comment se déroule votre commande ?</h1>
          <div className="grid md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <Package className="w-8 h-8 text-yellow-700" />
              </div>
              <h3 className="font-medium text-gray-900 mb-2">1. Envoi du bon de commande</h3>
              <p className="text-sm text-gray-600">Vous envoyez votre commande avec vos informations</p>
            </div>
            <div className="text-center">
              <div className="bg-blue-50 border-2 border-blue-200 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-blue-700" />
              </div>
              <h3 className="font-medium text-gray-900 mb-2">2. Validation par Joanne</h3>
              <p className="text-sm text-gray-600">Joanne vérifie qu'elle peut fabriquer votre commande</p>
            </div>
            <div className="text-center">
              <div className="bg-purple-50 border-2 border-purple-200 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <CreditCard className="w-8 h-8 text-purple-700" />
              </div>
              <h3 className="font-medium text-gray-900 mb-2">3. Paiement</h3>
              <p className="text-sm text-gray-600">Une fois validée, vous procédez au paiement</p>
            </div>
            <div className="text-center">
              <div className="bg-green-50 border-2 border-green-200 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <Truck className="w-8 h-8 text-green-700" />
              </div>
              <h3 className="font-medium text-gray-900 mb-2">4. Fabrication & Envoi</h3>
              <p className="text-sm text-gray-600">Votre produit est fabriqué puis expédié</p>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2">
            <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl shadow-black/10 p-8 border border-black/5">
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-gray-700">Étape {step} sur 2</span>
                  <span className="text-sm text-gray-500">{progressPercent}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-[#f2dedd] to-[#e5f2eb] h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
              {step === 1 ? (
                <>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="bg-gray-900 rounded-full w-10 h-10 flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-white" />
                    </div>
                    <h2 className="text-2xl font-light text-gray-900">Adresse de livraison (France)</h2>
                  </div>

                  <div className="space-y-4">

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
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center">
                      <CreditCard className="w-5 h-5 text-white" />
                    </div>
                    <h2 className="text-2xl font-light text-gray-900">Paiement sécurisé (Stripe)</h2>
                  </div>

                  {effectiveStripeKey && clientSecret ? (
                      <Elements
                        stripe={stripePromise}
                        options={{ clientSecret, appearance: { theme: 'stripe', variables: { borderRadius: '12px' } } }}
                      >
                        <StripePaymentForm
                          orderId={orderId!}
                          clientSecret={clientSecret}
                          shippingAddress={shippingAddress}
                          total={order.total}
                          onConfirmSuccess={handlePaymentConfirmed}
                          onError={setError}
                        />
                        {effectiveStripeKey.startsWith('pk_test_') && (
                          <p className="mt-4 text-xs text-gray-500">
                            Carte de test Stripe : <strong>4242 4242 4242 4242</strong> — date d&apos;expiration future, CVC 3 chiffres, code postal quelconque. Si une fenêtre 3D Secure s&apos;ouvre, validez-la jusqu&apos;au bout.
                          </p>
                        )}
                      </Elements>
                    ) : effectiveStripeKey && step === 2 ? (
                      <div className="rounded-2xl border border-gray-200 bg-gray-50/50 p-8 text-center">
                        <p className="text-gray-600">Préparation du paiement...</p>
                      </div>
                    ) : (
                      <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-8 text-center">
                        <Lock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-700 font-medium mb-2">Paiement par carte (Stripe)</p>
                        <p className="text-sm text-gray-500 mb-4">
                          En dev : <code className="bg-gray-200 px-1 rounded">Frontend/.env</code> avec <strong>VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...</strong>. En prod : le backend expose la clé via <strong>GET /api/config</strong> (ConfigMap/Secret K8s).
                        </p>
                        <p className="text-xs text-gray-500 mb-4">Voir <strong>STRIPE.md</strong> à la racine du projet pour les emplacements des clés.</p>
                        <p className="text-lg font-light text-gray-900">Total à payer : <strong>{order.total.toFixed(2)} €</strong></p>
                      </div>
                    )}

                  {!(effectiveStripeKey && clientSecret) && (
                    <div className="flex gap-4 mt-6">
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="flex-1 py-4 rounded-2xl border border-gray-200 font-medium flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
                      >
                        <ArrowLeft className="w-5 h-5" />
                        Retour
                      </button>
                      {!effectiveStripeKey && (
                        <button
                          type="submit"
                          disabled={submitting}
                          className="flex-1 py-4 rounded-2xl bg-gray-900 text-white font-medium flex items-center justify-center gap-2 hover:bg-gray-800 disabled:opacity-50 transition-colors"
                        >
                          <Lock className="w-5 h-5" />
                          {submitting ? 'Traitement...' : `Payer ${order.total.toFixed(2)} €`}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </form>
            </div>
          </div>

          <div className="flex-shrink-0 w-[320px]">
            <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl shadow-black/10 p-6 border border-black/5 sticky top-8">
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
