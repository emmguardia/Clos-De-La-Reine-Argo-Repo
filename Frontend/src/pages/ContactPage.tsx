import { useState } from 'react';
import { sanitizeInput, sanitizeEmail, sanitizeText } from '../utils/security';

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          subject: formData.subject,
          message: formData.message.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success) {
        setSuccess(true);
        setFormData({ name: '', email: '', subject: '', message: '' });
      } else {
        setError(data.error || 'Erreur lors de l\'envoi. Réessayez.');
      }
    } catch {
      setError('Erreur de connexion. Réessayez.');
    } finally {
      setLoading(false);
    }
  };
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = e.target.value;
    let sanitizedValue = value;
    
    if (e.target.name === 'email') {
      sanitizedValue = sanitizeEmail(value) || value.slice(0, 255);
    } else if (e.target.name === 'name' || e.target.name === 'subject') {
      sanitizedValue = sanitizeInput(value).slice(0, 100);
    } else if (e.target.name === 'message') {
      sanitizedValue = sanitizeText(value, 2000);
    }
    
    setFormData({
      ...formData,
      [e.target.name]: sanitizedValue,
    });
  };
  return (
    <div className="bg-white min-h-screen">
      <div className="relative border-b border-black/5">
        <div className="absolute inset-0">
          <img
            src="/Images/header2.jpg"
            alt="Contactez-nous"
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/85 to-white/60" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-18">
          <div className="max-w-2xl space-y-4">
            <p className="uppercase tracking-[0.28em] text-xs text-gray-500">Contact</p>
            <h1 className="text-4xl sm:text-5xl font-light text-gray-900 leading-tight">Contactez-nous</h1>
            <p className="text-gray-700 max-w-3xl">
              Une question ? Un conseil ? Nous sommes là pour vous accompagner.
            </p>
          </div>
        </div>
      </div>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="grid md:grid-cols-2 gap-10">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-light text-gray-900 mb-4">Informations de contact</h2>
              <div className="space-y-4 text-gray-600">
                <div>
                  <p className="font-medium text-gray-900 mb-1">Email</p>
                  <a href="mailto:contact@closdelareine.fr" className="hover:text-gray-900 transition-colors">
                    closdelareine@gmail.com
                  </a>
                </div>
                <div>
                  <p className="font-medium text-gray-900 mb-1">Horaires</p>
                  <p>Lundi - Vendredi : 9h - 18h</p>
                  <p>Samedi : 10h - 16h</p>
                </div>
              </div>
            </div>
            <div className="pt-6 border-t border-gray-200">
              <h3 className="text-lg font-light text-gray-900 mb-3">Le Clos de la Reine</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Une maison française qui imagine colliers, laisses et harnais au croisement de
                l'élégance épurée et de la fonctionnalité. Matières douces, finitions sellier,
                palette crème, rose poudré et vert clair pour sublimer vos compagnons et votre intérieur.
              </p>
            </div>
          </div>
          <div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-900 mb-2">
                  Nom complet
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                  placeholder="Votre nom"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-900 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                  placeholder="votre@email.com"
                />
              </div>
              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-gray-900 mb-2">
                  Sujet
                </label>
                <select
                  id="subject"
                  name="subject"
                  value={formData.subject}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                >
                  <option value="">Sélectionnez un sujet</option>
                  <option value="commande">Question sur une commande</option>
                  <option value="produit">Question sur un produit</option>
                  <option value="retour">Retour / Échange</option>
                  <option value="partenariat">Partenariat</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-gray-900 mb-2">
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  required
                  rows={6}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all resize-none"
                  placeholder="Votre message..."
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gray-900 text-white px-8 py-3 rounded-full hover:bg-gray-800 transition-all duration-300 transform hover:scale-105 shadow-lg shadow-gray-900/10 disabled:opacity-60 disabled:pointer-events-none"
              >
                {loading ? 'Envoi en cours...' : 'Envoyer le message'}
              </button>
            </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
