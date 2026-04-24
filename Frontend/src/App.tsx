import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { trackEvent } from './utils/analytics';
import Header from './components/Header';
import CartToast from './components/CartToast';
import Footer from './components/Footer';
// Pages critiques (chargées immédiatement)
import HomePage from './pages/HomePage';
import BoutiquePage from './pages/BoutiquePage';
// Pages chargées à la demande
const ContactPage = lazy(() => import('./pages/ContactPage'));
const FAQPage = lazy(() => import('./pages/FAQPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const LoginAdminPage = lazy(() => import('./pages/LoginAdminPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const FavoritesPage = lazy(() => import('./pages/FavoritesPage'));
const CartPage = lazy(() => import('./pages/CartPage'));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage'));
const PaymentPage = lazy(() => import('./pages/PaymentPage'));
const PaymentThankYouPage = lazy(() => import('./pages/PaymentThankYouPage'));
const CounterProposalPage = lazy(() => import('./pages/CounterProposalPage'));
const GalleryPage = lazy(() => import('./pages/GalleryPage'));
const CGVPage = lazy(() => import('./pages/CGVPage'));
const MentionsLegalesPage = lazy(() => import('./pages/MentionsLegalesPage'));
const PolitiqueConfidentialitePage = lazy(() => import('./pages/PolitiqueConfidentialitePage'));
// Pages admin (chunk séparé)
const AdminPanelPage = lazy(() => import('./pages/AdminPanelPage'));
const OrdersAdminPage = lazy(() => import('./pages/OrdersAdminPage'));
const CollectionsAdminPage = lazy(() => import('./pages/CollectionsAdminPage'));
const FAQAdminPage = lazy(() => import('./pages/FAQAdminPage'));
const StatsPage = lazy(() => import('./pages/StatsPage'));
const AdminPromoCodesPage = lazy(() => import('./pages/AdminPromoCodesPage'));
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function PageViewTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    const page = pathname === '/' ? 'accueil' : pathname.replace(/^\//, '').replace(/\//g, '_');
    trackEvent('page_view', { page, path: pathname });
  }, [pathname]);
  return null;
}

function App() {
  return (
    <div className="min-h-screen bg-white">
      <ScrollToTop />
      <PageViewTracker />
      <Header />
      <CartToast />
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Chargement...</p></div>}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/boutique" element={<BoutiquePage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/faq" element={<FAQPage />} />
        <Route path="/connexion" element={<LoginPage />} />
        <Route path="/admin/login" element={<LoginAdminPage />} />
        <Route path="/inscription" element={<RegisterPage />} />
        <Route path="/profil" element={<ProfilePage />} />
        <Route path="/favoris" element={<FavoritesPage />} />
        <Route path="/panier" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/commande/:orderId/paiement" element={<PaymentPage />} />
        <Route path="/commande/:orderId/merci" element={<PaymentThankYouPage />} />
        <Route path="/commande/:orderId/:action" element={<CounterProposalPage />} />
        <Route path="/admin" element={<AdminPanelPage />} />
        <Route path="/admin/commandes" element={<OrdersAdminPage />} />
        <Route path="/admin/collections" element={<CollectionsAdminPage />} />
        <Route path="/admin/faq" element={<FAQAdminPage />} />
        <Route path="/admin/promo-codes" element={<AdminPromoCodesPage />} />
        <Route path="/galerie" element={<GalleryPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/cgv" element={<CGVPage />} />
        <Route path="/mentions-legales" element={<MentionsLegalesPage />} />
        <Route path="/politique-confidentialite" element={<PolitiqueConfidentialitePage />} />
      </Routes>
      </Suspense>
      <Footer />
    </div>
  );
}
export default App;
