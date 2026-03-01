import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { safeJsonResponse } from '../utils/security';

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';

interface FAQItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  order: number;
  categoryOrder?: number;
}

export default function FAQPage() {
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchFAQs();
  }, []);

  const fetchFAQs = async () => {
    try {
      const response = await fetch(`${API_URL}/api/faq`);
      if (response.ok) {
        const data = await safeJsonResponse(response, []);
        if (Array.isArray(data)) {
          setFaqs(data);
        }
      }
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleItem = (id: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const categories: string[] = [];
  for (const f of faqs) {
    if (!categories.includes(f.category)) categories.push(f.category);
  }
  const faqsByCategory = categories.map(category => ({
    title: category,
    items: faqs.filter(f => f.category === category)
  }));

  if (loading) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Chargement...</p>
      </div>
    );
  }
  return (
    <div className="bg-white min-h-screen">
      <div className="relative border-b border-black/5">
        <div className="absolute inset-0">
          <img
            src="/Images/header2.webp"
            alt="Questions fréquentes"
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/85 to-white/60" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-18">
          <div className="max-w-2xl space-y-4">
            <p className="uppercase tracking-[0.28em] text-xs text-gray-500">FAQ</p>
            <h1 className="text-4xl sm:text-5xl font-light text-gray-900 leading-tight">Questions fréquentes</h1>
            <p className="text-gray-700 max-w-3xl">
              Trouvez rapidement les réponses à vos questions sur nos produits, commandes et services.
            </p>
          </div>
        </div>
      </div>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="space-y-8">
          {faqsByCategory.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>Aucune question fréquente disponible</p>
            </div>
          ) : (
            faqsByCategory.map((category, categoryIndex) => (
              <section key={categoryIndex} className="space-y-4">
                <h2 className="text-2xl font-light text-gray-900 border-b border-gray-200 pb-2">
                  {category.title}
                </h2>
                <div className="space-y-3">
                  {category.items.map((item) => {
                    const isOpen = openItems.has(item.id);
                    return (
                      <div
                        key={item.id}
                        className="border border-gray-200 rounded-lg overflow-hidden transition-all duration-200"
                      >
                        <button
                          type="button"
                          onClick={() => toggleItem(item.id)}
                          className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
                          aria-expanded={isOpen}
                        >
                          <span className="font-medium text-gray-900 pr-4">{item.question}</span>
                          <span className="text-gray-500 flex-shrink-0">
                            {isOpen ? (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            )}
                          </span>
                        </button>
                        {isOpen && (
                          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                            <p className="text-gray-600 leading-relaxed">{item.answer}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
        <div className="mt-12 p-6 bg-gradient-to-br from-[#f8f4ef] to-[#e5f2eb] rounded-3xl text-center">
          <h3 className="text-xl font-light text-gray-900 mb-2">Vous ne trouvez pas la réponse ?</h3>
          <p className="text-gray-600 mb-4">Notre équipe est là pour vous aider.</p>
          <Link
            to="/contact"
            className="inline-block bg-gray-900 text-white px-6 py-2 rounded-full hover:bg-gray-800 transition-all duration-300"
          >
            Contactez-nous
          </Link>
        </div>
      </main>
    </div>
  );
}
