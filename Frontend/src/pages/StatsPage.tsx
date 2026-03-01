import { useState, useEffect } from 'react';
import { BarChart3, Calendar, Filter, TrendingUp, TrendingDown, DollarSign, ShoppingBag, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { safeJsonResponse } from '../utils/security';

const API_URL = (import.meta.env?.VITE_API_URL as string) || '';

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

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const adminToken = localStorage.getItem('adminToken');
    if (!adminToken) {
      window.location.href = '/admin/login';
      return;
    }
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const adminToken = localStorage.getItem('adminToken');
      if (!adminToken) {
        window.location.href = '/admin/login';
        return;
      }

      const response = await fetch(`${API_URL}/api/stats`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });

      if (response.ok) {
        const data = await safeJsonResponse(response, null);
        if (data) {
          setStats(data);
        }
      }
    } catch (error) {
      console.error('Erreur lors de la récupération des stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatChange = (change: number) => {
    const sign = change >= 0 ? '+' : '';
    const color = change >= 0 ? 'text-green-600' : 'text-red-600';
    return { text: `${sign}${change.toFixed(1)}%`, color };
  };

  if (loading) {
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

  const maxDailyRevenue = stats.dailyStats && stats.dailyStats.length > 0 
    ? Math.max(...stats.dailyStats.map(d => d.revenue || 0), 1) 
    : 1;

  return (
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <DollarSign className="w-8 h-8 text-gray-600" />
              {stats.revenueChange >= 0 ? (
                <TrendingUp className="w-5 h-5 text-green-600" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-600" />
              )}
            </div>
            <p className="text-3xl font-light text-gray-900 mb-1">{formatCurrency(stats.monthlyRevenue)}</p>
            <p className="text-sm text-gray-600">Chiffre d'affaires (mois en cours)</p>
            <p className={`text-xs mt-2 ${revenueChange.color}`} title="Évolution du CA du mois en cours par rapport au mois précédent">
              {revenueChange.text} vs mois dernier
            </p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <ShoppingBag className="w-8 h-8 text-gray-600" />
              {stats.ordersChange >= 0 ? (
                <TrendingUp className="w-5 h-5 text-green-600" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-600" />
              )}
            </div>
            <p className="text-3xl font-light text-gray-900 mb-1">{stats.monthlyOrders}</p>
            <p className="text-sm text-gray-600">Commandes (mois en cours)</p>
            <p className={`text-xs mt-2 ${ordersChange.color}`} title="Évolution du nombre de commandes du mois en cours par rapport au mois précédent">
              {ordersChange.text} vs mois dernier
            </p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <BarChart3 className="w-8 h-8 text-gray-600" />
              {stats.averageOrderValueChange >= 0 ? (
                <TrendingUp className="w-5 h-5 text-green-600" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-600" />
              )}
            </div>
            <p className="text-3xl font-light text-gray-900 mb-1">{formatCurrency(stats.monthlyAverageOrderValue)}</p>
            <p className="text-sm text-gray-600">Panier moyen (mois en cours)</p>
            <p className={`text-xs mt-2 ${avgOrderChange.color}`} title="Évolution du panier moyen du mois en cours par rapport au mois précédent">
              {avgOrderChange.text} vs mois dernier
            </p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-light text-gray-900">Graphique des ventes</h2>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                <Filter className="w-4 h-4" />
                Filtres
              </button>
            </div>
          </div>
          <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Période</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm">
                  <option>7 derniers jours</option>
                  <option>30 derniers jours</option>
                  <option>3 derniers mois</option>
                  <option>6 derniers mois</option>
                  <option>Année en cours</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Collection</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm">
                  <option>Toutes</option>
                  <option>Back to School</option>
                  <option>Tea Time</option>
                  <option>Pain d'Épices</option>
                  <option>Deauville</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm">
                  <option>Toutes</option>
                  <option>Colliers</option>
                  <option>Laisses</option>
                  <option>Harnais</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date personnalisée</label>
                <button className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm">
                  <Calendar className="w-4 h-4" />
                  Sélectionner
                </button>
              </div>
            </div>
          </div>
          <div className="relative h-80">
            <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-2 h-full px-4">
              {stats.dailyStats.map((day, index) => {
                const heightPercent = maxDailyRevenue > 0 ? (day.revenue / maxDailyRevenue) * 100 : 0;
                return (
                  <div key={index} className="flex-1 flex flex-col items-center group">
                    <div className="relative w-full flex flex-col items-center">
                      <div
                        className="w-full bg-gray-900 rounded-t-lg transition-all duration-300 hover:bg-gray-700 group-hover:scale-105"
                        style={{ height: `${Math.max(heightPercent, 5)}%` }}
                      >
                        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                          {formatCurrency(day.revenue)}
                        </div>
                      </div>
                    </div>
                    <span className="mt-2 text-xs text-gray-600">{day.date}</span>
                  </div>
                );
              })}
            </div>
            <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-xs text-gray-500 px-2">
              <span>{formatCurrency(maxDailyRevenue)}</span>
              <span>{formatCurrency(maxDailyRevenue * 0.75)}</span>
              <span>{formatCurrency(maxDailyRevenue * 0.5)}</span>
              <span>{formatCurrency(maxDailyRevenue * 0.25)}</span>
              <span>0€</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="text-xl font-light text-gray-900 mb-6">Ventes par collection</h3>
            <p className="text-xs text-gray-500 mb-4">CA par collection (produits des commandes payées)</p>
            <div className="space-y-4">
              {Object.keys(stats.collectionStats).length === 0 ? (
                <p className="text-sm text-gray-500">Aucune donnée disponible</p>
              ) : (() => {
                const collections = Object.entries(stats.collectionStats)
                  .map(([name, revenue]) => ({ name, revenue: revenue as number }))
                  .sort((a, b) => b.revenue - a.revenue);
                const maxCollectionRevenue = Math.max(...collections.map(c => c.revenue), 1);
                return collections.map((collection, index) => {
                  const percentage = (collection.revenue / maxCollectionRevenue) * 100;
                  return (
                    <div key={index}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-900">{collection.name}</span>
                        <span className="text-sm text-gray-600">{formatCurrency(collection.revenue)}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-gray-900 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="text-xl font-light text-gray-900 mb-6">Ventes par catégorie</h3>
            <p className="text-xs text-gray-500 mb-4">CA par catégorie (colliers, laisses, harnais)</p>
            <div className="space-y-4">
              {Object.keys(stats.categoryStats).length === 0 ? (
                <p className="text-sm text-gray-500">Aucune donnée disponible</p>
              ) : (() => {
                const categories = Object.entries(stats.categoryStats)
                  .map(([name, revenue]) => ({ name, revenue: revenue as number }))
                  .sort((a, b) => b.revenue - a.revenue);
                const maxCategoryRevenue = Math.max(...categories.map(c => c.revenue), 1);
                return categories.map((category, index) => {
                  const percentage = (category.revenue / maxCategoryRevenue) * 100;
                  return (
                    <div key={index}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-900">{category.name}</span>
                        <span className="text-sm text-gray-600">{formatCurrency(category.revenue)}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-gray-900 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
