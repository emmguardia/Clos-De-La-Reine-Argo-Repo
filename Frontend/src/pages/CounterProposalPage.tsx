import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, X, MessageSquare } from 'lucide-react';
import { useProductsByIds } from '../hooks/useProductsByIds';
import { useProductsListForAdmin } from '../hooks/useProductsListForAdmin';
import { safeJsonResponse, getTokenFromStorage } from '../utils/security';

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';

interface OrderItem { productId: number; quantity: number; price: number }
interface CounterOrder {
  id: string;
  status?: string;
  total: number;
  items: OrderItem[];
  counterProposal?: { items: OrderItem[]; total: number; message?: string };
}

export default function CounterProposalPage() {
  const navigate = useNavigate();
  const { orderId, action } = useParams();
  const [order, setOrder] = useState<CounterOrder | null>(null);
  const orderProductIds = order ? [...order.items.map(i => i.productId), ...(order.counterProposal?.items?.map(i => i.productId) ?? [])] : [];
  const { getProduct } = useProductsByIds([...new Set(orderProductIds)]);
  const { products } = useProductsListForAdmin();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [newProposal, setNewProposal] = useState({
    items: [] as Array<{ productId: number; quantity: number; price: number }>,
    message: ''
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
        const orders = await safeJsonResponse(response, []);
        const foundOrder = Array.isArray(orders) ? orders.find((o: { id: string }) => o.id === orderId) as CounterOrder | undefined : null;
        if (foundOrder) {
          if (foundOrder.status !== 'pending_counter_proposal') {
            navigate('/profil?tab=commandes');
            return;
          }
          setOrder(foundOrder);
        } else {
          navigate('/profil?tab=commandes');
        }
      } else {
        console.error('Erreur lors de la récupération des commandes');
        navigate('/profil?tab=commandes');
      }
    } catch (err) {
      console.error('Erreur:', err);
      navigate('/profil?tab=commandes');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!order?.counterProposal) {
      setError('Aucune contre-proposition disponible à accepter');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const token = getTokenFromStorage();
      if (!token) {
        setError('Session expirée. Veuillez vous reconnecter.');
        navigate('/connexion');
        return;
      }
      
      const response = await fetch(`${API_URL}/api/orders/${orderId}/counter-proposal`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ accept: true })
      });
      if (response.ok) {
        navigate('/profil?tab=commandes');
      } else {
        const data = await safeJsonResponse(response, { error: 'Erreur' });
        setError(data.error || 'Erreur');
      }
    } catch {
      setError('Erreur lors de l\'acceptation');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRepropose = async () => {
    if (newProposal.items.length === 0) {
      setError('Veuillez ajouter au moins un produit');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const token = getTokenFromStorage();
      if (!token) {
        setError('Session expirée. Veuillez vous reconnecter.');
        navigate('/connexion');
        return;
      }
      
      const total = newProposal.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const response = await fetch(`${API_URL}/api/orders/${orderId}/counter-proposal`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          accept: false,
          newProposal: {
            items: newProposal.items,
            total,
            message: newProposal.message
          }
        })
      });
      if (response.ok) {
        navigate('/profil?tab=commandes');
      } else {
        const data = await safeJsonResponse(response, { error: 'Erreur' });
        setError(data.error || 'Erreur');
      }
    } catch {
      setError('Erreur lors de l\'envoi');
    } finally {
      setSubmitting(false);
    }
  };

  const getProductName = (productId: number) => {
    const product = getProduct(productId);
    return product ? product.name : `Produit #${productId}`;
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Chargement...</div>;
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Commande non trouvée ou non disponible</p>
          <button onClick={() => navigate('/profil?tab=commandes')} className="px-4 py-2 bg-gray-900 text-white rounded-lg">
            Retour aux commandes
          </button>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-light text-gray-900 mb-8">Contre-proposition</h1>

        {error && <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>}

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-medium mb-4">Commande originale</h2>
          <div className="space-y-2 mb-4">
            {order.items.map((item: OrderItem, idx: number) => (
              <div key={idx} className="flex justify-between text-sm">
                <span>{getProductName(item.productId)} x{item.quantity}</span>
                <span>{(item.price * item.quantity).toFixed(2)}€</span>
              </div>
            ))}
          </div>
          <p className="text-lg font-medium">Total: {order.total.toFixed(2)}€</p>
        </div>

        {order.counterProposal ? (
          <div className="bg-blue-50 rounded-lg border border-blue-200 p-6 mb-6">
            <h2 className="text-xl font-medium mb-4 text-blue-900">Contre-proposition reçue</h2>
            <div className="space-y-2 mb-4">
              {order.counterProposal.items.map((item: OrderItem, idx: number) => (
                <div key={idx} className="flex justify-between text-sm text-blue-800">
                  <span>{getProductName(item.productId)} x{item.quantity}</span>
                  <span>{(item.price * item.quantity).toFixed(2)}€</span>
                </div>
              ))}
            </div>
            <p className="text-lg font-medium text-blue-900">Total: {order.counterProposal.total.toFixed(2)}€</p>
            {order.counterProposal.message && (
              <div className="mt-4 p-3 bg-white rounded border border-blue-200">
                <p className="text-sm text-blue-800">{order.counterProposal.message}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-blue-50 rounded-lg border border-blue-200 p-6 mb-6">
            <h2 className="text-xl font-medium mb-4 text-blue-900">Contre-proposition en attente</h2>
            <p className="text-sm text-blue-800">Une contre-proposition vous a été envoyée. Vous pouvez l'accepter ou faire une nouvelle proposition.</p>
          </div>
        )}

        {action === 'reproposer' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-medium mb-4">Votre nouvelle proposition</h2>
            <div className="space-y-2 mb-4">
              {newProposal.items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={item.productId}
                    onChange={(e) => {
                      const newItems = [...newProposal.items];
                      const product = products.find(p => p.id === parseInt(e.target.value));
                      newItems[idx] = {
                        productId: parseInt(e.target.value),
                        quantity: item.quantity,
                        price: product?.price || 0
                      };
                      setNewProposal({ ...newProposal, items: newItems });
                    }}
                    className="flex-1 px-4 py-2 border border-gray-200 rounded-lg"
                  >
                    <option value="">Sélectionner un produit</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name} - {p.price}€</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => {
                      const newItems = [...newProposal.items];
                      newItems[idx].quantity = parseInt(e.target.value) || 1;
                      setNewProposal({ ...newProposal, items: newItems });
                    }}
                    min="1"
                    className="w-20 px-4 py-2 border border-gray-200 rounded-lg"
                  />
                  <button
                    onClick={() => {
                      setNewProposal({
                        ...newProposal,
                        items: newProposal.items.filter((_, i) => i !== idx)
                      });
                    }}
                    className="p-2 text-red-600 hover:bg-red-50 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  setNewProposal({
                    ...newProposal,
                    items: [...newProposal.items, { productId: 0, quantity: 1, price: 0 }]
                  });
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
              >
                + Ajouter un produit
              </button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Message (optionnel)</label>
              <textarea
                value={newProposal.message}
                onChange={(e) => setNewProposal({ ...newProposal, message: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                placeholder="Expliquez votre nouvelle proposition..."
              />
            </div>
            {newProposal.items.length > 0 && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium">
                  Total: {newProposal.items.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2)}€
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleAccept}
            disabled={submitting || !order.counterProposal}
            className="px-6 py-3 bg-gray-900 text-white rounded-full hover:bg-gray-800 disabled:opacity-50 transition-all duration-200 flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            Accepter la contre-proposition
          </button>
          {action === 'reproposer' && (
            <button
              onClick={handleRepropose}
              disabled={submitting || newProposal.items.length === 0}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-900 border border-black/10 rounded-full hover:border-gray-900 disabled:opacity-50 transition-all duration-200"
            >
              <MessageSquare className="w-5 h-5" />
              Envoyer ma proposition
            </button>
          )}
          <button
            onClick={() => navigate('/profil?tab=commandes')}
            className="px-6 py-3 border border-gray-300 rounded-full hover:bg-gray-50 transition-all duration-200"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

