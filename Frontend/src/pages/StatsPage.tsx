import { useState, useEffect, useCallback } from 'react';
import { BarChart3, TrendingUp, TrendingDown, DollarSign, ShoppingBag, ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { safeJsonResponse } from '../utils/security';
import SEO from '../components/SEO';

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';

type Period = '7d' | '30d' | '3m' | '6m' | 'ytd';

interface Stats {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  monthlyRevenue: number;
  monthlyOrders: number;
  monthlyAverageOrderValue: number;
  lastMonthRevenue: number;
  lastMonthOrders: number;
  lastMonthAverageOrderValue: number;
  revenueChange: number;
  ordersChange: number;
  averageOrderValueChange: number;
  dailyStats: Array<{ date: string; revenue: number; orders: number }>;
  collectionStats: Record<string, number>;
  categoryStats: Record<string, number>;
}

function periodToRange(period: Period): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  const from = new Date(now);
  if (period === '7d') from.setDate(from.getDate() - 6);
  else if (period === '30d') from.setDate(from.getDate() - 29);
  else if (period === '3m') from.setMonth(from.getMonth() - 3);
  else if (period === '6m') from.setMonth(from.getMonth() - 6);
  else if (period === 'ytd') from.setMonth(0, 1);
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to };
}

export default function StatsPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('7d');
  const [filterCollection, setFilterCollection] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [allCollections, setAllCollections] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);

  const fetchStats = useCallback(async (p: Period, col: string, cat: string) => {
    if (!localStorage.getItem('isAdminLoggedIn')) { navigate('/admin/login'); return; }
    setLoading(true);
    try {
      const { from, to } = periodToRange(p);
      const params = new URLSearchParams({ from, to });
      if (col) params.set('collection', col);
      if (cat) params.set('category', cat);
      const response = await fetch(`${API_URL}/api/stats?${params}`, {
        credentials: 'include',
      });
      if (response.status === 401 || response.status === 403) { localStorage.removeItem('isAdminLoggedIn'); navigate('/admin/login'); return; }
      if (response.ok) {
        const data = await safeJsonResponse(response, null) as Stats | null;
        if (data) {
          setStats(data);
          if (!col && !cat) {
            setAllCollections(Object.keys(data.collectionStats));
            setAllCategories(Object.keys(data.categoryStats));
          }
        }
      }
    } catch (error) {
      console.error('Erreur lors de la récupération des stats:', error);
    } finally {
      setLoading(false);
    }
  }, [navigate, setAllCollections, setAllCategories]);

  useEffect(() => {
    if (!localStorage.getItem('isAdminLoggedIn')) { navigate('/admin/login'); return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStats(period, filterCollection, filterCategory);
  }, [period, filterCollection, filterCategory, fetchStats, navigate]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);

  const formatChange = (change: number) => ({
    text: `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`,
    color: change >= 0 ? 'text-green-600' : 'text-red-600'
  });

  if (loading && !stats) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Chargement...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Erreur lors du chargement des statistiques</p>
      </div>
    );
  }

  const revenueChange = formatChange(stats.revenueChange);
  const ordersChange = formatChange(stats.ordersChange);
  const avgOrderChange = formatChange(stats.averageOrderValueChange);
  const maxDailyRevenue = stats.dailyStats.length > 0
    ? Math.max(...stats.dailyStats.map(d => d.revenue || 0), 1)
    : 1;

  const displayCollections = allCollections.length > 0
    ? allCollections
    : Object.keys(stats.collectionStats);
  const displayCategories = allCategories.length > 0
    ? allCategories
    : Object.keys(stats.categoryStats);

  const periodLabels: Record<Period, string> = {
    '7d': '7 derniers jours',
    '30d': '30 derniers jours',
    '3m': '3 derniers mois',
    '6m': '6 derniers mois',
    'ytd': 'Année en cours'
  };

  return (
    <>
      <SEO title="Statistiques" noindex path="/stats" />
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-light text-gray-900 mb-2">Statistiques</h1>
              <p className="text-gray-600">Analyse des ventes — enregistrée à chaque paiement réussi</p>
            </div>
            <Link
              to="/admin"
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour au panel
            </Link>
          </div>

          {/* KPIs globaux (mois en cours, non filtrés) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <DollarSign className="w-8 h-8 text-gray-600" />
                {stats.revenueChange >= 0 ? <TrendingUp className="w-5 h-5 text-green-600" /> : <TrendingDown className="w-5 h-5 text-red-600" />}
              </div>
              <p className="text-3xl font-light text-gray-900 mb-1">{formatCurrency(stats.monthlyRevenue)}</p>
              <p className="text-sm text-gray-600">Chiffre d'affaires (mois en cours)</p>
              <p className={`text-xs mt-2 ${revenueChange.color}`}>{revenueChange.text} vs mois dernier</p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <ShoppingBag className="w-8 h-8 text-gray-600" />
                {stats.ordersChange >= 0 ? <TrendingUp className="w-5 h-5 text-green-600" /> : <TrendingDown className="w-5 h-5 text-red-600" />}
              </div>
              <p className="text-3xl font-light text-gray-900 mb-1">{stats.monthlyOrders}</p>
              <p className="text-sm text-gray-600">Commandes (mois en cours)</p>
              <p className={`text-xs mt-2 ${ordersChange.color}`}>{ordersChange.text} vs mois dernier</p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <BarChart3 className="w-8 h-8 text-gray-600" />
                {stats.averageOrderValueChange >= 0 ? <TrendingUp className="w-5 h-5 text-green-600" /> : <TrendingDown className="w-5 h-5 text-red-600" />}
              </div>
              <p className="text-3xl font-light text-gray-900 mb-1">{formatCurrency(stats.monthlyAverageOrderValue)}</p>
              <p className="text-sm text-gray-600">Panier moyen (mois en cours)</p>
              <p className={`text-xs mt-2 ${avgOrderChange.color}`}>{avgOrderChange.text} vs mois dernier</p>
            </div>
          </div>

          {/* Graphique + filtres */}
          <div className="bg-white rounded-2xl p-6 shadow-sm mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-light text-gray-900">Graphique des ventes</h2>
              {loading && <span className="text-xs text-gray-400 animate-pulse">Mise à jour…</span>}
            </div>

            <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Période</label>
                  <select
                    value={period}
                    onChange={e => setPeriod(e.target.value as Period)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm"
                  >
                    {(Object.keys(periodLabels) as Period[]).map(p => (
                      <option key={p} value={p}>{periodLabels[p]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Collection</label>
                  <select
                    value={filterCollection}
                    onChange={e => { setFilterCollection(e.target.value); setFilterCategory(''); }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm"
                  >
                    <option value="">Toutes</option>
                    {displayCollections.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
                  <select
                    value={filterCategory}
                    onChange={e => { setFilterCategory(e.target.value); setFilterCollection(''); }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm"
                  >
                    <option value="">Toutes</option>
                    {displayCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              {(filterCollection || filterCategory) && (
                <button
                  onClick={() => { setFilterCollection(''); setFilterCategory(''); }}
                  className="mt-3 text-xs text-gray-500 hover:text-gray-900 underline"
                >
                  Réinitialiser les filtres
                </button>
              )}
            </div>

            <div className="relative h-80">
              <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-1 h-full px-4">
                {stats.dailyStats.map((day, index) => {
                  const heightPercent = maxDailyRevenue > 0 ? (day.revenue / maxDailyRevenue) * 100 : 0;
                  return (
                    <div key={index} className="flex-1 flex flex-col items-center group">
                      <div className="relative w-full flex flex-col items-center">
                        <div
                          className="w-full bg-gray-900 rounded-t-lg transition-all duration-300 hover:bg-gray-700 group-hover:scale-105"
                          style={{ height: `${Math.max(heightPercent, 2)}%` }}
                        >
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                            {formatCurrency(day.revenue)} ({day.orders} cmd)
                          </div>
                        </div>
                      </div>
                      <span className="mt-2 text-xs text-gray-600 truncate w-full text-center">{day.date}</span>
                    </div>
                  );
                })}
              </div>
              <div className="absolute left-0 top-0 bottom-8 flex flex-col justify-between text-xs text-gray-500 px-2">
                <span>{formatCurrency(maxDailyRevenue)}</span>
                <span>{formatCurrency(maxDailyRevenue * 0.75)}</span>
                <span>{formatCurrency(maxDailyRevenue * 0.5)}</span>
                <span>{formatCurrency(maxDailyRevenue * 0.25)}</span>
                <span>0€</span>
              </div>
            </div>
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="text-xl font-light text-gray-900 mb-1">Ventes par collection</h3>
              <p className="text-xs text-gray-500 mb-6">CA sur la période sélectionnée</p>
              <div className="space-y-4">
                {Object.keys(stats.collectionStats).length === 0 ? (
                  <p className="text-sm text-gray-500">Aucune donnée pour cette période</p>
                ) : (() => {
                  const items = Object.entries(stats.collectionStats)
                    .map(([name, revenue]) => ({ name, revenue: revenue as number }))
                    .sort((a, b) => b.revenue - a.revenue);
                  const max = Math.max(...items.map(i => i.revenue), 1);
                  return items.map((item, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900">{item.name}</span>
                        <span className="text-sm text-gray-600">{formatCurrency(item.revenue)}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-gray-900 h-2 rounded-full transition-all duration-500" style={{ width: `${(item.revenue / max) * 100}%` }} />
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="text-xl font-light text-gray-900 mb-1">Ventes par catégorie</h3>
              <p className="text-xs text-gray-500 mb-6">CA sur la période sélectionnée</p>
              <div className="space-y-4">
                {Object.keys(stats.categoryStats).length === 0 ? (
                  <p className="text-sm text-gray-500">Aucune donnée pour cette période</p>
                ) : (() => {
                  const items = Object.entries(stats.categoryStats)
                    .map(([name, revenue]) => ({ name, revenue: revenue as number }))
                    .sort((a, b) => b.revenue - a.revenue);
                  const max = Math.max(...items.map(i => i.revenue), 1);
                  return items.map((item, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900">{item.name}</span>
                        <span className="text-sm text-gray-600">{formatCurrency(item.revenue)}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-gray-900 h-2 rounded-full transition-all duration-500" style={{ width: `${(item.revenue / max) * 100}%` }} />
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
