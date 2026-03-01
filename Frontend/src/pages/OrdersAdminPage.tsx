import { useState, useEffect, useMemo } from 'react';
import { Check, X, Truck, MessageSquare, Package, Filter, Search, User, Calendar, Trash2, AlertCircle, Clock, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProductsByIds } from '../hooks/useProductsByIds';
import { useProductsListForAdmin } from '../hooks/useProductsListForAdmin';
import { safeJsonResponse } from '../utils/security';

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';

interface Order {
  id: string;
  orderNumber?: string;
  user: { email: string; firstName: string; lastName: string } | null;
  items: Array<{ productId: number; quantity: number; price: number }>;
  shippingAddress: Record<string, unknown>;
  dogInfo: {
    breed: string;
    age: string;
    size?: string;
    weight?: string;
    behavior?: string;
    specialNeeds?: string;
  };
  notes?: string;
  total: number;
  status: string;
  counterProposal?: {
    items: Array<{ productId: number; quantity: number; price: number }>;
    total: number;
    message?: string;
  };
  rejectionReason?: string;
  paymentInfo?: { paidAt?: string };
  createdAt: string;
}

export default function OrdersAdminPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const productIdsFromOrders = orders.flatMap(o => [
    ...o.items.map(i => i.productId),
    ...(o.counterProposal?.items?.map(i => i.productId) ?? [])
  ]);
  const { getProduct } = useProductsByIds([...new Set(productIdsFromOrders)]);
  const { products } = useProductsListForAdmin();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [action, setAction] = useState<'accept' | 'reject' | 'counter' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [counterProposal, setCounterProposal] = useState({
    items: [] as Array<{ productId: number; quantity: number; price: number }>,
    message: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    const adminToken = localStorage.getItem('adminToken');
    if (!adminToken) {
      window.location.href = '/admin/login';
      return;
    }
    verifyAdminToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verifyAdminToken = async () => {
    try {
      const adminToken = localStorage.getItem('adminToken');
      if (!adminToken) {
        window.location.href = '/admin/login';
        return;
      }

      const response = await fetch(`${API_URL}/api/admin/verify`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      if (!response.ok) {
        localStorage.removeItem('adminToken');
        window.location.href = '/admin/login';
        return;
      }

      fetchOrders();
    } catch {
      localStorage.removeItem('adminToken');
      window.location.href = '/admin/login';
    }
  };

  const fetchOrders = async () => {
    try {
      const adminToken = localStorage.getItem('adminToken');
      if (!adminToken) {
        window.location.href = '/admin/login';
        return;
      }
      
      const response = await fetch(`${API_URL}/api/orders/admin`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });
      
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('adminToken');
        window.location.href = '/admin/login';
        return;
      }
      
      if (response.ok) {
        const data = await safeJsonResponse(response, []);
        if (Array.isArray(data)) {
          setOrders(data);
        }
      }
    } catch {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async () => {
    if (!selectedOrder) return;
    setError('');
    setSuccess('');

    try {
      const adminToken = localStorage.getItem('adminToken');
      if (!adminToken) {
        setError('Session expirée. Veuillez vous reconnecter.');
        window.location.href = '/admin/login';
        return;
      }
      let response;

      if (action === 'accept') {
        response = await fetch(`${API_URL}/api/orders/${selectedOrder.id}/status`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          body: JSON.stringify({ status: 'validated' })
        });
      } else if (action === 'reject') {
        response = await fetch(`${API_URL}/api/orders/${selectedOrder.id}/status`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          body: JSON.stringify({ status: 'rejected', rejectionReason })
        });
      } else if (action === 'counter') {
        const total = counterProposal.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        response = await fetch(`${API_URL}/api/orders/${selectedOrder.id}/status`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          body: JSON.stringify({
            status: 'pending_validation',
            counterProposal: {
              items: counterProposal.items,
              total,
              message: counterProposal.message
            }
          })
        });
      }

      if (response && response.ok) {
        setSuccess('Action effectuée avec succès');
        setSelectedOrder(null);
        setAction(null);
        setRejectionReason('');
        setCounterProposal({ items: [], message: '' });
        fetchOrders();
      } else if (response) {
        const data = await safeJsonResponse(response, { error: 'Erreur lors de l\'action' });
        setError(data.error || 'Erreur lors de l\'action');
      } else {
        setError('Erreur lors de l\'action');
      }
    } catch {
      setError('Erreur lors de l\'action');
    }
  };

  const handleShipping = async (orderId: string) => {
    try {
      const adminToken = localStorage.getItem('adminToken');
      if (!adminToken) {
        window.location.href = '/admin/login';
        return;
      }
      const response = await fetch(`${API_URL}/api/orders/${orderId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ status: 'shipping' })
      });
      if (response.ok) {
        fetchOrders();
      }
    } catch {
      console.error('Erreur:', error);
    }
  };

  const handleReject = async (orderId: string, reason: string = 'Refusée par l\'administrateur') => {
    if (!confirm('Êtes-vous sûr de vouloir refuser cette commande ?')) {
      return;
    }
    try {
      const adminToken = localStorage.getItem('adminToken');
      if (!adminToken) {
        window.location.href = '/admin/login';
        return;
      }
      
      const response = await fetch(`${API_URL}/api/orders/${orderId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ status: 'rejected', rejectionReason: reason })
      });
      
      if (response.ok) {
        setSuccess('Commande refusée avec succès');
        fetchOrders();
      } else {
        const data = await safeJsonResponse(response, { error: 'Erreur lors du refus' });
        setError(data.error || 'Erreur lors du refus');
      }
    } catch {
      setError('Erreur lors du refus');
    }
  };

  const handleDelete = async (orderId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette commande ?')) {
      return;
    }
    try {
      const adminToken = localStorage.getItem('adminToken');
      if (!adminToken) {
        window.location.href = '/admin/login';
        return;
      }
      const response = await fetch(`${API_URL}/api/orders/${orderId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });
      if (response.ok) {
        setSuccess('Commande supprimée avec succès');
        fetchOrders();
      } else {
        const data = await safeJsonResponse(response, { error: 'Erreur lors de la suppression' });
        setError(data.error || 'Erreur lors de la suppression');
      }
    } catch {
      setError('Erreur lors de la suppression');
    }
  };

  const isArchived = (status: string) => {
    return ['completed', 'rejected'].includes(status);
  };

  const canDelete = (status: string) => {
    return ['pending_validation', 'pending_counter_proposal', 'validated', 'rejected'].includes(status);
  };

  const filteredOrders = useMemo(() => {
    let filtered = orders.filter(order => {
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      const matchesClient = !clientFilter || 
        (order.user && (
          order.user.email.toLowerCase().includes(clientFilter.toLowerCase()) ||
          `${order.user.firstName} ${order.user.lastName}`.toLowerCase().includes(clientFilter.toLowerCase())
        ));
      const matchesSearch = !searchTerm || 
        order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.user && order.user.email.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchesStatus && matchesClient && matchesSearch;
    });
    
    if (statusFilter === 'all' && selectedCategory !== 'archived') {
      filtered = filtered.filter(order => !isArchived(order.status));
    }
    
    return filtered;
  }, [orders, statusFilter, clientFilter, searchTerm, selectedCategory]);

  const newOrders = useMemo(() => {
    return filteredOrders.filter(order => order.status === 'pending_validation' || order.status === 'pending_counter_proposal');
  }, [filteredOrders]);

  const toPrepare = useMemo(() => {
    return filteredOrders.filter(order => order.status === 'paid');
  }, [filteredOrders]);

  const inProgress = useMemo(() => {
    return filteredOrders.filter(order => ['validated', 'shipping'].includes(order.status));
  }, [filteredOrders]);

  const allArchived = useMemo(() => {
    return orders.filter(order => isArchived(order.status));
  }, [orders]);

  const archived = useMemo(() => {
    return filteredOrders.filter(order => isArchived(order.status));
  }, [filteredOrders]);

  const uniqueClients = useMemo(() => {
    const clients = new Set<string>();
    orders.forEach(order => {
      if (order.user) {
        clients.add(`${order.user.firstName} ${order.user.lastName} (${order.user.email})`);
      }
    });
    return Array.from(clients).sort();
  }, [orders]);

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; color: string; bgColor: string }> = {
      pending_validation: { label: 'En attente', color: 'text-yellow-700', bgColor: 'bg-yellow-50 border-yellow-200' },
      pending_counter_proposal: { label: 'Contre-proposition', color: 'text-blue-700', bgColor: 'bg-blue-50 border-blue-200' },
      validated: { label: 'Validée', color: 'text-green-700', bgColor: 'bg-green-50 border-green-200' },
      paid: { label: 'Payée', color: 'text-purple-700', bgColor: 'bg-purple-50 border-purple-200' },
      shipping: { label: 'En acheminement', color: 'text-indigo-700', bgColor: 'bg-indigo-50 border-indigo-200' },
      completed: { label: 'Terminée', color: 'text-gray-700', bgColor: 'bg-gray-50 border-gray-200' },
      rejected: { label: 'Refusée', color: 'text-red-700', bgColor: 'bg-red-50 border-red-200' }
    };
    return badges[status] || { label: status, color: 'text-gray-700', bgColor: 'bg-gray-50 border-gray-200' };
  };

  const getProductName = (productId: number) => {
    const product = getProduct(productId);
    return product ? product.name : `Produit #${productId}`;
  };

  const renderOrderCard = (order: Order, statusBadge: { label: string; color: string; bgColor: string }) => {
    return (
      <div className="p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-xl font-light text-gray-900">
                Commande #{order.orderNumber || order.id.slice(-8)}
              </h3>
              <span className={`px-4 py-1.5 rounded-full text-xs font-medium border ${statusBadge.bgColor} ${statusBadge.color}`}>
                {statusBadge.label}
              </span>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-gray-700 flex items-center gap-2">
                <User className="w-4 h-4" />
                {order.user ? `${order.user.firstName} ${order.user.lastName}` : 'Utilisateur inconnu'}
              </p>
              <p className="text-sm text-gray-600">{order.user?.email}</p>
              <p className="text-sm text-gray-500 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {new Date(order.createdAt).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-light text-gray-900">{order.total.toFixed(2)}€</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="bg-gray-50 rounded-2xl p-4">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <Package className="w-4 h-4" />
              Produits commandés
            </h4>
            <div className="space-y-2">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm text-gray-700">
                  <span>{getProductName(item.productId)} x{item.quantity}</span>
                  <span className="font-medium">{(item.price * item.quantity).toFixed(2)}€</span>
                </div>
              ))}
            </div>
          </div>
          {order.dogInfo && (
            <div className="bg-gray-50 rounded-2xl p-4">
              <h4 className="font-medium text-gray-900 mb-3">Informations chien</h4>
              <div className="space-y-1 text-sm text-gray-600">
                <p><strong>Race:</strong> {order.dogInfo.breed || 'Non renseigné'}</p>
                <p><strong>Âge:</strong> {order.dogInfo.age || 'Non renseigné'}</p>
              </div>
            </div>
          )}
          {order.shippingAddress && (
            <div className="bg-gray-50 rounded-2xl p-4">
              <h4 className="font-medium text-gray-900 mb-3">Adresse de livraison</h4>
              <div className="text-sm text-gray-600">
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
        </div>

        {order.notes && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-700"><strong>Notes:</strong> {order.notes}</p>
          </div>
        )}

        {order.counterProposal && (
          <div className="mb-4 p-4 bg-blue-50 rounded-2xl border border-blue-200">
            <h4 className="font-medium text-blue-900 mb-3">Contre-proposition</h4>
            <div className="space-y-2 mb-3">
              {order.counterProposal.items.map((item, idx) => (
                <div key={idx} className="text-sm text-blue-800">
                  {getProductName(item.productId)} x{item.quantity} - {(item.price * item.quantity).toFixed(2)}€
                </div>
              ))}
            </div>
            <p className="text-sm font-medium text-blue-900 mb-2">Total: {order.counterProposal.total.toFixed(2)}€</p>
            {order.counterProposal.message && (
              <p className="text-sm text-blue-700 mt-2 p-2 bg-white/50 rounded-lg">{order.counterProposal.message}</p>
            )}
            {order.status === 'pending_counter_proposal' && (
              <p className="text-sm text-blue-600 mt-3 italic">En attente de réponse du client</p>
            )}
          </div>
        )}

        {order.rejectionReason && (
          <div className="mb-4 p-4 bg-red-50 rounded-lg border border-red-200">
            <p className="text-sm text-red-800"><strong>Raison du refus:</strong> {order.rejectionReason}</p>
          </div>
        )}

        {order.paymentInfo && (
          <div className="mb-4 p-3 bg-green-50 rounded-lg">
            <p className="text-sm text-green-800">
              <strong>Paiement effectué</strong> - {new Date(order.paymentInfo.paidAt).toLocaleDateString('fr-FR')}
            </p>
          </div>
        )}

        <div className="flex items-center gap-3 pt-6 border-t border-gray-200">
          {order.status === 'pending_validation' && (
            <>
              <button
                onClick={() => {
                  setSelectedOrder(order);
                  setAction('accept');
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-all duration-200 text-sm font-light"
              >
                <Check className="w-4 h-4" />
                Accepter
              </button>
              <button
                onClick={() => {
                  setSelectedOrder(order);
                  setAction('counter');
                }}
                className="flex items-center gap-2 px-4 py-2 bg-white text-gray-900 border border-black/10 rounded-full hover:border-gray-900 transition-all duration-200 text-sm font-light"
              >
                <MessageSquare className="w-4 h-4" />
                Contre-proposer
              </button>
              <button
                onClick={() => {
                  setSelectedOrder(order);
                  setAction('reject');
                }}
                className="flex items-center gap-2 px-4 py-2 bg-white text-red-600 border border-red-200 rounded-full hover:border-red-600 transition-all duration-200 text-sm font-light"
              >
                <X className="w-4 h-4" />
                Refuser
              </button>
            </>
          )}
          {order.status === 'pending_counter_proposal' && (
            <>
              <button
                onClick={() => {
                  setSelectedOrder(order);
                  setAction('accept');
                }}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-all duration-200 text-sm font-light"
              >
                <Check className="w-4 h-4" />
                Accepter contre-proposition
              </button>
              <button
                onClick={() => handleReject(order.id)}
                className="flex items-center gap-2 px-4 py-2 bg-white text-red-600 border border-red-200 rounded-full hover:border-red-600 transition-all duration-200 text-sm font-light"
              >
                <X className="w-4 h-4" />
                Refuser
              </button>
            </>
          )}
          {order.status === 'validated' && !order.paymentInfo && (
            <button
              onClick={() => handleReject(order.id)}
              className="flex items-center gap-2 px-4 py-2 bg-white text-red-600 border border-red-200 rounded-full hover:border-red-600 transition-all duration-200 text-sm font-light"
            >
              <X className="w-4 h-4" />
              Refuser
            </button>
          )}
          {order.status === 'paid' && (
            <button
              onClick={() => handleShipping(order.id)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-all duration-200 text-sm font-light"
            >
              <Truck className="w-4 h-4" />
              Marquer en acheminement
            </button>
          )}
          {order.status === 'shipping' && (
            <button
              onClick={async () => {
                try {
                  const adminToken = localStorage.getItem('adminToken');
                  if (!adminToken) {
                    window.location.href = '/admin/login';
                    return;
                  }
                  const response = await fetch(`${API_URL}/api/orders/${order.id}/status`, {
                    method: 'PUT',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${adminToken}`
                    },
                    body: JSON.stringify({ status: 'completed' })
                  });
                  if (response.ok) {
                    fetchOrders();
                  }
                } catch {
                  console.error('Erreur:', error);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-all duration-200 text-sm font-light"
            >
              <Check className="w-4 h-4" />
              Marquer comme terminée
            </button>
          )}
          {canDelete(order.status) && (
            <button
              onClick={() => handleDelete(order.id)}
              className="flex items-center gap-2 px-4 py-2 bg-white text-red-600 border border-red-200 rounded-full hover:border-red-600 transition-all duration-200 text-sm font-light ml-auto"
            >
              <Trash2 className="w-4 h-4" />
              Supprimer
            </button>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#f8f4ef] via-white to-[#e5f2eb] flex items-center justify-center">
        <p className="text-gray-600">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8f4ef] via-white to-[#e5f2eb] py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-light text-gray-900 mb-2">Gestion des commandes</h1>
            <p className="text-gray-600">Suivi et gestion de toutes les commandes</p>
          </div>
          <Link
            to="/admin"
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour au panel
          </Link>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl">{error}</div>
        )}
        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-2xl">{success}</div>
        )}

        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl shadow-black/10 p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher par ID ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
            <div className="flex gap-3">
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="pl-10 pr-8 py-2 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent appearance-none bg-white"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="pending_validation">En attente</option>
                  <option value="pending_counter_proposal">Contre-proposition</option>
                  <option value="validated">Validée</option>
                  <option value="paid">Payée</option>
                  <option value="shipping">En acheminement</option>
                  <option value="completed">Terminée</option>
                  <option value="rejected">Refusée</option>
                </select>
              </div>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <select
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  className="pl-10 pr-8 py-2 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent appearance-none bg-white min-w-[200px]"
                >
                  <option value="">Tous les clients</option>
                  {uniqueClients.map((client, idx) => (
                    <option key={idx} value={client}>{client}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button
              onClick={() => setSelectedCategory(selectedCategory === 'new' ? null : 'new')}
              className={`bg-yellow-50 border-2 rounded-2xl p-4 text-left transition-all cursor-pointer hover:scale-105 ${
                selectedCategory === 'new' ? 'border-yellow-400 shadow-lg' : 'border-yellow-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-5 h-5 text-yellow-700" />
                <span className="text-sm font-medium text-yellow-900">Nouvelles</span>
              </div>
              <p className="text-2xl font-light text-yellow-900">{newOrders.length}</p>
            </button>
            <button
              onClick={() => setSelectedCategory(selectedCategory === 'inProgress' ? null : 'inProgress')}
              className={`bg-indigo-50 border-2 rounded-2xl p-4 text-left transition-all cursor-pointer hover:scale-105 ${
                selectedCategory === 'inProgress' ? 'border-indigo-400 shadow-lg' : 'border-indigo-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Truck className="w-5 h-5 text-indigo-700" />
                <span className="text-sm font-medium text-indigo-900">En cours</span>
              </div>
              <p className="text-2xl font-light text-indigo-900">{inProgress.length}</p>
            </button>
            <button
              onClick={() => setSelectedCategory(selectedCategory === 'toPrepare' ? null : 'toPrepare')}
              className={`bg-purple-50 border-2 rounded-2xl p-4 text-left transition-all cursor-pointer hover:scale-105 ${
                selectedCategory === 'toPrepare' ? 'border-purple-400 shadow-lg' : 'border-purple-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-5 h-5 text-purple-700" />
                <span className="text-sm font-medium text-purple-900">À préparer</span>
              </div>
              <p className="text-2xl font-light text-purple-900">{toPrepare.length}</p>
            </button>
            <button
              onClick={() => setSelectedCategory(selectedCategory === 'archived' ? null : 'archived')}
              className={`bg-gray-50 border-2 rounded-2xl p-4 text-left transition-all cursor-pointer hover:scale-105 ${
                selectedCategory === 'archived' ? 'border-gray-400 shadow-lg' : 'border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-gray-700" />
                <span className="text-sm font-medium text-gray-900">Archivées</span>
              </div>
              <p className="text-2xl font-light text-gray-900">{allArchived.length}</p>
            </button>
          </div>
        </div>

        {(!selectedCategory || selectedCategory === 'new') && newOrders.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-yellow-600" />
              <h2 className="text-2xl font-light text-gray-900">Nouvelles commandes</h2>
              <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
                {newOrders.length}
              </span>
            </div>
            <div className="space-y-4">
              {newOrders.map(order => {
                const statusBadge = getStatusBadge(order.status);
                return (
                  <div key={order.id} className="bg-yellow-50/50 border-2 border-yellow-300 rounded-3xl shadow-xl shadow-black/10 border-black/5 overflow-hidden">
                    {renderOrderCard(order, statusBadge)}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(!selectedCategory || selectedCategory === 'inProgress') && inProgress.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Truck className="w-6 h-6 text-indigo-600" />
              <h2 className="text-2xl font-light text-gray-900">En cours</h2>
              <span className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm font-medium">
                {inProgress.length}
              </span>
            </div>
            <div className="space-y-4">
              {inProgress.map(order => {
                const statusBadge = getStatusBadge(order.status);
                return (
                  <div key={order.id} className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl shadow-black/10 border border-black/5 overflow-hidden">
                    {renderOrderCard(order, statusBadge)}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(!selectedCategory || selectedCategory === 'toPrepare') && toPrepare.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Package className="w-6 h-6 text-purple-600" />
              <h2 className="text-2xl font-light text-gray-900">À préparer</h2>
              <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
                {toPrepare.length}
              </span>
            </div>
            <div className="space-y-4">
              {toPrepare.map(order => {
                const statusBadge = getStatusBadge(order.status);
                return (
                  <div key={order.id} className="bg-purple-50/50 border-2 border-purple-300 rounded-3xl shadow-xl shadow-black/10 border-black/5 overflow-hidden">
                    {renderOrderCard(order, statusBadge)}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(!selectedCategory || selectedCategory === 'archived') && archived.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="w-6 h-6 text-gray-600" />
              <h2 className="text-2xl font-light text-gray-900">Archivées</h2>
              <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm font-medium">
                {archived.length}
              </span>
            </div>
            <div className="space-y-4">
              {archived.map(order => {
                const statusBadge = getStatusBadge(order.status);
                return (
                  <div key={order.id} className="bg-gray-50/50 border border-gray-200 rounded-3xl shadow-sm border-black/5 overflow-hidden opacity-75">
                    {renderOrderCard(order, statusBadge)}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {selectedCategory && 
          ((selectedCategory === 'new' && newOrders.length === 0) ||
           (selectedCategory === 'inProgress' && inProgress.length === 0) ||
           (selectedCategory === 'toPrepare' && toPrepare.length === 0) ||
           (selectedCategory === 'archived' && archived.length === 0)) && (
          <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl shadow-black/10 p-12 text-center">
            <Package className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600">Aucune commande dans cette catégorie</p>
          </div>
        )}

        {!selectedCategory && newOrders.length === 0 && toPrepare.length === 0 && inProgress.length === 0 && archived.length === 0 && (
          <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl shadow-black/10 p-12 text-center">
            <Package className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600">Aucune commande trouvée</p>
          </div>
        )}

        {filteredOrders.length === 0 && statusFilter !== 'all' ? (
          <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl shadow-black/10 p-12 text-center">
            <Package className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600">Aucune commande trouvée avec ce filtre</p>
          </div>
        ) : null}

        {selectedOrder && action && (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div 
              className="fixed inset-0"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
              onClick={() => {
                setSelectedOrder(null);
                setAction(null);
                setRejectionReason('');
                setCounterProposal({ items: [], message: '' });
              }}
            />
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto relative z-10">
              <h2 className="text-xl font-medium mb-4">
                {action === 'accept' && 'Accepter la commande'}
                {action === 'reject' && 'Refuser la commande'}
                {action === 'counter' && 'Faire une contre-proposition'}
              </h2>

              {action === 'reject' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Raison du refus *</label>
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      required
                      rows={4}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                      placeholder="Expliquez pourquoi la commande est refusée..."
                    />
                  </div>
                </div>
              )}

              {action === 'counter' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Produits proposés</label>
                    <div className="space-y-2">
                      {counterProposal.items.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <select
                            value={item.productId}
                            onChange={(e) => {
                              const newItems = [...counterProposal.items];
                              const product = products.find(p => p.id === parseInt(e.target.value));
                              newItems[idx] = {
                                productId: parseInt(e.target.value),
                                quantity: item.quantity,
                                price: product?.price || 0
                              };
                              setCounterProposal({ ...counterProposal, items: newItems });
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
                              const newItems = [...counterProposal.items];
                              newItems[idx].quantity = parseInt(e.target.value) || 1;
                              setCounterProposal({ ...counterProposal, items: newItems });
                            }}
                            min="1"
                            className="w-20 px-4 py-2 border border-gray-200 rounded-lg"
                          />
                          <button
                            onClick={() => {
                              setCounterProposal({
                                ...counterProposal,
                                items: counterProposal.items.filter((_, i) => i !== idx)
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
                          setCounterProposal({
                            ...counterProposal,
                            items: [...counterProposal.items, { productId: 0, quantity: 1, price: 0 }]
                          });
                        }}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                      >
                        + Ajouter un produit
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Message (optionnel)</label>
                    <textarea
                      value={counterProposal.message}
                      onChange={(e) => setCounterProposal({ ...counterProposal, message: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg"
                      placeholder="Expliquez votre contre-proposition..."
                    />
                  </div>
                  {counterProposal.items.length > 0 && (
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm font-medium">
                        Total: {counterProposal.items.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2)}€
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setSelectedOrder(null);
                    setAction(null);
                    setRejectionReason('');
                    setCounterProposal({ items: [], message: '' });
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  onClick={handleAction}
                  disabled={
                    (action === 'reject' && !rejectionReason) ||
                    (action === 'counter' && counterProposal.items.length === 0)
                  }
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                >
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

