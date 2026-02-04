import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Save, X, Tag, ArrowLeft, CheckCircle, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { safeJsonResponse } from '../utils/security';

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';

interface PromoCode {
  id: string;
  name: string | null;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  maxUses: number;
  currentUses: number;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function AdminPromoCodesPage() {
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCode, setEditingCode] = useState<PromoCode | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    discountType: 'percentage' as 'percentage' | 'fixed',
    discountValue: '',
    maxUses: '',
    startDate: '',
    endDate: '',
    isActive: true
  });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const adminToken = localStorage.getItem('adminToken');
    if (!adminToken) {
      window.location.href = '/admin/login';
      return;
    }
    verifyAdminToken();
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

      fetchPromoCodes();
    } catch (_error) {
      localStorage.removeItem('adminToken');
      window.location.href = '/admin/login';
    }
  };

  const fetchPromoCodes = async () => {
    try {
      const adminToken = localStorage.getItem('adminToken');
      if (!adminToken) {
        window.location.href = '/admin/login';
        return;
      }

      const response = await fetch(`${API_URL}/api/promo-codes`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });

      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('adminToken');
        window.location.href = '/admin/login';
        return;
      }

      const data = await safeJsonResponse(response, []) as PromoCode[];
      setPromoCodes(data);
    } catch (_error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      discountType: 'percentage',
      discountValue: '',
      maxUses: '',
      startDate: '',
      endDate: '',
      isActive: true
    });
    setEditingCode(null);
    setShowAddForm(false);
    setFormError('');
    setFormSuccess('');
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData({ ...formData, [name]: (e.target as HTMLInputElement).checked });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleEdit = (code: PromoCode) => {
    setEditingCode(code);
    setFormData({
      name: code.name || '',
      code: code.code,
      discountType: code.discountType,
      discountValue: code.discountValue.toString(),
      maxUses: code.maxUses.toString(),
      startDate: code.startDate ? new Date(code.startDate).toISOString().split('T')[0] : '',
      endDate: code.endDate ? new Date(code.endDate).toISOString().split('T')[0] : '',
      isActive: code.isActive
    });
    setShowAddForm(true);
    setFormError('');
    setFormSuccess('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setFormLoading(true);

    try {
      const adminToken = localStorage.getItem('adminToken');
      if (!adminToken) {
        setFormError('Session expirée');
        window.location.href = '/admin/login';
        return;
      }

      const payload: any = {
        discountType: formData.discountType,
        discountValue: parseFloat(formData.discountValue),
        maxUses: parseInt(formData.maxUses),
        isActive: formData.isActive
      };

      if (formData.name.trim()) {
        payload.name = formData.name.trim();
      }

      if (formData.code.trim()) {
        payload.code = formData.code.trim().toUpperCase();
      }

      if (formData.startDate) {
        payload.startDate = new Date(formData.startDate).toISOString();
      }

      if (formData.endDate) {
        payload.endDate = new Date(formData.endDate).toISOString();
      }

      const url = editingCode 
        ? `${API_URL}/api/promo-codes/${editingCode.id}`
        : `${API_URL}/api/promo-codes`;
      const method = editingCode ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify(payload)
      });

      const data = await safeJsonResponse(response, { error: 'Erreur' });

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de l\'enregistrement');
      }

      setFormSuccess(editingCode ? 'Code promo mis à jour avec succès' : 'Code promo créé avec succès');
      await fetchPromoCodes();
      setTimeout(() => {
        resetForm();
      }, 1500);
    } catch (_error) {
      setFormError(error instanceof Error ? error.message : 'Erreur lors de l\'enregistrement');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce code promo ?')) {
      return;
    }

    setDeleteLoading({ ...deleteLoading, [id]: true });

    try {
      const adminToken = localStorage.getItem('adminToken');
      if (!adminToken) {
        alert('Session expirée');
        window.location.href = '/admin/login';
        return;
      }

      const response = await fetch(`${API_URL}/api/promo-codes/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });

      if (!response.ok) {
        const data = await safeJsonResponse(response, { error: 'Erreur' });
        throw new Error(data.error || 'Erreur lors de la suppression');
      }

      await fetchPromoCodes();
    } catch (_error) {
      alert(error instanceof Error ? error.message : 'Erreur lors de la suppression');
    } finally {
      setDeleteLoading({ ...deleteLoading, [id]: false });
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Aucune';
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  const isCodeExpired = (code: PromoCode) => {
    if (!code.endDate) return false;
    return new Date(code.endDate) < new Date();
  };

  const isCodeNotStarted = (code: PromoCode) => {
    if (!code.startDate) return false;
    return new Date(code.startDate) > new Date();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#f8f4ef] via-white to-[#e5f2eb] py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-8 text-gray-600">Chargement...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8f4ef] via-white to-[#e5f2eb] py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Link
            to="/admin"
            className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour au panel
          </Link>
          <h1 className="text-4xl font-light text-gray-900 mb-2">Gestion des codes promo</h1>
          <p className="text-gray-600">Créez et gérez vos codes de réduction</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-light text-gray-900">Codes promo</h2>
            <button
              onClick={() => {
                resetForm();
                setShowAddForm(true);
              }}
              className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Ajouter
            </button>
          </div>

          {showAddForm && (
            <div className="mb-6 p-6 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  {editingCode ? 'Modifier le code promo' : 'Nouveau code promo'}
                </h3>
                <button
                  onClick={resetForm}
                  className="p-1 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {formError && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {formError}
                </div>
              )}

              {formSuccess && (
                <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
                  {formSuccess}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nom (optionnel)
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleFormChange}
                    placeholder="Ex: Promotion été 2024"
                    maxLength={100}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <p className="text-xs text-gray-500 mt-1">Si vide, le code sera généré automatiquement</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Code promo {!editingCode && '(optionnel)'}
                  </label>
                  <input
                    type="text"
                    name="code"
                    value={formData.code}
                    onChange={handleFormChange}
                    placeholder={editingCode ? "Code" : "Ex: SUMMER2024 (ou laisser vide pour générer)"}
                    maxLength={50}
                    pattern="[A-Z0-9]*"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 uppercase"
                    style={{ textTransform: 'uppercase' }}
                  />
                  {!editingCode && (
                    <p className="text-xs text-gray-500 mt-1">Lettres majuscules et chiffres uniquement. Si vide, un code de 8 caractères sera généré automatiquement.</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Type de réduction *
                    </label>
                    <select
                      name="discountType"
                      value={formData.discountType}
                      onChange={handleFormChange}
                      required
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                    >
                      <option value="percentage">Pourcentage (%)</option>
                      <option value="fixed">Montant fixe (€)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Valeur de réduction *
                    </label>
                    <input
                      type="number"
                      name="discountValue"
                      value={formData.discountValue}
                      onChange={handleFormChange}
                      placeholder={formData.discountType === 'percentage' ? '10' : '50'}
                      step={formData.discountType === 'percentage' ? '0.1' : '0.01'}
                      min="0"
                      max={formData.discountType === 'percentage' ? '100' : '10000'}
                      required
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {formData.discountType === 'percentage' ? 'Entre 0 et 100%' : 'Montant en euros (max 10000€)'}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre d'utilisations max *
                  </label>
                  <input
                    type="number"
                    name="maxUses"
                    value={formData.maxUses}
                    onChange={handleFormChange}
                    placeholder="100"
                    min="1"
                    max="1000000"
                    required
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date de début (optionnel)
                    </label>
                    <input
                      type="date"
                      name="startDate"
                      value={formData.startDate}
                      onChange={handleFormChange}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date de fin (optionnel)
                    </label>
                    <input
                      type="date"
                      name="endDate"
                      value={formData.endDate}
                      onChange={handleFormChange}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleFormChange}
                    className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
                  />
                  <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
                    Code actif
                  </label>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={formLoading}
                    className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {formLoading ? (
                      'Enregistrement...'
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        {editingCode ? 'Mettre à jour' : 'Enregistrer'}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            </div>
          )}

          {promoCodes.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Tag className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>Aucun code promo</p>
            </div>
          ) : (
            <div className="space-y-4">
              {promoCodes.map((code) => {
                const expired = isCodeExpired(code);
                const notStarted = isCodeNotStarted(code);
                const isExhausted = code.currentUses >= code.maxUses;
                const isInvalid = !code.isActive || expired || notStarted || isExhausted;

                return (
                  <div
                    key={code.id}
                    className={`p-4 border rounded-xl transition-colors ${
                      isInvalid
                        ? 'border-red-200 bg-red-50'
                        : 'border-gray-100 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-medium text-gray-900">
                            {code.name || 'Sans nom'}
                          </h3>
                          <span className="px-2 py-1 bg-gray-900 text-white text-xs rounded font-mono">
                            {code.code}
                          </span>
                          {code.isActive ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-600" />
                          )}
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          <p>
                            Réduction: {code.discountValue}
                            {code.discountType === 'percentage' ? '%' : '€'}
                          </p>
                          <p>
                            Utilisations: {code.currentUses} / {code.maxUses}
                          </p>
                          {code.startDate && (
                            <p>Début: {formatDate(code.startDate)}</p>
                          )}
                          {code.endDate && (
                            <p className={expired ? 'text-red-600 font-medium' : ''}>
                              Fin: {formatDate(code.endDate)}
                            </p>
                          )}
                          {expired && (
                            <p className="text-red-600 font-medium">⚠️ Expiré</p>
                          )}
                          {notStarted && (
                            <p className="text-yellow-600 font-medium">⏳ Pas encore valide</p>
                          )}
                          {isExhausted && (
                            <p className="text-red-600 font-medium">⚠️ Limite atteinte</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEdit(code)}
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Modifier"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(code.id)}
                          disabled={deleteLoading[code.id]}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Supprimer"
                        >
                          {deleteLoading[code.id] ? (
                            <span className="text-xs">...</span>
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
