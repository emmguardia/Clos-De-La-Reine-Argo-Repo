import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { sanitizeEmail, safeJsonResponse } from '../utils/security';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function LoginPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (e.target.name === 'email') {
      setFormData({ ...formData, email: sanitizeEmail(value) || value.slice(0, 255) });
    } else if (e.target.name === 'rememberMe') {
      setFormData({ ...formData, rememberMe: e.target.checked });
    } else {
      setFormData({ ...formData, [e.target.name]: value.slice(0, 500) });
    }
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          rememberMe: formData.rememberMe,
        }),
      });

      const data = await safeJsonResponse(response, { error: 'Erreur lors de la connexion' }) as { error?: string; token?: string; user?: { id?: string; email?: string; firstName?: string; lastName?: string } };

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la connexion');
      }

      if (data.token && typeof data.token === 'string' && data.user) {
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
      setError(err instanceof Error ? err.message : 'Erreur lors de la connexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8f4ef] via-white to-[#e5f2eb] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl shadow-black/10 p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#f2dedd] text-2xl">🐾</div>
          <h1 className="text-2xl font-light text-gray-900">Connexion</h1>
          <p className="text-sm text-gray-600">Accédez à votre espace en toute simplicité.</p>
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm">
            {error}
          </div>
        )}
        <form className="space-y-4" onSubmit={handleSubmit}>
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
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="rememberMe"
              name="rememberMe"
              checked={formData.rememberMe}
              onChange={handleChange}
              className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
            />
            <label htmlFor="rememberMe" className="text-sm text-gray-700 cursor-pointer">
              Rester connecté
            </label>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white py-3 rounded-2xl hover:bg-gray-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Connexion en cours...' : 'Se connecter'}
          </button>
        </form>
        <div className="text-center text-sm text-gray-600">
          <div>
            Pas encore de compte ?{' '}
            <Link to="/inscription" className="text-gray-900 font-medium underline underline-offset-4">
              Créer un compte
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
