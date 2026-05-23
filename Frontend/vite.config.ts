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
    // Disable the inline modulepreload polyfill — all modern browsers support it natively
    // This removes the last inline <script> from the built HTML, enabling a strict CSP
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name].[ext]',
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
            return 'vendor';
          }
          if (id.includes('/pages/AdminPanelPage') || id.includes('/pages/OrdersAdminPage') || id.includes('/pages/CollectionsAdminPage') || id.includes('/pages/FAQAdminPage') || id.includes('/pages/StatsPage') || id.includes('/pages/AdminPromoCodesPage') || id.includes('/pages/LoginAdminPage')) {
            return 'admin';
          }
          if (id.includes('/pages/CheckoutPage') || id.includes('/pages/PaymentPage') || id.includes('/pages/PaymentThankYouPage') || id.includes('/pages/CounterProposalPage')) {
            return 'checkout';
          }
        },
      },
    },
  },
});
