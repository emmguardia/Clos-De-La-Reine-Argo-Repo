import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { trackEvent } from './utils/analytics';
import Header from './components/Header';
import CartToast from './components/CartToast';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import BoutiquePage from './pages/BoutiquePage';
import ContactPage from './pages/ContactPage';
import FAQPage from './pages/FAQPage';
import LoginPage from './pages/LoginPage';
import LoginAdminPage from './pages/LoginAdminPage';
import RegisterPage from './pages/RegisterPage';
import ProfilePage from './pages/ProfilePage';
import FavoritesPage from './pages/FavoritesPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import PaymentPage from './pages/PaymentPage';
import PaymentThankYouPage from './pages/PaymentThankYouPage';
import CounterProposalPage from './pages/CounterProposalPage';
import AdminPanelPage from './pages/AdminPanelPage';
import OrdersAdminPage from './pages/OrdersAdminPage';
import GalleryPage from './pages/GalleryPage';
import CollectionsAdminPage from './pages/CollectionsAdminPage';
import FAQAdminPage from './pages/FAQAdminPage';
import StatsPage from './pages/StatsPage';
import AdminPromoCodesPage from './pages/AdminPromoCodesPage';
import CGVPage from './pages/CGVPage';
import MentionsLegalesPage from './pages/MentionsLegalesPage';
import PolitiqueConfidentialitePage from './pages/PolitiqueConfidentialitePage';
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
      <Footer />
    </div>
  );
}
export default App;
