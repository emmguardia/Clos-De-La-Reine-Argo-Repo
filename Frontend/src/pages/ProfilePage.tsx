import { useState, useEffect } from 'react';
import type { ComponentType } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { User, Package, History, LogOut, Download, Trash2, Edit2, Save, X, CreditCard, CheckCircle, XCircle, Clock, Check, MessageSquare, XOctagon, Truck } from 'lucide-react';
import { useProducts } from '../hooks/useProducts';
import { safeJsonResponse, safeJsonParse } from '../utils/security';

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';

interface UserData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt?: string;
  lastLogin?: string;
}

interface OrderItem { productId: number; quantity: number; price: number }
interface Order {
  id: string;
  orderNumber?: string;
  items: OrderItem[];
  total: number;
  status: string;
  counterProposal?: { items: OrderItem[]; total: number; message?: string };
  rejectionReason?: string;
  paymentInfo?: Record<string, unknown>;
  createdAt: string;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { products } = useProducts();
  const [user, setUser] = useState<UserData | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const activeTabParam = searchParams.get('tab');
  const validTabs = ['informations', 'commandes', 'historique'];
  const sanitizedTab = activeTabParam && validTabs.includes(activeTabParam) 
    ? activeTabParam as 'informations' | 'commandes' | 'historique'
    : 'informations';
  const [activeTab, setActiveTab] = useState<'informations' | 'commandes' | 'historique'>(sanitizedTab);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    
    if (!token || !userStr) {
      navigate('/connexion');
      return;
    }

    const fetchUserData = async () => {
      try {
        const response = await fetch(`${API_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Erreur de récupération des données');
        }

        const data = await safeJsonResponse(response, {}) as UserData | null;
        if (data) {
          setUser(data);
        }
      } catch (error) {
        console.error('Erreur:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/connexion');
      } finally {
        setLoading(false);
      }
    };

    if (userStr) {
      setUser(safeJsonParse(userStr, {} as UserData));
    }
    fetchUserData();
  }, [navigate]);

  useEffect(() => {
    if (activeTab === 'commandes' || activeTab === 'historique') {
      fetchOrders();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'commandes') {
      localStorage.removeItem('newOrderBadge');
      window.dispatchEvent(new Event('newOrderBadgeUpdated'));
    }
  }, [activeTab]);

  const fetchOrders = async () => {
    setOrdersLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/orders`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await safeJsonResponse(response, []);
        if (Array.isArray(data)) {
          setOrders(data);
        }
      }
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setOrdersLoading(false);
    }
  };

  const getStatusInfo = (status: string) => {
    const statuses: Record<string, { label: string; icon: ComponentType<{ className?: string }>; color: string }> = {
      pending_validation: { label: 'En attente de validation', icon: Clock, color: 'text-yellow-600' },
      pending_counter_proposal: { label: 'Contre-proposition en attente', icon: Clock, color: 'text-blue-600' },
      validated: { label: 'Validée - Paiement requis', icon: CreditCard, color: 'text-green-600' },
      paid: { label: 'Payée', icon: CheckCircle, color: 'text-purple-600' },
      shipping: { label: 'En acheminement', icon: Package, color: 'text-indigo-600' },
      completed: { label: 'Terminée', icon: CheckCircle, color: 'text-gray-600' },
      rejected: { label: 'Refusée', icon: XCircle, color: 'text-red-600' }
    };
    return statuses[status] || { label: status, icon: Package, color: 'text-gray-600' };
  };

  const getProductName = (productId: number) => {
    const product = products.find(p => p.id === productId);
    return product ? product.name : `Produit #${productId}`;
  };

  const currentOrders = orders.filter(o => !['completed', 'rejected'].includes(o.status));
  const historyOrders = orders.filter(o => ['completed', 'rejected'].includes(o.status));

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#f8f4ef] via-white to-[#e5f2eb] flex items-center justify-center">
        <div className="text-gray-600">Chargement...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8f4ef] via-white to-[#e5f2eb] py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl shadow-black/10 overflow-hidden">
          <div className="bg-gradient-to-r from-[#f2dedd] to-[#e5f2eb] px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-light text-gray-900 mb-2">
                  Bonjour {user.firstName} 👋
                </h1>
                <p className="text-sm text-gray-600">{user.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 px-4 py-2 bg-white/80 hover:bg-white rounded-2xl text-sm text-gray-700 transition-all duration-200"
              >
                <LogOut className="w-4 h-4" />
                <span>Déconnexion</span>
              </button>
            </div>
          </div>

          <div className="border-b border-gray-200">
            <div className="flex space-x-1 px-8">
              <button
                onClick={() => setActiveTab('informations')}
                className={`px-6 py-4 text-sm font-medium transition-all duration-200 relative ${
                  activeTab === 'informations'
                    ? 'text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <User className="w-4 h-4" />
                  <span>Informations</span>
                </div>
                {activeTab === 'informations' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900"></span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('commandes')}
                className={`px-6 py-4 text-sm font-medium transition-all duration-200 relative ${
                  activeTab === 'commandes'
                    ? 'text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Package className="w-4 h-4" />
                  <span>Commandes</span>
                </div>
                {activeTab === 'commandes' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900"></span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('historique')}
                className={`px-6 py-4 text-sm font-medium transition-all duration-200 relative ${
                  activeTab === 'historique'
                    ? 'text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <History className="w-4 h-4" />
                  <span>Historique</span>
                </div>
                {activeTab === 'historique' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900"></span>
                )}
              </button>
            </div>
          </div>

          <div className="p-8">
            {activeTab === 'informations' && (
              <InformationsTab user={user} setUser={setUser} />
            )}

            {activeTab === 'commandes' && (
              <div className="space-y-6">
                <div className="mb-8 bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl shadow-black/10 p-8 border border-black/5">
                  <h2 className="text-2xl font-light text-gray-900 mb-6 text-center">Comment se déroule votre commande ?</h2>
                  <div className="grid md:grid-cols-4 gap-6">
                    <div className="text-center">
                      <div className="bg-yellow-50 border-2 border-yellow-200 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                        <Package className="w-8 h-8 text-yellow-700" />
                      </div>
                      <h3 className="font-medium text-gray-900 mb-2 text-sm">1. Envoi du bon de commande</h3>
                      <p className="text-xs text-gray-600">Vous envoyez votre commande avec vos informations</p>
                    </div>
                    <div className="text-center">
                      <div className="bg-blue-50 border-2 border-blue-200 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-8 h-8 text-blue-700" />
                      </div>
                      <h3 className="font-medium text-gray-900 mb-2 text-sm">2. Validation par Joanne</h3>
                      <p className="text-xs text-gray-600">Joanne vérifie qu'elle peut fabriquer votre commande</p>
                    </div>
                    <div className="text-center">
                      <div className="bg-purple-50 border-2 border-purple-200 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                        <CreditCard className="w-8 h-8 text-purple-700" />
                      </div>
                      <h3 className="font-medium text-gray-900 mb-2 text-sm">3. Paiement</h3>
                      <p className="text-xs text-gray-600">Une fois validée, vous procédez au paiement</p>
                    </div>
                    <div className="text-center">
                      <div className="bg-green-50 border-2 border-green-200 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                        <Truck className="w-8 h-8 text-green-700" />
                      </div>
                      <h3 className="font-medium text-gray-900 mb-2 text-sm">4. Fabrication & Envoi</h3>
                      <p className="text-xs text-gray-600">Votre produit est fabriqué puis expédié</p>
                    </div>
                  </div>
                </div>
                <h2 className="text-xl font-light text-gray-900 mb-6">Mes commandes en cours</h2>
                {ordersLoading ? (
                  <div className="text-center py-12 text-gray-500">Chargement...</div>
                ) : currentOrders.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p>Aucune commande en cours</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {currentOrders.map(order => {
                      const statusInfo = getStatusInfo(order.status);
                      const StatusIcon = statusInfo.icon;
                      return (
                        <div key={order.id} className="border border-gray-200 rounded-lg p-6">
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <h3 className="font-medium text-gray-900 mb-1">Commande #{order.orderNumber || order.id.slice(-8)}</h3>
                              <div className="flex items-center gap-2 text-sm">
                                <StatusIcon className={`w-4 h-4 ${statusInfo.color}`} />
                                <span className={statusInfo.color}>{statusInfo.label}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-medium text-gray-900">{order.total.toFixed(2)}€</p>
                              <p className="text-xs text-gray-500">
                                {new Date(order.createdAt).toLocaleDateString('fr-FR')}
                              </p>
                            </div>
                          </div>
                          <div className="space-y-2 mb-4">
                            {order.items.map((item, idx) => (
                              <div key={idx} className="flex justify-between text-sm text-gray-600">
                                <span>{getProductName(item.productId)} x{item.quantity}</span>
                                <span>{(item.price * item.quantity).toFixed(2)}€</span>
                              </div>
                            ))}
                          </div>
                          {order.status === 'pending_counter_proposal' && (
                            <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                              {order.counterProposal ? (
                                <>
                                  <p className="text-sm font-medium text-blue-900 mb-2">Contre-proposition reçue</p>
                                  <div className="space-y-1 text-sm text-blue-800 mb-3">
                                    {order.counterProposal.items.map((item: OrderItem, idx: number) => (
                                      <div key={idx}>
                                        {getProductName(item.productId)} x{item.quantity} - {(item.price * item.quantity).toFixed(2)}€
                                      </div>
                                    ))}
                                  </div>
                                  <p className="text-sm font-medium text-blue-900 mb-3">
                                    Total: {order.counterProposal.total.toFixed(2)}€
                                  </p>
                                  {order.counterProposal.message && (
                                    <p className="text-sm text-blue-700 mb-3 p-2 bg-white/50 rounded">{order.counterProposal.message}</p>
                                  )}
                                </>
                              ) : (
                                <p className="text-sm font-medium text-blue-900 mb-3">Une contre-proposition vous a été envoyée. Consultez les détails pour accepter ou reproposer.</p>
                              )}
                              <div className="flex gap-3 mt-4">
                                <button
                                  onClick={() => navigate(`/commande/${order.id}/accepter`)}
                                  className="px-4 py-2 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-all duration-200 text-sm font-light flex items-center gap-2"
                                >
                                  <Check className="w-4 h-4" />
                                  Accepter
                                </button>
                                <button
                                  onClick={() => navigate(`/commande/${order.id}/reproposer`)}
                                  className="px-4 py-2 bg-white text-gray-900 border border-black/10 rounded-full hover:border-gray-900 transition-all duration-200 text-sm font-light flex items-center gap-2"
                                >
                                  <MessageSquare className="w-4 h-4" />
                                  Reproposer
                                </button>
                              </div>
                            </div>
                          )}
                          {order.rejectionReason && (
                            <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
                              <p className="text-sm text-red-800"><strong>Raison:</strong> {order.rejectionReason}</p>
                            </div>
                          )}
                          <div className="flex gap-3">
                            {order.status === 'validated' && (
                              <button
                                onClick={() => navigate(`/commande/${order.id}/paiement`)}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-all duration-200 text-sm font-light"
                              >
                                <CreditCard className="w-4 h-4" />
                                Procéder au paiement
                              </button>
                            )}
                            {!order.paymentInfo && ['pending_validation', 'pending_counter_proposal', 'validated'].includes(order.status) && (
                              <button
                                onClick={async () => {
                                  if (!confirm('Êtes-vous sûr de vouloir annuler cette commande ?')) {
                                    return;
                                  }
                                  try {
                                    const token = localStorage.getItem('token');
                                    const response = await fetch(`${API_URL}/api/orders/${order.id}/cancel`, {
                                      method: 'PUT',
                                      headers: {
                                        'Authorization': `Bearer ${token}`
                                      }
                                    });
                                    if (response.ok) {
                                      fetchOrders();
                                    } else {
                                      const data = await safeJsonResponse(response, { error: 'Erreur lors de l\'annulation' });
                                      alert(data.error || 'Erreur lors de l\'annulation');
                                    }
                                  } catch (error) {
                                    console.error('Erreur:', error);
                                    alert('Erreur lors de l\'annulation de la commande');
                                  }
                                }}
                                className="flex items-center justify-center gap-2 px-4 py-2 bg-white text-red-600 border border-red-200 rounded-full hover:border-red-600 hover:bg-red-50 transition-all duration-200 text-sm font-light"
                              >
                                <XOctagon className="w-4 h-4" />
                                Annuler
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'historique' && (
              <div className="space-y-6">
                <h2 className="text-xl font-light text-gray-900 mb-6">Historique des commandes</h2>
                {ordersLoading ? (
                  <div className="text-center py-12 text-gray-500">Chargement...</div>
                ) : historyOrders.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <History className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p>Aucune commande dans l'historique</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {historyOrders.map(order => {
                      const statusInfo = getStatusInfo(order.status);
                      const StatusIcon = statusInfo.icon;
                      return (
                        <div key={order.id} className="border border-gray-200 rounded-lg p-6">
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <h3 className="font-medium text-gray-900 mb-1">Commande #{order.orderNumber || order.id.slice(-8)}</h3>
                              <div className="flex items-center gap-2 text-sm">
                                <StatusIcon className={`w-4 h-4 ${statusInfo.color}`} />
                                <span className={statusInfo.color}>{statusInfo.label}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-medium text-gray-900">{order.total.toFixed(2)}€</p>
                              <p className="text-xs text-gray-500">
                                {new Date(order.createdAt).toLocaleDateString('fr-FR')}
                              </p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {order.items.map((item, idx) => (
                              <div key={idx} className="flex justify-between text-sm text-gray-600">
                                <span>{getProductName(item.productId)} x{item.quantity}</span>
                                <span>{(item.price * item.quantity).toFixed(2)}€</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InformationsTab({ user, setUser }: { user: UserData; setUser: (user: UserData | null) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
    setSuccess('');
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');
    setLoading(true);

    if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
      setError('Les nouveaux mots de passe ne correspondent pas');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/auth/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          currentPassword: formData.newPassword ? formData.currentPassword : undefined,
          newPassword: formData.newPassword || undefined
        }),
      });

      const data = await safeJsonResponse(response, { error: 'Erreur lors de la mise à jour', user: {} }) as { error?: string; user?: UserData };

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la mise à jour');
      }

      if (data.user) {
        setUser(data.user);
      }
      localStorage.setItem('user', JSON.stringify(data.user));
      setSuccess('Profil mis à jour avec succès');
      setIsEditing(false);
      setFormData({
        ...formData,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    });
    setIsEditing(false);
    setError('');
    setSuccess('');
  };

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/auth/export`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Erreur lors du téléchargement');
      }

      const data = await safeJsonResponse(response, {});
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mes-donnees-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du téléchargement');
    }
  };

  const handleDelete = async () => {
    if (!deletePassword) {
      setDeleteError('Veuillez entrer votre mot de passe');
      return;
    }

    setDeleteError('');
    setDeleteLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/auth/me`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password: deletePassword })
      });

      const data = await safeJsonResponse(response, { error: 'Erreur lors de la suppression' });

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la suppression');
      }

      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/';
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-light text-gray-900">Mes informations</h2>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-gray-900 text-white rounded-2xl hover:bg-gray-800 transition-all duration-200 text-sm"
          >
            <Edit2 className="w-4 h-4" />
            <span>Modifier</span>
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-2xl text-sm">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm text-gray-600">Prénom</label>
          {isEditing ? (
            <input
              type="text"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-black/10 bg-white rounded-2xl text-sm focus:outline-none focus:border-gray-900"
            />
          ) : (
            <div className="px-4 py-3 bg-gray-50 rounded-2xl text-gray-900">
              {user.firstName}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <label className="text-sm text-gray-600">Nom</label>
          {isEditing ? (
            <input
              type="text"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-black/10 bg-white rounded-2xl text-sm focus:outline-none focus:border-gray-900"
            />
          ) : (
            <div className="px-4 py-3 bg-gray-50 rounded-2xl text-gray-900">
              {user.lastName}
            </div>
          )}
        </div>
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm text-gray-600">Email</label>
          {isEditing ? (
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-black/10 bg-white rounded-2xl text-sm focus:outline-none focus:border-gray-900"
            />
          ) : (
            <div className="px-4 py-3 bg-gray-50 rounded-2xl text-gray-900">
              {user.email}
            </div>
          )}
        </div>

        {isEditing && (
          <>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm text-gray-600">Nouveau mot de passe (optionnel)</label>
              <input
                type="password"
                name="newPassword"
                value={formData.newPassword}
                onChange={handleChange}
                placeholder="Laisser vide pour ne pas changer"
                className="w-full px-4 py-3 border border-black/10 bg-white rounded-2xl text-sm focus:outline-none focus:border-gray-900"
              />
              <p className="text-xs text-gray-500">Min. 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre</p>
            </div>
            {formData.newPassword && (
              <>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm text-gray-600">Mot de passe actuel</label>
                  <input
                    type="password"
                    name="currentPassword"
                    value={formData.currentPassword}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border border-black/10 bg-white rounded-2xl text-sm focus:outline-none focus:border-gray-900"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm text-gray-600">Confirmer le nouveau mot de passe</label>
                  <input
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-black/10 bg-white rounded-2xl text-sm focus:outline-none focus:border-gray-900"
                  />
                </div>
              </>
            )}
          </>
        )}

        {user.createdAt && (
          <div className="space-y-2">
            <label className="text-sm text-gray-600">Membre depuis</label>
            <div className="px-4 py-3 bg-gray-50 rounded-2xl text-gray-900">
              {new Date(user.createdAt).toLocaleDateString('fr-FR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </div>
          </div>
        )}
        {user.lastLogin && (
          <div className="space-y-2">
            <label className="text-sm text-gray-600">Dernière connexion</label>
            <div className="px-4 py-3 bg-gray-50 rounded-2xl text-gray-900">
              {new Date(user.lastLogin).toLocaleDateString('fr-FR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>
        )}
      </div>

      {isEditing && (
        <div className="flex items-center space-x-4 pt-4">
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center space-x-2 px-6 py-3 bg-gray-900 text-white rounded-2xl hover:bg-gray-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            <span>{loading ? 'Enregistrement...' : 'Enregistrer'}</span>
          </button>
          <button
            onClick={handleCancel}
            className="flex items-center space-x-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-2xl hover:bg-gray-200 transition-all duration-200"
          >
            <X className="w-4 h-4" />
            <span>Annuler</span>
          </button>
        </div>
      )}

      <div className="border-t border-gray-200 pt-6 mt-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <button
            onClick={handleExport}
            className="flex items-center space-x-2 px-4 py-2 text-gray-700 hover:bg-gray-50 rounded-2xl transition-all duration-200 text-sm"
          >
            <Download className="w-4 h-4" />
            <span>Télécharger mes données</span>
          </button>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center space-x-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-2xl transition-all duration-200 text-sm"
          >
            <Trash2 className="w-4 h-4" />
            <span>Supprimer mon compte</span>
          </button>
        </div>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-xl font-light text-gray-900">Supprimer mon compte</h3>
            <p className="text-sm text-gray-600">
              Cette action est irréversible. Toutes vos données seront définitivement supprimées.
            </p>
            <div className="space-y-2">
              <label className="text-sm text-gray-600">Confirmez avec votre mot de passe</label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Votre mot de passe"
                className="w-full px-4 py-3 border border-black/10 bg-white rounded-2xl text-sm focus:outline-none focus:border-gray-900"
              />
            </div>
            {deleteError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm">
                {deleteError}
              </div>
            )}
            <div className="flex items-center space-x-4 pt-2">
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-2xl hover:bg-red-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {deleteLoading ? 'Suppression...' : 'Supprimer définitivement'}
              </button>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletePassword('');
                  setDeleteError('');
                }}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-2xl hover:bg-gray-200 transition-all duration-200 text-sm"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

