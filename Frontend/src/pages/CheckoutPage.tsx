import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../hooks/useCart';
import { useProducts } from '../hooks/useProducts';
import { ArrowLeft, CheckCircle, Package, CreditCard, Truck, User, Heart, ArrowRight, Tag, X } from 'lucide-react';
import { dogBreeds } from '../data/dogBreeds';
import { sanitizeInput, sanitizeEmail, sanitizePhone, getTokenFromStorage, safeJsonParse, safeJsonResponse } from '../utils/security';

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';

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
    age: ''
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
  const [promoCode, setPromoCode] = useState('');
  const [promoCodeError, setPromoCodeError] = useState('');
  const [promoCodeSuccess, setPromoCodeSuccess] = useState('');
  const [validatedPromoCode, setValidatedPromoCode] = useState<{
    code: string;
    name: string | null;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    discountAmount: number;
    finalTotal: number;
  } | null>(null);
  const [validatingPromoCode, setValidatingPromoCode] = useState(false);

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

  const cartProducts = items.map(item => {
    const product = products.find(p => p.id === item.productId);
    return product ? { ...product, quantity: item.quantity } : null;
  }).filter(Boolean) as Array<{ id: number; name: string; price: number; image: string; quantity: number }>;

  const baseTotal = cartProducts.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const total = validatedPromoCode ? validatedPromoCode.finalTotal : baseTotal;

  const canProceedToStep2 = formData.firstName && formData.lastName && formData.email && formData.phone;

  const handleNextStep = () => {
    if (canProceedToStep2) {
      setCurrentStep(2);
    }
  };

  const handleValidatePromoCode = async () => {
    if (!promoCode.trim()) {
      setPromoCodeError('Veuillez entrer un code promo');
      return;
    }

    setValidatingPromoCode(true);
    setPromoCodeError('');
    setPromoCodeSuccess('');

    try {
      const token = getTokenFromStorage();
      if (!token) {
        setPromoCodeError('Session expirée');
        return;
      }

      const response = await fetch(`${API_URL}/api/promo-codes/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          code: promoCode.trim().toUpperCase(),
          total: baseTotal
        })
      });

      const data = await safeJsonResponse(response, { error: 'Erreur' });

      if (!response.ok) {
        throw new Error(data.error || 'Code promo invalide');
      }

      setValidatedPromoCode(data);
      setPromoCodeSuccess(`Code promo appliqué : ${data.discountValue}${data.discountType === 'percentage' ? '%' : '€'} de réduction`);
      setPromoCodeError('');
    } catch (error) {
      setPromoCodeError(error instanceof Error ? error.message : 'Erreur lors de la validation');
      setValidatedPromoCode(null);
      setPromoCodeSuccess('');
    } finally {
      setValidatingPromoCode(false);
    }
  };

  const handleRemovePromoCode = () => {
    setPromoCode('');
    setValidatedPromoCode(null);
    setPromoCodeError('');
    setPromoCodeSuccess('');
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
          items: cartProducts.map(p => ({ productId: p.id, quantity: p.quantity, price: p.price })),
          shippingAddress: formData,
          dogInfo,
          notes: additionalInfo,
          total,
          promoCode: validatedPromoCode ? validatedPromoCode.code : null
        })
      });

      if (!response.ok) {
        const data = await safeJsonResponse(response, { error: 'Erreur lors de la création de la commande' });
        const errorMessage = data.error || 'Erreur lors de la création de la commande';
        if (errorMessage.includes('3 commandes')) {
          setError(errorMessage);
        } else {
          throw new Error(errorMessage);
        }
        return;
      }

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
                            setFormData({ ...formData, firstName: sanitizeInput(e.target.value).slice(0, 50) });
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
                            setFormData({ ...formData, lastName: sanitizeInput(e.target.value).slice(0, 50) });
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
                          onChange={(e) => handleBreedChange(sanitizeInput(e.target.value).slice(0, 100))}
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

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Informations supplémentaires</label>
                        <textarea
                          value={additionalInfo}
                          onChange={(e) => setAdditionalInfo(sanitizeInput(e.target.value).slice(0, 2000))}
                          placeholder="Informations supplémentaires sur votre chien ou votre commande..."
                          rows={4}
                          className="w-full px-4 py-3 border border-gray-200 rounded-2xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Code promo (optionnel)</label>
                        {validatedPromoCode ? (
                          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-2xl">
                            <Tag className="w-5 h-5 text-green-700" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-green-900">
                                {validatedPromoCode.name || validatedPromoCode.code}
                              </p>
                              <p className="text-xs text-green-700">
                                Réduction de {validatedPromoCode.discountAmount.toFixed(2)}€
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={handleRemovePromoCode}
                              className="p-1 hover:bg-green-100 rounded-lg transition-colors"
                            >
                              <X className="w-4 h-4 text-green-700" />
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={promoCode}
                                onChange={(e) => setPromoCode(e.target.value.toUpperCase().trim())}
                                placeholder="Entrez votre code promo"
                                maxLength={50}
                                className="flex-1 px-4 py-3 border border-gray-200 rounded-2xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent uppercase"
                                style={{ textTransform: 'uppercase' }}
                              />
                              <button
                                type="button"
                                onClick={handleValidatePromoCode}
                                disabled={validatingPromoCode || !promoCode.trim()}
                                className="px-6 py-3 bg-gray-900 text-white rounded-2xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {validatingPromoCode ? '...' : 'Valider'}
                              </button>
                            </div>
                            {promoCodeError && (
                              <p className="text-sm text-red-600">{promoCodeError}</p>
                            )}
                            {promoCodeSuccess && (
                              <p className="text-sm text-green-600">{promoCodeSuccess}</p>
                            )}
                          </div>
                        )}
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
                  <div key={item.id} className="flex gap-4">
                    <img src={item.image} alt={item.name} className="w-16 h-16 object-cover rounded-2xl" />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{item.name}</p>
                      <p className="text-sm text-gray-600">Quantité: {item.quantity}</p>
                      <p className="text-sm font-medium text-gray-900">{(item.price * item.quantity).toFixed(2)}€</p>
                    </div>
                  </div>
                ))}
              </div>
              {validatedPromoCode && (
                <div className="border-t border-gray-200 pt-4 space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Sous-total</span>
                    <span>{baseTotal.toFixed(2)}€</span>
                  </div>
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Réduction ({validatedPromoCode.code})</span>
                    <span>-{validatedPromoCode.discountAmount.toFixed(2)}€</span>
                  </div>
                </div>
              )}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex justify-between text-xl font-light text-gray-900">
                  <span>Total</span>
                  <span>{total.toFixed(2)}€</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
