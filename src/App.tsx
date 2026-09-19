import { useState } from 'react';
import { RouteProvider, useRoute } from '@/context/RouteContext';
import { LanguageProvider } from '@/context/LanguageContext';
import { WishlistProvider } from '@/context/WishlistContext';
import { CatalogProvider } from '@/context/CatalogContext';
import { AdminAuthProvider } from '@/context/AdminAuthContext';
import { ToastProvider } from '@/admin/ui';
import { AdminApp } from '@/admin/AdminApp';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { SearchOverlay } from '@/components/SearchOverlay';
import { HomePage } from '@/pages/HomePage';
import { CollectionsPage } from '@/pages/CollectionsPage';
import { ProductDetailPage } from '@/pages/ProductDetailPage';
import { VisualizerPage } from '@/pages/VisualizerPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { AboutPage } from '@/pages/AboutPage';
import { ContactPage } from '@/pages/ContactPage';
import { WishlistPage } from '@/pages/WishlistPage';

function AppContent() {
  const { path } = useRoute();
  const [searchOpen, setSearchOpen] = useState(false);

  const basePath = path.split('?')[0];

  let page;
  if (basePath === '/admin' || basePath.startsWith('/admin/')) {
    return <AdminApp />;
  }
  if (basePath === '/' || basePath === '') {
    page = <HomePage />;
  } else if (basePath.startsWith('/collections')) {
    page = <CollectionsPage />;
  } else if (basePath.startsWith('/material/')) {
    const slug = basePath.replace('/material/', '');
    page = <ProductDetailPage slug={slug} />;
  } else if (basePath.startsWith('/visualizer')) {
    page = <VisualizerPage />;
  } else if (basePath.startsWith('/projects')) {
    page = <ProjectsPage />;
  } else if (basePath.startsWith('/project/')) {
    page = <ProjectsPage />;
  } else if (basePath.startsWith('/about')) {
    page = <AboutPage />;
  } else if (basePath.startsWith('/contact')) {
    page = <ContactPage />;
  } else if (basePath.startsWith('/wishlist')) {
    page = <WishlistPage />;
  } else {
    page = <HomePage />;
  }

  const isVisualizer = basePath.startsWith('/visualizer');

  return (
    <div className="min-h-screen bg-ivory">
      <Header onSearchOpen={() => setSearchOpen(true)} />
      <main>{page}</main>
      {!isVisualizer && <Footer />}
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function App() {
  return (
    <LanguageProvider>
      <WishlistProvider>
        <RouteProvider>
          <CatalogProvider>
            <ToastProvider>
              <AdminAuthProvider>
                <AppContent />
              </AdminAuthProvider>
            </ToastProvider>
          </CatalogProvider>
        </RouteProvider>
      </WishlistProvider>
    </LanguageProvider>
  );
}

export default App;
