import { Package, FolderOpen, BarChart3, Image as ImageIcon, Plus, Edit, Trash2, Search, X, Save, ShoppingBag, HelpCircle, LogOut, Tag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useProducts } from '../hooks/useProducts';
import type { Product } from '../data/products';
import ImageUpload from '../components/ImageUpload';
import { sanitizeInput, sanitizeDescription, safeJsonResponse } from '../utils/security';

interface GalleryItem {
  id: string;
  name: string;
  data: string;
  type: 'professional' | 'client';
  createdAt: string;
  updatedAt?: string;
}

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';

export default function AdminPanelPage() {
  const { products, loading } = useProducts();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [collections, setCollections] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    category: 'colliers' as 'colliers' | 'laisses' | 'harnais',
    collection: '',
    color: '',
    image: '',
    secondImage: '',
    isNew: false,
    briefDescription: '',
    surcharge1m20: '',
    surchargeSurMesure: ''
  });
  const [additionalImages, setAdditionalImages] = useState<string[]>([]);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<Record<number, boolean>>({});
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [showGalleryForm, setShowGalleryForm] = useState(false);
  const [galleryFormType, setGalleryFormType] = useState<'professional' | 'client'>('professional');
  const [galleryFormData, setGalleryFormData] = useState({ name: '', image: '', type: 'professional' as 'professional' | 'client' });
  const [galleryError, setGalleryError] = useState('');
  const [gallerySuccess, setGallerySuccess] = useState('');
  const [galleryDeleteLoading, setGalleryDeleteLoading] = useState<Record<string, boolean>>({});
  const [currentPagePro, setCurrentPagePro] = useState(1);
  const [currentPageClient, setCurrentPageClient] = useState(1);
  const itemsPerPage = 6;
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

      fetchCollections();
      fetchGalleryItems();
    } catch {
      localStorage.removeItem('adminToken');
      window.location.href = '/admin/login';
    }
  };

  const fetchCollections = async () => {
    try {
      const response = await fetch(`${API_URL}/api/collections`);
      if (response.ok) {
        const data = await safeJsonResponse(response, []);
        if (Array.isArray(data) && data.length > 0) {
          const collectionNames = data.map((c: { name: string }) => c.name);
          setCollections(collectionNames);
          if (!formData.collection) {
            setFormData(prev => ({ ...prev, collection: collectionNames[0] }));
          }
        }
      }
    } catch (err) {
      console.error('Erreur:', err);
    }
  };

  const fetchGalleryItems = async () => {
    try {
      const adminToken = localStorage.getItem('adminToken');
      if (!adminToken) return;
      const response = await fetch(`${API_URL}/api/gallery`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (response.ok) {
        const data = await safeJsonResponse(response, []);
        if (Array.isArray(data)) {
          setGalleryItems(data);
        }
      }
    } catch (err) {
      console.error('Erreur:', err);
    } finally {
      setGalleryLoading(false);
    }
  };

  const handleGallerySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGalleryError('');
    setGallerySuccess('');

    try {
      const adminToken = localStorage.getItem('adminToken');
      if (!adminToken) {
        window.location.href = '/admin/login';
        return;
      }

      const sanitizedName = sanitizeInput(galleryFormData.name).slice(0, 200);
      if (!sanitizedName) {
        setGalleryError('Le nom est requis');
        return;
      }
      if (!galleryFormData.image) {
        setGalleryError('L\'image est requise');
        return;
      }

      const response = await fetch(`${API_URL}/api/gallery`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          name: sanitizedName,
          type: galleryFormType,
          image: galleryFormData.image
        })
      });

      if (response.ok) {
        setGallerySuccess('Image ajoutée');
        setGalleryFormData({ name: '', image: '', type: 'professional' });
        setShowGalleryForm(false);
        fetchGalleryItems();
      } else {
        const data = await safeJsonResponse(response, { error: 'Erreur' });
        setGalleryError(data.error || 'Erreur lors de l\'ajout');
      }
    } catch {
      setGalleryError('Erreur lors de l\'ajout');
    }
  };

  const handleGalleryDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette image ?')) return;

    try {
      const adminToken = localStorage.getItem('adminToken');
      if (!adminToken) {
        window.location.href = '/admin/login';
        return;
      }

      setGalleryDeleteLoading({ ...galleryDeleteLoading, [id]: true });
      const response = await fetch(`${API_URL}/api/gallery/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });

      if (response.ok) {
        setGallerySuccess('Image supprimée');
        fetchGalleryItems();
      } else {
        const data = await safeJsonResponse(response, { error: 'Erreur' });
        setGalleryError(data.error || 'Erreur lors de la suppression');
      }
    } catch {
      setGalleryError('Erreur lors de la suppression');
    } finally {
      setGalleryDeleteLoading({ ...galleryDeleteLoading, [id]: false });
    }
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    let sanitizedValue = value;

    if (e.target.name === 'category') {
      setFormData({ ...formData, category: value as 'colliers' | 'laisses' | 'harnais' });
      setFormError('');
      setFormSuccess('');
      return;
    }

    if (e.target.name === 'name') {
      sanitizedValue = value.replace(/[<>]/g, '').slice(0, 200);
    } else if (e.target.name === 'price') {
      sanitizedValue = value.replace(/[^0-9.,]/g, '').slice(0, 10);
    } else if (e.target.name === 'surcharge1m20' || e.target.name === 'surchargeSurMesure') {
      sanitizedValue = value.replace(/[^0-9.,]/g, '').slice(0, 10);
    } else if (e.target.name === 'color') {
      sanitizedValue = value.replace(/[<>]/g, '').slice(0, 500);
    } else if (e.target.name === 'briefDescription') {
      sanitizedValue = sanitizeDescription(value, 500);
    } else if (e.target.name === 'image' || e.target.name === 'secondImage') {
      sanitizedValue = value.slice(0, 1000);
    }

    setFormData({ ...formData, [e.target.name]: sanitizedValue });
    setFormError('');
    setFormSuccess('');
  };

  const resetForm = () => {
    setFormData({
      name: '',
      price: '',
      category: 'colliers',
      collection: collections.length > 0 ? collections[0] : '',
      color: '',
      image: '',
      secondImage: '',
      isNew: false,
      briefDescription: '',
      surcharge1m20: '',
      surchargeSurMesure: ''
    });
    setAdditionalImages([]);
    setFormError('');
    setFormSuccess('');
    setEditingProduct(null);
    setShowAddForm(false);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      price: product.price.toString(),
      category: product.category,
      collection: product.collection,
      color: Array.isArray(product.color) ? product.color.join(', ') : product.color,
      image: product.image,
      secondImage: product.secondImage || '',
      isNew: product.isNew || false,
      briefDescription: product.briefDescription || '',
      surcharge1m20: product.surcharge1m20 != null ? String(product.surcharge1m20).replace('.', ',') : '',
      surchargeSurMesure: product.surchargeSurMesure != null ? String(product.surchargeSurMesure).replace('.', ',') : ''
    });
    setAdditionalImages(product.additionalImages || []);
    setShowAddForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setFormLoading(true);

    if (!formData.name.trim() || !formData.price || !formData.image) {
      setFormError('Nom, prix et image principale sont requis');
      setFormLoading(false);
      return;
    }

    try {
      const adminToken = localStorage.getItem('adminToken');
      if (!adminToken) {
        setFormError('Session expirée. Veuillez vous reconnecter.');
        setFormLoading(false);
        window.location.href = '/admin/login';
        return;
      }
      
      const url = editingProduct 
        ? `${API_URL}/api/products/${editingProduct.id}`
        : `${API_URL}/api/products`;
      
      const method = editingProduct ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          price: parseFloat(formData.price),
          category: formData.category,
          collection: formData.collection,
          color: formData.color.trim(),
          image: formData.image,
          secondImage: formData.secondImage || undefined,
          additionalImages: additionalImages.filter((url) => typeof url === 'string' && url.trim().length > 0),
          isNew: formData.isNew,
          briefDescription: formData.briefDescription || undefined,
          surcharge1m20: formData.category === 'laisses' ? (formData.surcharge1m20 ? formData.surcharge1m20.replace(',', '.') : null) : null,
          surchargeSurMesure: formData.category === 'colliers' || formData.category === 'harnais' ? (formData.surchargeSurMesure ? formData.surchargeSurMesure.replace(',', '.') : null) : null
        }),
      });

      const data = await safeJsonResponse(response, { error: `Erreur lors de ${editingProduct ? 'la mise à jour' : 'la création'} du produit` });

      if (!response.ok) {
        throw new Error(data.error || `Erreur lors de ${editingProduct ? 'la mise à jour' : 'la création'} du produit`);
      }

      setFormSuccess(editingProduct ? 'Produit mis à jour avec succès' : 'Produit créé avec succès');
      setTimeout(() => {
        resetForm();
        window.location.reload();
      }, 1500);
    } catch {
      setFormError(err instanceof Error ? err.message : 'Erreur lors de l\'opération');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (productId: number) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) {
      return;
    }

    setDeleteLoading({ ...deleteLoading, [productId]: true });

    try {
      const adminToken = localStorage.getItem('adminToken');
      if (!adminToken) {
        alert('Session expirée. Veuillez vous reconnecter.');
        window.location.href = '/admin/login';
        return;
      }
      
      const response = await fetch(`${API_URL}/api/products/${productId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        },
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la suppression du produit');
      }

      window.location.reload();
    } catch {
      alert(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    } finally {
      setDeleteLoading({ ...deleteLoading, [productId]: false });
    }
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.collection.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleLogout = () => {
    if (confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
      localStorage.removeItem('adminToken');
      window.location.href = '/admin/login';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-light text-gray-900 mb-2">Panel Admin</h1>
            <p className="text-gray-600">Gestion de la boutique</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-full hover:bg-red-700 transition-colors"
              title="Déconnexion"
            >
              <LogOut className="w-4 h-4" />
              Déconnexion
            </button>
            <Link
              to="/admin/commandes"
              className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors"
            >
              <ShoppingBag className="w-4 h-4" />
              Commandes
            </Link>
            <Link
              to="/admin/collections"
              className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              Collections
            </Link>
            <Link
              to="/admin/faq"
              className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
              FAQ
            </Link>
            <Link
              to="/stats"
              className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors"
            >
              <BarChart3 className="w-4 h-4" />
              Statistiques
            </Link>
            <Link
              to="/admin/promo-codes"
              className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors"
            >
              <Tag className="w-4 h-4" />
              Codes promo
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <Package className="w-8 h-8 text-gray-600" />
              <span className="text-2xl font-light text-gray-900">{loading ? '...' : products.length}</span>
            </div>
            <p className="text-sm text-gray-600">Produits</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <FolderOpen className="w-8 h-8 text-gray-600" />
              <span className="text-2xl font-light text-gray-900">{loading ? '...' : collections.length}</span>
            </div>
            <p className="text-sm text-gray-600">Collections</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <ImageIcon className="w-8 h-8 text-gray-600" />
              <span className="text-2xl font-light text-gray-900">{galleryLoading ? '...' : galleryItems.length}</span>
            </div>
            <p className="text-sm text-gray-600">Photos galerie</p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <section className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-light text-gray-900">Produits</h2>
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
                      {editingProduct ? 'Modifier le produit' : 'Nouveau produit'}
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nom du produit *</label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleFormChange}
                        placeholder="Ex: Collier"
                        required
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Prix (€) *</label>
                      <input
                        type="number"
                        name="price"
                        value={formData.price}
                        onChange={handleFormChange}
                        placeholder="98"
                        step="0.01"
                        required
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie *</label>
                        <select
                          name="category"
                          value={formData.category}
                          onChange={handleFormChange}
                          required
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                        >
                          <option value="colliers">Colliers</option>
                          <option value="laisses">Laisses</option>
                          <option value="harnais">Harnais</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Collection *</label>
                        <select
                          name="collection"
                          value={formData.collection}
                          onChange={handleFormChange}
                          required
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                        >
                          {collections.length === 0 ? (
                            <option value="">Aucune collection disponible</option>
                          ) : (
                            collections.map((col) => (
                              <option key={col} value={col}>{col}</option>
                            ))
                          )}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Couleurs (séparées par des virgules)</label>
                      <input
                        type="text"
                        name="color"
                        value={formData.color}
                        onChange={handleFormChange}
                        placeholder="Ex: Bleu, Blanc, Rouge"
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                    </div>
                    {formData.category === 'laisses' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Supplément 1,20 m (€)</label>
                        <input
                          type="text"
                          name="surcharge1m20"
                          value={formData.surcharge1m20}
                          onChange={handleFormChange}
                          placeholder="Ex: 3 ou vide"
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                        />
                        <p className="text-xs text-gray-500 mt-1">Si rempli, ce montant s&apos;ajoute au prix quand le client choisit 1,20 m. Vide = 0 €</p>
                      </div>
                    )}
                    {(formData.category === 'colliers' || formData.category === 'harnais') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Supplément sur mesure (€)</label>
                        <input
                          type="text"
                          name="surchargeSurMesure"
                          value={formData.surchargeSurMesure}
                          onChange={handleFormChange}
                          placeholder="Ex: 5 ou vide"
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                        />
                        <p className="text-xs text-gray-500 mt-1">Si rempli, ce montant s&apos;ajoute quand le client coche « sur mesure » au paiement. Vide = 0 €</p>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Brève description (optionnel)</label>
                      <textarea
                        name="briefDescription"
                        value={formData.briefDescription}
                        onChange={handleFormChange}
                        placeholder="Courte description du produit pour la fiche"
                        rows={3}
                        maxLength={500}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                      />
                    </div>
                    <div>
                      <ImageUpload
                        label="Image principale *"
                        currentImage={formData.image}
                        onImageUploaded={(url) => setFormData({ ...formData, image: url })}
                      />
                    </div>
                    <div>
                      <ImageUpload
                        label="Image secondaire (optionnel)"
                        currentImage={formData.secondImage}
                        onImageUploaded={(url) => setFormData({ ...formData, secondImage: url })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Images supplémentaires</label>
                      <div className="space-y-2">
                        {additionalImages.map((img, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <div className="flex-1">
                              <ImageUpload
                                label=""
                                currentImage={img}
                                onImageUploaded={(url) => {
                                  const newImages = [...additionalImages];
                                  newImages[index] = url;
                                  setAdditionalImages(newImages);
                                }}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => setAdditionalImages(additionalImages.filter((_, i) => i !== index))}
                              className="p-2 text-red-600 hover:bg-red-50 rounded"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => setAdditionalImages([...additionalImages, ''])}
                          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                        >
                          + Ajouter une image
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isNew"
                        name="isNew"
                        checked={formData.isNew}
                        onChange={(e) => setFormData({ ...formData, isNew: e.target.checked })}
                        className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
                      />
                      <label htmlFor="isNew" className="text-sm font-medium text-gray-700">
                        Marquer comme nouveauté (affiché sur la page d'accueil)
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
                            {editingProduct ? 'Mettre à jour' : 'Enregistrer'}
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
              <div className="mb-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Rechercher un produit..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>
              <div>
                <h3 className="text-xl font-light text-gray-900 mb-4">Liste des produits</h3>
                {loading ? (
                  <div className="text-center py-8 text-gray-500">Chargement des produits...</div>
                ) : filteredProducts.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">Aucun produit trouvé</div>
                ) : (
                  <div className="space-y-4">
                    {filteredProducts.map((product) => (
                      <div key={product.id} className="p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-4">
                          <img
                            src={product.image}
                            alt={product.name}
                            className="w-16 h-16 object-cover rounded-lg"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"%3E%3Crect width="64" height="64" fill="%23e5e7eb"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="12"%3EImage%3C/text%3E%3C/svg%3E';
                            }}
                          />
                          <div className="flex-1">
                            <h3 className="font-medium text-gray-900">{product.name}</h3>
                            <p className="text-sm text-gray-600">{product.collection} · {product.price}€</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {product.category} · {Array.isArray(product.color) ? product.color.join(', ') : product.color}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEdit(product)}
                              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                              title="Modifier"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(product.id)}
                              disabled={deleteLoading[product.id]}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Supprimer"
                            >
                              {deleteLoading[product.id] ? (
                                <span className="text-xs">...</span>
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
            <section className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-light text-gray-900">Collections</h2>
                <Link
                  to="/admin/collections"
                  className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors"
                >
                  <FolderOpen className="w-4 h-4" />
                  Gérer les collections
                </Link>
              </div>
              {collections.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>Aucune collection</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {collections.map((collection) => (
                    <div key={collection} className="p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium text-gray-900">{collection}</h3>
                      </div>
                      <p className="text-sm text-gray-600">
                        {products.filter(p => p.collection === collection).length} produits
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
          <div className="space-y-8">
            <section className="bg-white rounded-2xl p-6 shadow-sm">
              <h2 className="text-2xl font-light text-gray-900 mb-6">Galerie</h2>
              {galleryError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{galleryError}</div>
              )}
              {gallerySuccess && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm">{gallerySuccess}</div>
              )}
              {showGalleryForm && (
                <div className="mb-6 p-4 border-2 border-gray-200 rounded-xl bg-gray-50">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900">Ajouter une image</h3>
                    <button onClick={() => { setShowGalleryForm(false); setGalleryFormData({ name: '', image: '', type: 'professional' }); setGalleryError(''); setGallerySuccess(''); }} className="text-gray-500 hover:text-gray-700">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <form onSubmit={handleGallerySubmit} className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                      <select
                        value={galleryFormType}
                        onChange={(e) => setGalleryFormType(e.target.value as 'professional' | 'client')}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm"
                      >
                        <option value="professional">Professionnelle</option>
                        <option value="client">Client</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                      <input
                        type="text"
                        required
                        value={galleryFormData.name}
                        onChange={(e) => setGalleryFormData({ ...galleryFormData, name: e.target.value.slice(0, 200) })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm"
                        placeholder="Nom de l'image..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Image *</label>
                      <ImageUpload
                        onImageUploaded={(imageUrl) => setGalleryFormData({ ...galleryFormData, image: imageUrl })}
                        currentImage={galleryFormData.image}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors text-sm"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Ajouter
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowGalleryForm(false); setGalleryFormData({ name: '', image: '', type: 'professional' }); setGalleryError(''); setGallerySuccess(''); }}
                        className="px-4 py-2 border border-gray-300 rounded-full hover:bg-gray-50 transition-colors text-sm"
                      >
                        Annuler
                      </button>
                    </div>
                  </form>
                </div>
              )}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Photos professionnelles</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {galleryItems.filter(i => i.type === 'professional').length} photo{galleryItems.filter(i => i.type === 'professional').length > 1 ? 's' : ''} au total
                    </p>
                  </div>
                  <button
                    onClick={() => { setShowGalleryForm(true); setGalleryFormType('professional'); setGalleryFormData({ name: '', image: '', type: 'professional' }); setGalleryError(''); setGallerySuccess(''); }}
                    className="flex items-center gap-2 bg-gray-900 text-white px-3 py-1.5 rounded-full hover:bg-gray-800 transition-colors text-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Ajouter
                  </button>
                </div>
                {galleryLoading ? (
                  <div className="text-center py-8 text-gray-500 text-sm">Chargement...</div>
                ) : (
                  <>
                    {galleryItems.filter(i => i.type === 'professional').length === 0 ? (
                      <div className="text-center py-8 text-gray-500 text-sm">Aucune photo professionnelle</div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          {galleryItems
                            .filter(i => i.type === 'professional')
                            .slice((currentPagePro - 1) * itemsPerPage, currentPagePro * itemsPerPage)
                            .map((item) => (
                              <div key={item.id} className="relative group">
                                <img
                                  src={item.data}
                                  alt={item.name}
                                  className="w-full h-24 object-cover rounded-lg"
                                />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => handleGalleryDelete(item.id)}
                                    disabled={galleryDeleteLoading[item.id]}
                                    className="p-1.5 bg-white text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                                  >
                                    {galleryDeleteLoading[item.id] ? (
                                      <span className="text-xs">...</span>
                                    ) : (
                                      <Trash2 className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            ))}
                        </div>
                        {Math.ceil(galleryItems.filter(i => i.type === 'professional').length / itemsPerPage) > 1 && (
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => setCurrentPagePro(prev => Math.max(1, prev - 1))}
                              disabled={currentPagePro === 1}
                              className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Précédent
                            </button>
                            <div className="flex items-center gap-1">
                              {Array.from({ length: Math.min(5, Math.ceil(galleryItems.filter(i => i.type === 'professional').length / itemsPerPage)) }, (_, i) => {
                                const page = i + 1;
                                return (
                                  <button
                                    key={page}
                                    onClick={() => setCurrentPagePro(page)}
                                    className={`w-7 h-7 rounded-lg text-xs ${currentPagePro === page ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                                  >
                                    {page}
                                  </button>
                                );
                              })}
                            </div>
                            <button
                              onClick={() => setCurrentPagePro(prev => Math.min(Math.ceil(galleryItems.filter(i => i.type === 'professional').length / itemsPerPage), prev + 1))}
                              disabled={currentPagePro >= Math.ceil(galleryItems.filter(i => i.type === 'professional').length / itemsPerPage)}
                              className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Suivant
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Photos clients</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {galleryItems.filter(i => i.type === 'client').length} photo{galleryItems.filter(i => i.type === 'client').length > 1 ? 's' : ''} au total
                    </p>
                  </div>
                  <button
                    onClick={() => { setShowGalleryForm(true); setGalleryFormType('client'); setGalleryFormData({ name: '', image: '', type: 'client' }); setGalleryError(''); setGallerySuccess(''); }}
                    className="flex items-center gap-2 bg-gray-900 text-white px-3 py-1.5 rounded-full hover:bg-gray-800 transition-colors text-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Ajouter
                  </button>
                </div>
                {galleryLoading ? (
                  <div className="text-center py-8 text-gray-500 text-sm">Chargement...</div>
                ) : (
                  <>
                    {galleryItems.filter(i => i.type === 'client').length === 0 ? (
                      <div className="text-center py-8 text-gray-500 text-sm">Aucune photo client</div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          {galleryItems
                            .filter(i => i.type === 'client')
                            .slice((currentPageClient - 1) * itemsPerPage, currentPageClient * itemsPerPage)
                            .map((item) => (
                              <div key={item.id} className="relative group">
                                <img
                                  src={item.data}
                                  alt={item.name}
                                  className="w-full h-24 object-cover rounded-lg"
                                />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => handleGalleryDelete(item.id)}
                                    disabled={galleryDeleteLoading[item.id]}
                                    className="p-1.5 bg-white text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                                  >
                                    {galleryDeleteLoading[item.id] ? (
                                      <span className="text-xs">...</span>
                                    ) : (
                                      <Trash2 className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            ))}
                        </div>
                        {Math.ceil(galleryItems.filter(i => i.type === 'client').length / itemsPerPage) > 1 && (
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => setCurrentPageClient(prev => Math.max(1, prev - 1))}
                              disabled={currentPageClient === 1}
                              className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Précédent
                            </button>
                            <div className="flex items-center gap-1">
                              {Array.from({ length: Math.min(5, Math.ceil(galleryItems.filter(i => i.type === 'client').length / itemsPerPage)) }, (_, i) => {
                                const page = i + 1;
                                return (
                                  <button
                                    key={page}
                                    onClick={() => setCurrentPageClient(page)}
                                    className={`w-7 h-7 rounded-lg text-xs ${currentPageClient === page ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                                  >
                                    {page}
                                  </button>
                                );
                              })}
                            </div>
                            <button
                              onClick={() => setCurrentPageClient(prev => Math.min(Math.ceil(galleryItems.filter(i => i.type === 'client').length / itemsPerPage), prev + 1))}
                              disabled={currentPageClient >= Math.ceil(galleryItems.filter(i => i.type === 'client').length / itemsPerPage)}
                              className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Suivant
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
