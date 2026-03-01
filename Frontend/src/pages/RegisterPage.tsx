import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { trackEvent } from '../utils/analytics';
import { sanitizeDescription, sanitizeEmail, safeJsonResponse } from '../utils/security';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    let sanitizedValue = value;
    
    if (e.target.name === 'email') {
      sanitizedValue = sanitizeEmail(value) || value.slice(0, 255);
    } else if (e.target.name === 'firstName' || e.target.name === 'lastName') {
      sanitizedValue = sanitizeDescription(value, 50);
    } else if (e.target.name === 'password' || e.target.name === 'confirmPassword') {
      sanitizedValue = value.slice(0, 128);
    }
    
    setFormData({ ...formData, [e.target.name]: sanitizedValue });
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (formData.password !== formData.confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await safeJsonResponse(response, { error: 'Erreur lors de l\'inscription' }) as { error?: string; token?: string; user?: { id?: string; email?: string; firstName?: string; lastName?: string } };

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de l\'inscription');
      }

      if (data.token && typeof data.token === 'string' && data.user) {
        trackEvent('register_success', {});
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify({
          id: String(data.user.id || ''),
          email: String(data.user.email || '').slice(0, 255),
          firstName: String(data.user.firstName || '').slice(0, 50),
          lastName: String(data.user.lastName || '').slice(0, 50)
        }));
        navigate('/');
        window.location.reload();
      } else {
        throw new Error('Données de réponse invalides');
      }
    } catch (err) {
      trackEvent('register_error', {});
      setError(err instanceof Error ? err.message : "Erreur lors de l'inscription");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8f4ef] via-white to-[#e5f2eb] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl shadow-black/10 p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#f2dedd] text-2xl">✨</div>
          <h1 className="text-2xl font-light text-gray-900">Créer un compte</h1>
          <p className="text-sm text-gray-600">Rejoignez Le Clos de la Reine et découvrez nos collections.</p>
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm">
            {error}
          </div>
        )}
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm text-gray-700">Prénom</label>
            <input
              type="text"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              placeholder="Votre prénom"
              required
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm focus:outline-none focus:border-gray-900"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-gray-700">Nom</label>
            <input
              type="text"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              placeholder="Votre nom"
              required
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm focus:outline-none focus:border-gray-900"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-gray-700">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="vous@email.com"
              required
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm focus:outline-none focus:border-gray-900"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-gray-700">Mot de passe</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                required
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 pr-12 text-sm focus:outline-none focus:border-gray-900"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 transition-colors"
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-xs text-gray-500">Min. 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-gray-700">Confirmer le mot de passe</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="••••••••"
                required
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 pr-12 text-sm focus:outline-none focus:border-gray-900"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700 transition-colors"
                aria-label={showConfirmPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white py-3 rounded-2xl hover:bg-gray-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Création en cours...' : 'Créer mon compte'}
          </button>
        </form>
        <div className="text-center text-sm text-gray-600 space-y-2">
          <div>
            Déjà un compte ?{' '}
            <Link to="/connexion" className="text-gray-900 font-medium underline underline-offset-4">
              Se connecter
            </Link>
          </div>
          <div>
            <Link to="/" className="text-gray-900 underline underline-offset-4">
              Retour à l'accueil
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
