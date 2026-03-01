import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Save, X, HelpCircle, ArrowLeft, GripVertical } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { sanitizeInput, sanitizeDescription, safeJsonResponse } from '../utils/security';

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';

interface FAQItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  order: number;
  categoryOrder?: number;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}

function SortableFAQRow({
  faq,
  onEdit,
  onDelete
}: {
  faq: FAQItem;
  onEdit: (faq: FAQItem) => void;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: faq.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${isDragging ? 'opacity-50 bg-gray-100' : ''}`}
    >
      <td className="py-4 px-4 w-10">
        <button
          type="button"
          className="p-1.5 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none"
          {...attributes}
          {...listeners}
          aria-label="Glisser pour réordonner"
        >
          <GripVertical className="w-5 h-5" />
        </button>
      </td>
      <td className="py-4 px-4">
        <span className="font-medium text-gray-900">{faq.category}</span>
      </td>
      <td className="py-4 px-4">
        <span className="text-gray-900">{faq.question}</span>
      </td>
      <td className="py-4 px-4">
        <span className="text-sm text-gray-600 line-clamp-2">{faq.answer}</span>
      </td>
      <td className="py-4 px-4">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => onEdit(faq)}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(faq.id)}
            className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function FAQAdminPage() {
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    category: '',
    question: '',
    answer: '',
    order: 0,
    categoryOrder: 0
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchFAQs = useCallback(async () => {
    try {
      const token = localStorage.getItem('adminToken');
      if (!token) {
        window.location.href = '/connexion';
        return;
      }
      const response = await fetch(`${API_URL}/api/faq`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await safeJsonResponse(response, []);
        if (Array.isArray(data)) {
          setFaqs(data);
        }
      }
    } catch {
      setError('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFAQs();
  }, [fetchFAQs]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('adminToken');
      if (!token) {
        window.location.href = '/admin/login';
        return;
      }

      const sanitizedCategory = sanitizeInput(formData.category).slice(0, 100);
      const sanitizedQuestion = sanitizeDescription(formData.question, 500).trim();
      const sanitizedAnswer = sanitizeDescription(formData.answer, 5000).trim();

      if (!sanitizedCategory || !sanitizedQuestion || !sanitizedAnswer) {
        setError('Tous les champs sont requis');
        return;
      }

      let response;
      if (editingId) {
        response = await fetch(`${API_URL}/api/faq/${editingId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            category: sanitizedCategory,
            question: sanitizedQuestion,
            answer: sanitizedAnswer,
            order: parseInt(String(formData.order)) || 0,
            categoryOrder: parseInt(String(formData.categoryOrder)) || 0
          })
        });
      } else {
        response = await fetch(`${API_URL}/api/faq`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            category: sanitizedCategory,
            question: sanitizedQuestion,
            answer: sanitizedAnswer,
            order: parseInt(String(formData.order)) || 0,
            categoryOrder: parseInt(String(formData.categoryOrder)) || 0
          })
        });
      }

      if (response.ok) {
        setSuccess(editingId ? 'FAQ mise à jour' : 'FAQ créée');
        setFormData({ category: '', question: '', answer: '', order: 0, categoryOrder: 0 });
        setShowAddForm(false);
        setEditingId(null);
        fetchFAQs();
      } else {
        const data = await safeJsonResponse(response, { error: 'Erreur' });
        setError(data.error || 'Erreur lors de l\'opération');
      }
    } catch {
      setError('Erreur lors de l\'opération');
    }
  };

  const handleEdit = (faq: FAQItem) => {
    setFormData({
      category: faq.category,
      question: faq.question,
      answer: faq.answer,
      order: faq.order,
      categoryOrder: faq.categoryOrder ?? 0
    });
    setEditingId(faq.id);
    setShowAddForm(true);
    setError('');
    setSuccess('');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette FAQ ?')) {
      return;
    }

    try {
      const token = localStorage.getItem('adminToken');
      if (!token) return;

      const response = await fetch(`${API_URL}/api/faq/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setSuccess('FAQ supprimée');
        fetchFAQs();
      } else {
        const data = await safeJsonResponse(response, { error: 'Erreur' });
        setError(data.error || 'Erreur lors de la suppression');
      }
    } catch {
      setError('Erreur lors de la suppression');
    }
  };

  const handleCancel = () => {
    setFormData({ category: '', question: '', answer: '', order: 0, categoryOrder: 0 });
    setShowAddForm(false);
    setEditingId(null);
    setError('');
    setSuccess('');
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = faqs.findIndex((f) => f.id === active.id);
    const newIndex = faqs.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newFaqs = arrayMove(faqs, oldIndex, newIndex);
    setFaqs(newFaqs);
    setSuccess('Ordre mis à jour');
    try {
      const token = localStorage.getItem('adminToken');
      if (!token) return;
      await fetch(`${API_URL}/api/faq/reorder`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          items: newFaqs.map((f, i) => ({ id: f.id, sortOrder: i }))
        })
      });
    } catch {
      setError('Erreur lors de la mise à jour de l\'ordre');
      fetchFAQs();
    }
  };

  const categories = Array.from(new Set(faqs.map((f: FAQItem) => f.category))).sort();

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
            <h1 className="text-4xl font-light text-gray-900 mb-2">Gestion de la FAQ</h1>
            <p className="text-gray-600">Créez et gérez vos questions fréquentes</p>
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
            <h2 className="text-2xl font-light text-gray-900">Questions</h2>
            <button
              onClick={() => {
                setShowAddForm(true);
                setEditingId(null);
                setFormData({ category: '', question: '', answer: '', order: 0, categoryOrder: 0 });
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
                {editingId ? 'Modifier la FAQ' : 'Nouvelle FAQ'}
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie *</label>
                  <input
                    type="text"
                    required
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: sanitizeInput(e.target.value).slice(0, 100) })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    placeholder="Ex: Commandes"
                    list="categories"
                  />
                  <datalist id="categories">
                    {categories.map(cat => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Question *</label>
                  <input
                    type="text"
                    required
                    value={formData.question}
                    onChange={(e) => setFormData({ ...formData, question: sanitizeDescription(e.target.value, 500) })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    placeholder="Votre question..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Réponse *</label>
                  <textarea
                    required
                    value={formData.answer}
                    onChange={(e) => setFormData({ ...formData, answer: sanitizeDescription(e.target.value, 5000) })}
                    rows={5}
                    className="w-full px-4 py-2 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
                    placeholder="Votre réponse..."
                  />
                </div>
                <p className="text-xs text-gray-500">Glissez les lignes dans la liste pour modifier l&apos;ordre d&apos;affichage.</p>
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

          {faqs.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <HelpCircle className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>Aucune FAQ</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <p className="text-sm text-gray-500 mb-4">Glissez l&apos;icône ⋮⋮ pour réordonner les questions</p>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="w-10 py-4 px-4" />
                      <th className="text-left py-4 px-4 text-sm font-medium text-gray-900">Catégorie</th>
                      <th className="text-left py-4 px-4 text-sm font-medium text-gray-900">Question</th>
                      <th className="text-left py-4 px-4 text-sm font-medium text-gray-900">Réponse</th>
                      <th className="text-right py-4 px-4 text-sm font-medium text-gray-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <SortableContext items={faqs.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                      {faqs.map((faq: FAQItem) => (
                        <SortableFAQRow
                          key={faq.id}
                          faq={faq}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                        />
                      ))}
                    </SortableContext>
                  </tbody>
                </table>
              </DndContext>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

