import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  publicDir: 'Public',
  build: {
    assetsDir: 'assets',
    copyPublicDir: true,
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name].[ext]',
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          admin: [
            './src/pages/AdminPanelPage',
            './src/pages/OrdersAdminPage',
            './src/pages/CollectionsAdminPage',
            './src/pages/FAQAdminPage',
            './src/pages/StatsPage',
            './src/pages/AdminPromoCodesPage',
            './src/pages/LoginAdminPage',
          ],
          checkout: [
            './src/pages/CheckoutPage',
            './src/pages/PaymentPage',
            './src/pages/PaymentThankYouPage',
            './src/pages/CounterProposalPage',
          ],
        },
      },
    },
  },
});
