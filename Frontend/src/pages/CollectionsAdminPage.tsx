import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Save, X, FolderOpen, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getTokenFromStorage, safeJsonResponse } from '../utils/security';

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';

interface Collection {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export default function CollectionsAdminPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchCollections();
  }, []);

  const fetchCollections = async () => {
    try {
      const token = getTokenFromStorage();
      if (!token) {
        window.location.href = '/connexion';
        return;
      }
      const response = await fetch(`${API_URL}/api/collections`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await safeJsonResponse(response, []);
        if (Array.isArray(data)) {
          setCollections(data);
        }
      }
    } catch (_error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const token = getTokenFromStorage();
      if (!token) return;

      const sanitizedName = formData.name.trim().slice(0, 100);

      if (!sanitizedName) {
        setError('Le nom est requis');
        return;
      }

      let response;
      if (editingId) {
        response = await fetch(`${API_URL}/api/collections/${editingId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            name: sanitizedName
          })
        });
      } else {
        response = await fetch(`${API_URL}/api/collections`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            name: sanitizedName
          })
        });
      }

      if (response.ok) {
        setSuccess(editingId ? 'Collection mise à jour' : 'Collection créée');
        setFormData({ name: '' });
        setShowAddForm(false);
        setEditingId(null);
        fetchCollections();
      } else {
        const data = await safeJsonResponse(response, { error: 'Erreur' });
        setError(data.error || 'Erreur lors de l\'opération');
      }
    } catch (_error) {
      setError('Erreur lors de l\'opération');
    }
  };

  const handleEdit = (collection: Collection) => {
    setFormData({
      name: collection.name
    });
    setEditingId(collection.id);
    setShowAddForm(true);
    setError('');
    setSuccess('');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette collection ?')) {
      return;
    }

    try {
      const token = getTokenFromStorage();
      if (!token) return;

      const response = await fetch(`${API_URL}/api/collections/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setSuccess('Collection supprimée');
        fetchCollections();
      } else {
        const data = await safeJsonResponse(response, { error: 'Erreur' });
        setError(data.error || 'Erreur lors de la suppression');
      }
    } catch (_error) {
      setError('Erreur lors de la suppression');
    }
  };

  const handleCancel = () => {
    setFormData({ name: '' });
    setShowAddForm(false);
    setEditingId(null);
    setError('');
    setSuccess('');
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
            <h1 className="text-4xl font-light text-gray-900 mb-2">Gestion des collections</h1>
            <p className="text-gray-600">Créez et gérez vos collections de produits</p>
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
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-light text-gray-900">Collections</h2>
            <button
              onClick={() => {
                setShowAddForm(true);
                setEditingId(null);
                setFormData({ name: '' });
              }}
              className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Ajouter
            </button>
          </div>

          {showAddForm && (
            <div className="mb-6 p-6 border-2 border-gray-200 rounded-2xl bg-gray-50">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {editingId ? 'Modifier la collection' : 'Nouvelle collection'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value.slice(0, 100) })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    placeholder="Ex: Back to School"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    {editingId ? 'Enregistrer' : 'Créer'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="flex items-center gap-2 bg-white text-gray-900 border border-gray-200 px-4 py-2 rounded-full hover:bg-gray-50 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Annuler
                  </button>
                </div>
              </form>
            </div>
          )}

          {collections.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FolderOpen className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>Aucune collection</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-4 px-4 text-sm font-medium text-gray-900">Nom</th>
                    <th className="text-right py-4 px-4 text-sm font-medium text-gray-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {collections.map((collection) => (
                    <tr key={collection.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-4 px-4">
                        <span className="font-medium text-gray-900">{collection.name}</span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(collection)}
                            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(collection.id)}
                            className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

