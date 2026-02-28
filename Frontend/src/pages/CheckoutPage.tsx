import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../hooks/useCart';
import { useProducts } from '../hooks/useProducts';
import { ArrowLeft, CheckCircle, Package, CreditCard, Truck, User, Heart, ArrowRight } from 'lucide-react';
import { dogBreeds } from '../data/dogBreeds';
import { sanitizeInput, sanitizeDescription, sanitizeEmail, sanitizePhone, getTokenFromStorage, safeJsonParse, safeJsonResponse } from '../utils/security';

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';
const SHIPPING_LA_POSTE = 5.9;
const FRAIS_TAUX = 0.019;

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { items, loading: cartLoading } = useCart();
  const { products, loading: productsLoading } = useProducts();
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: ''
  });
  const [dogInfo, setDogInfo] = useState({
    breed: '',
    age: '',
    tourDeCou: '',
    tourDeTaille: '',
    surMesureCollier: false,
    surMesureHarnais: false
  });
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [breedSuggestions, setBreedSuggestions] = useState<string[]>([]);
  const [showBreedSuggestions, setShowBreedSuggestions] = useState(false);
  const [autoFilled, setAutoFilled] = useState({
    firstName: false,
    lastName: false,
    email: false,
    phone: false
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const token = getTokenFromStorage();
    if (!token) {
      navigate('/connexion');
      return;
    }
    const userStr = localStorage.getItem('user');
    const fetchUserData = async () => {
      try {
        const response = await fetch(`${API_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (response.ok) {
          const data = await safeJsonResponse(response, {}) as { firstName?: string; lastName?: string; email?: string; phone?: string };
          if (data && (data.firstName || data.email)) {
            const newFormData = {
              firstName: sanitizeInput(String(data.firstName || '')).slice(0, 50),
              lastName: sanitizeInput(String(data.lastName || '')).slice(0, 50),
              email: sanitizeEmail(String(data.email || '')) || '',
              phone: sanitizePhone(String(data.phone || ''))
            };
            setFormData(newFormData);
            setAutoFilled({
              firstName: !!newFormData.firstName,
              lastName: !!newFormData.lastName,
              email: !!newFormData.email,
              phone: !!newFormData.phone
            });
          }
        }
      } catch (error) {
        console.error('Erreur:', error);
        if (userStr) {
          const user = safeJsonParse(userStr, {}) as { firstName?: string; lastName?: string; email?: string; phone?: string };
          if (user && typeof user === 'object') {
            setFormData({
              firstName: sanitizeInput(String(user.firstName || '')).slice(0, 50),
              lastName: sanitizeInput(String(user.lastName || '')).slice(0, 50),
              email: sanitizeEmail(String(user.email || '')) || '',
              phone: ''
            });
            setAutoFilled({
              firstName: !!user.firstName,
              lastName: !!user.lastName,
              email: !!user.email,
              phone: false
            });
          }
        }
      }
    };
    fetchUserData();
  }, [navigate]);

  const handleBreedChange = (value: string) => {
    setDogInfo({ ...dogInfo, breed: value });
    if (value.length > 0) {
      const filtered = dogBreeds.filter(breed =>
        breed.toLowerCase().includes(value.toLowerCase())
      );
      setBreedSuggestions(filtered);
      setShowBreedSuggestions(true);
    } else {
      setBreedSuggestions([]);
      setShowBreedSuggestions(false);
    }
  };

  const selectBreed = (breed: string) => {
    setDogInfo({ ...dogInfo, breed });
    setShowBreedSuggestions(false);
  };

  const hasCollier = items.some(i => products.find(p => p.id === i.productId)?.category === 'colliers');
  const hasHarnais = items.some(i => products.find(p => p.id === i.productId)?.category === 'harnais');

  const cartProducts = items.map(item => {
    const product = products.find(p => p.id === item.productId);
    if (!product) return null;
    let unitPrice = product.price;
    if (product.category === 'laisses' && item.size === '1m20' && (product.surcharge1m20 ?? 0) > 0) unitPrice += (product.surcharge1m20 ?? 0);
    if (product.category === 'colliers' && dogInfo.surMesureCollier && (product.surchargeSurMesure ?? 0) > 0) unitPrice += (product.surchargeSurMesure ?? 0);
    if (product.category === 'harnais' && dogInfo.surMesureHarnais && (product.surchargeSurMesure ?? 0) > 0) unitPrice += (product.surchargeSurMesure ?? 0);
    return { ...product, quantity: item.quantity, size: item.size, unitPrice };
  }).filter(Boolean) as Array<{ id: number; name: string; price: number; image: string; quantity: number; size?: string; category: string; unitPrice: number }>;

  const subtotal = cartProducts.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
  const shippingAmount = SHIPPING_LA_POSTE;
  const beforeFees = subtotal + shippingAmount;
  const feesAmount = Math.round(beforeFees * FRAIS_TAUX * 100) / 100;
  const total = Math.round((beforeFees + feesAmount) * 100) / 100;

  const canProceedToStep2 = formData.firstName && formData.lastName && formData.email && formData.phone;

  const handleNextStep = () => {
    if (canProceedToStep2) {
      setCurrentStep(2);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentStep === 1) {
      handleNextStep();
      return;
    }
    
    setError('');
    setSubmitting(true);

    try {
      const token = getTokenFromStorage();
      if (!token) {
        navigate('/connexion');
        return;
      }

      const response = await fetch(`${API_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
          body: JSON.stringify({
          items: cartProducts.map(p => ({ productId: p.id, quantity: p.quantity, price: p.unitPrice, size: p.size })),
          shippingAddress: formData,
          dogInfo: {
            breed: dogInfo.breed,
            age: dogInfo.age,
            tourDeCou: dogInfo.tourDeCou || undefined,
            tourDeTaille: dogInfo.tourDeTaille || undefined,
            surMesureCollier: dogInfo.surMesureCollier,
            surMesureHarnais: dogInfo.surMesureHarnais
          },
          notes: additionalInfo,
          total,
          shippingAmount,
          feesAmount
        })
      });

      if (!response.ok) {
        const data = await safeJsonResponse(response, { error: 'Erreur lors de la création de la commande' });
        throw new Error(data.error || 'Erreur lors de la création de la commande');
      }

      window.dispatchEvent(new Event('cartUpdated'));
      localStorage.setItem('newOrderBadge', '1');
      window.dispatchEvent(new Event('newOrderBadgeUpdated'));
      navigate('/profil?tab=commandes');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création de la commande');
    } finally {
      setSubmitting(false);
    }
  };

  if (cartLoading || productsLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#f8f4ef] via-white to-[#e5f2eb]">
      <p className="text-gray-600">Chargement...</p>
    </div>;
  }

  const token = getTokenFromStorage();
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#f8f4ef] via-white to-[#e5f2eb]">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Vous devez être connecté pour passer une commande</p>
          <button onClick={() => navigate('/connexion')} className="px-4 py-2 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors">
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  if (cartProducts.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#f8f4ef] via-white to-[#e5f2eb]">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Votre panier est vide</p>
          <button onClick={() => navigate('/boutique')} className="px-4 py-2 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors">
            Retour à la boutique
          </button>
        </div>
      </div>
    );
  }

  const progressPercentage = currentStep === 1 ? 50 : 100;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8f4ef] via-white to-[#e5f2eb] py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <button onClick={() => navigate('/panier')} className="mb-8 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Retour au panier
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
                  <span className="text-sm font-medium text-gray-700">Étape {currentStep} sur 2</span>
                  <span className="text-sm text-gray-500">{progressPercentage}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-[#f2dedd] to-[#e5f2eb] h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              </div>

              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {currentStep === 1 ? (
                  <>
                    <div className="flex items-center gap-3 mb-6">
                      <div className="bg-gray-900 rounded-full w-10 h-10 flex items-center justify-center">
                        <User className="w-5 h-5 text-white" />
                      </div>
                      <h2 className="text-2xl font-light text-gray-900">Informations personnelles</h2>
                    </div>

                    {Object.values(autoFilled).some(v => v) && (
                      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-2xl text-sm text-blue-700">
                        ✓ Vos informations ont été pré-remplies depuis votre profil
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Prénom * {autoFilled.firstName && <span className="text-blue-600 text-xs">(auto-complété)</span>}
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.firstName}
                          onChange={(e) => {
                            setFormData({ ...formData, firstName: sanitizeDescription(e.target.value, 50) });
                            setAutoFilled({ ...autoFilled, firstName: false });
                          }}
                          className={`w-full px-4 py-3 border rounded-2xl transition-all focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent ${
                            autoFilled.firstName ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Nom * {autoFilled.lastName && <span className="text-blue-600 text-xs">(auto-complété)</span>}
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.lastName}
                          onChange={(e) => {
                            setFormData({ ...formData, lastName: sanitizeDescription(e.target.value, 50) });
                            setAutoFilled({ ...autoFilled, lastName: false });
                          }}
                          className={`w-full px-4 py-3 border rounded-2xl transition-all focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent ${
                            autoFilled.lastName ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'
                          }`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email * {autoFilled.email && <span className="text-blue-600 text-xs">(auto-complété)</span>}
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => {
                          const sanitized = sanitizeEmail(e.target.value) || e.target.value.slice(0, 255);
                          setFormData({ ...formData, email: sanitized });
                          setAutoFilled({ ...autoFilled, email: false });
                        }}
                        className={`w-full px-4 py-3 border rounded-2xl transition-all focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent ${
                          autoFilled.email ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Téléphone * {autoFilled.phone && <span className="text-blue-600 text-xs">(auto-complété)</span>}
                      </label>
                      <input
                        type="tel"
                        required
                        value={formData.phone}
                        onChange={(e) => {
                          const value = sanitizePhone(e.target.value).slice(0, 10);
                          setFormData({ ...formData, phone: value });
                          setAutoFilled({ ...autoFilled, phone: false });
                        }}
                        maxLength={10}
                        pattern="[0-9]{10}"
                        className={`w-full px-4 py-3 border rounded-2xl transition-all focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent ${
                          autoFilled.phone ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'
                        }`}
                      />
                      <p className="text-xs text-gray-500 mt-2">10 chiffres maximum</p>
                    </div>

                    <button
                      type="submit"
                      disabled={!canProceedToStep2}
                      className="w-full bg-gray-900 text-white py-4 rounded-2xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 font-light"
                    >
                      Continuer
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3 mb-6">
                      <div className="bg-gray-900 rounded-full w-10 h-10 flex items-center justify-center">
                        <Heart className="w-5 h-5 text-white" />
                      </div>
                      <h2 className="text-2xl font-light text-gray-900">Informations sur votre chien</h2>
                    </div>

                    <div className="space-y-6">
                      <div className="relative">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Race *</label>
                        <input
                          type="text"
                          required
                          value={dogInfo.breed}
                          onChange={(e) => handleBreedChange(sanitizeDescription(e.target.value, 100))}
                          onFocus={() => {
                            if (dogInfo.breed.length > 0) {
                              const filtered = dogBreeds.filter(breed =>
                                breed.toLowerCase().includes(dogInfo.breed.toLowerCase())
                              );
                              setBreedSuggestions(filtered);
                              setShowBreedSuggestions(true);
                            }
                          }}
                          onBlur={() => setTimeout(() => setShowBreedSuggestions(false), 200)}
                          placeholder="Tapez pour rechercher..."
                          className="w-full px-4 py-3 border border-gray-200 rounded-2xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                        />
                        {showBreedSuggestions && breedSuggestions.length > 0 && (
                          <div className="absolute z-10 w-full mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl max-h-60 overflow-y-auto">
                            {breedSuggestions.map((breed, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => selectBreed(breed)}
                                className="w-full text-left px-4 py-3 hover:bg-gray-50 first:rounded-t-2xl last:rounded-b-2xl transition-colors"
                              >
                                {breed}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Âge *</label>
                        <input
                          type="text"
                          required
                          value={dogInfo.age}
                          onChange={(e) => {
                            const value = e.target.value;
                            const match = value.match(/^(\d{1,2})/);
                            if (match) {
                              const age = parseInt(match[1]);
                              if (age <= 20) {
                                setDogInfo({ ...dogInfo, age: match[1] });
                              }
                            } else if (value === '') {
                              setDogInfo({ ...dogInfo, age: '' });
                            }
                          }}
                          placeholder="Ex: 2 ans"
                          maxLength={6}
                          className="w-full px-4 py-3 border border-gray-200 rounded-2xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                        />
                        <p className="text-xs text-gray-500 mt-2">Maximum 20 ans</p>
                      </div>

                      {hasCollier && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Tour de cou (cm)</label>
                          <input
                            type="text"
                            value={dogInfo.tourDeCou}
                            onChange={(e) => setDogInfo({ ...dogInfo, tourDeCou: sanitizeDescription(e.target.value, 10) })}
                            placeholder="Ex: 28"
                            className="w-full px-4 py-3 border border-gray-200 rounded-2xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                          />
                          <p className="text-xs text-gray-500 mt-2">Indicatif ou sur mesure selon votre choix ci-dessous</p>
                        </div>
                      )}

                      {hasHarnais && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Tour de taille / poitrail (cm)</label>
                          <input
                            type="text"
                            value={dogInfo.tourDeTaille}
                            onChange={(e) => setDogInfo({ ...dogInfo, tourDeTaille: sanitizeDescription(e.target.value, 10) })}
                            placeholder="Ex: 45"
                            className="w-full px-4 py-3 border border-gray-200 rounded-2xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                          />
                          <p className="text-xs text-gray-500 mt-2">Indicatif ou sur mesure selon votre choix ci-dessous</p>
                        </div>
                      )}

                      {(hasCollier || hasHarnais) && (
                        <div className="space-y-4 p-4 rounded-2xl border border-amber-200 bg-amber-50/50">
                          <p className="text-sm font-medium text-gray-800">Sur mesure</p>
                          {hasCollier && (
                            <label className="flex items-start gap-3 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={dogInfo.surMesureCollier}
                                onChange={(e) => setDogInfo({ ...dogInfo, surMesureCollier: e.target.checked })}
                                className="mt-1 rounded border-gray-300"
                              />
                              <span className="text-sm text-gray-700">
                                Collier sur mesure — fabrication personnalisée, tarif adapté, non retournable
                              </span>
                            </label>
                          )}
                          {hasHarnais && (
                            <label className="flex items-start gap-3 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={dogInfo.surMesureHarnais}
                                onChange={(e) => setDogInfo({ ...dogInfo, surMesureHarnais: e.target.checked })}
                                className="mt-1 rounded border-gray-300"
                              />
                              <span className="text-sm text-gray-700">
                                Harnais sur mesure — fabrication personnalisée, tarif adapté, non retournable
                              </span>
                            </label>
                          )}
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Informations supplémentaires</label>
                        <textarea
                          value={additionalInfo}
                          onChange={(e) => setAdditionalInfo(sanitizeDescription(e.target.value, 2000))}
                          placeholder="Informations supplémentaires sur votre chien ou votre commande..."
                          rows={4}
                          className="w-full px-4 py-3 border border-gray-200 rounded-2xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
                        />
                      </div>

                    </div>

                    <div className="flex gap-4 pt-6">
                      <button
                        type="button"
                        onClick={() => setCurrentStep(1)}
                        className="flex-1 px-6 py-4 border border-gray-200 rounded-2xl hover:bg-gray-50 transition-all duration-200 font-light"
                      >
                        Retour
                      </button>
                      <button
                        type="submit"
                        disabled={submitting || !dogInfo.breed || !dogInfo.age}
                        className="flex-1 bg-gray-900 text-white py-4 rounded-2xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-light"
                      >
                        {submitting ? 'Envoi en cours...' : 'Passer la commande'}
                      </button>
                    </div>
                  </>
                )}
              </form>
            </div>
          </div>

          <div>
            <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl shadow-black/10 p-6 border border-black/5 sticky top-8">
              <h2 className="text-xl font-light text-gray-900 mb-6">Récapitulatif</h2>
              <div className="space-y-4 mb-6">
                {cartProducts.map(item => (
                  <div key={`${item.id}-${item.size || ''}`} className="flex gap-4">
                    <img src={item.image} alt={item.name} className="w-16 h-16 object-cover rounded-2xl" />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{item.name}</p>
                      <p className="text-sm text-gray-600">
                        Quantité: {item.quantity}
                        {item.size && <span> · {item.size === '1m20' ? '1,20 m' : item.size}</span>}
                      </p>
                      <p className="text-sm font-medium text-gray-900">{(item.unitPrice * item.quantity).toFixed(2)}€</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-200 pt-4 space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Sous-total</span>
                  <span>{subtotal.toFixed(2)} €</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Livraison (La Poste)</span>
                  <span>{shippingAmount.toFixed(2)} €</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>TVA et frais applicables (1,9 %)</span>
                  <span>{feesAmount.toFixed(2)} €</span>
                </div>
                <div className="flex justify-between text-xl font-light text-gray-900 pt-2">
                  <span>Total</span>
                  <span>{total.toFixed(2)} €</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
