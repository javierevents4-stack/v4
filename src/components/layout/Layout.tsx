import { ReactNode, useEffect, useState } from 'react';
import Header from './Header';
import Footer from './Footer';
import { Camera } from 'lucide-react';
import ImageAdminOverlay from '../admin/ImageAdminOverlay';
import FloatingWhatsApp from './FloatingWhatsApp';

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      setMounted(true);
    }, 1000);

    // Add intersection observer for fade-in animations
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('appear');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    const fadeElements = document.querySelectorAll('.fade-in');
    fadeElements.forEach(element => {
      observer.observe(element);
    });

    return () => {
      fadeElements.forEach(element => {
        observer.unobserve(element);
      });
    };
  }, []);

  // Admin image overlay: enable when site_admin_mode is set
  useEffect(() => {
    const handler = (e: any) => {
      const val = e?.detail ?? (localStorage.getItem('site_admin_mode') ? true : false);
      if (val) {
        ImageAdminOverlay.initImageAdminOverlay();
      } else {
        ImageAdminOverlay.destroyImageAdminOverlay();
      }
    };
    window.addEventListener('siteAdminModeChanged', handler as EventListener);
    // run once based on current value
    if (typeof window !== 'undefined' && localStorage.getItem('site_admin_mode')) {
      ImageAdminOverlay.initImageAdminOverlay();
    }
    return () => {
      window.removeEventListener('siteAdminModeChanged', handler as EventListener);
      ImageAdminOverlay.destroyImageAdminOverlay();
    };
  }, []);

  if (!mounted) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center">
        <div className="text-center">
          <Camera size={48} className="text-primary animate-pulse mx-auto mb-4" />
          <div className="text-primary font-playfair text-2xl">Wild Pictures Studio</div>
          <div className="text-primary/80 text-sm uppercase tracking-widest mt-1">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen opacity-100 transition-opacity duration-500 bg-background text-primary">
      <Header />
      <main className="flex-grow">
        {children}
      </main>
      <Footer />

      {/* Floating WhatsApp button */}
      <a
        href={`https://wa.me/5541984875565?text=${encodeURIComponent('Hola, quiero reservar una sesión')}`}
        target="_blank"
        rel="noreferrer"
        aria-label="WhatsApp"
        className="fixed right-4 bottom-6 z-50 bg-green-600 hover:bg-green-700 text-white p-3 rounded-full shadow-lg flex items-center justify-center"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
          <path d="M20.52 3.48A11.88 11.88 0 0012.02.12 11.9 11.9 0 003.5 8.64c0 2.1.55 4.14 1.6 5.95L2 22l7.66-2.03a11.85 11.85 0 004.36.85h.01c6.58 0 11.98-5.34 11.98-11.92 0-3.2-1.25-6.2-3.2-8.37zM12.02 20.22c-1.3 0-2.57-.34-3.67-.99l-.26-.15-4.56 1.21 1.22-4.44-.17-.29a8.05 8.05 0 01-1.25-3.99 8.08 8.08 0 018.08-8.08c4.34 0 7.88 3.54 7.88 7.89 0 4.35-3.54 7.89-7.88 7.89z" />
          <path d="M17.56 14.8c-.32-.16-1.9-.94-2.2-1.05-.3-.11-.52-.16-.74.16-.22.32-.84 1.05-1.03 1.26-.19.21-.38.24-.7.08-.32-.16-1.36-.5-2.59-1.6-.96-.79-1.6-1.76-1.79-2.08-.19-.32-.02-.49.14-.65.14-.14.32-.38.47-.57.16-.19.21-.32.32-.53.11-.22.05-.41-.02-.57-.07-.16-.74-1.78-1.02-2.43-.27-.64-.55-.56-.75-.57l-.64-.01c-.22 0-.57.08-.87.41-.3.32-1.15 1.12-1.15 2.73 0 1.61 1.18 3.17 1.34 3.39.16.22 2.33 3.56 5.65 4.99 3.32 1.44 3.32 0.96 3.92 0.9.6-.06 1.9-.77 2.17-1.51.27-.74.27-1.37.19-1.5-.08-.14-.3-.22-.62-.38z" />
        </svg>
      </a>
    </div>
  );
};

export default Layout;
