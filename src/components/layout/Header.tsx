import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Eye, EyeOff } from 'lucide-react';
import { signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from '../../utils/firebaseClient';
import { useTranslation } from 'react-i18next';
import Logo from '../ui/Logo';
import CartIcon from '../cart/CartIcon';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';

const Header = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(Boolean(typeof window !== 'undefined' && localStorage.getItem('site_admin_mode')));
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminModalError, setAdminModalError] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    const handler = (e: Event | any) => {
      const val = e?.detail ?? (localStorage.getItem('site_admin_mode') ? true : false);
      setIsAdmin(Boolean(val));
    };
    window.addEventListener('siteAdminModeChanged', handler as EventListener);
    window.addEventListener('storage', handler as EventListener);
    return () => {
      window.removeEventListener('siteAdminModeChanged', handler as EventListener);
      window.removeEventListener('storage', handler as EventListener);
    };
  }, []);

  const notifyAdminChange = async (val: boolean) => {
    try {
      if (val) localStorage.setItem('site_admin_mode', '1'); else localStorage.removeItem('site_admin_mode');
    } catch (_) {}
    if (!val) {
      try {
        await firebaseSignOut(auth);
      } catch (e) {
        console.error('Error signing out', e);
      }
    }
    window.dispatchEvent(new CustomEvent('siteAdminModeChanged', { detail: val }));
    setIsAdmin(val);
  };

  const toggleAdminFromHeader = () => {
    if (!isAdmin) {
      setAdminEmail('');
      setAdminPassword('');
      setAdminModalError('');
      setShowAdminModal(true);
    } else {
      notifyAdminChange(false);
    }
  };

  const submitAdminModal = async () => {
    if (!adminEmail || !adminPassword) { setAdminModalError('Insira email e senha'); return; }

    // quick offline check
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setAdminModalError('Sem conexão de rede. Verifique sua internet e tente novamente.');
      return;
    }

    try {
      // Sign in with email/password
      await signInWithEmailAndPassword(auth, adminEmail.trim(), adminPassword);
    } catch (e: any) {
      console.error('Email/password sign-in failed', e);
      const code = e?.code || '';
      const msg = e?.message || String(e) || 'Erro ao autenticar';
      if (code === 'auth/network-request-failed' || msg.toLowerCase().includes('network')) {
        setAdminModalError('Falha de rede ao tentar autenticar. Tente novamente mais tarde.');
      } else if (code === 'auth/user-not-found' || code === 'auth/wrong-password') {
        setAdminModalError('Email ou senha incorretos.');
      } else if (code === 'auth/invalid-email') {
        setAdminModalError('Email inválido.');
      } else if (code === 'auth/too-many-requests') {
        setAdminModalError('Muitas tentativas falharam. Tente novamente mais tarde.');
      } else {
        setAdminModalError(`Falha ao autenticar: ${msg}`);
      }
      return;
    }

    // success
    notifyAdminChange(true);
    setShowAdminModal(false);
    setAdminEmail('');
    setAdminPassword('');
    setAdminModalError('');
    navigate('/admin-store');
  };

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 50) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [mobileMenuOpen]);

  const handleBooking = () => {
    // Navigate to booking page (same behavior as Hero)
    navigate('/booking');
  };

  const { flags } = useFeatureFlags();
  const navLinks = useMemo(() => {
    const scrollToServices = () => {
      const el = document.getElementById('nossos-servicos');
      if (!el) return;
      const header = document.querySelector('header');
      const headerHeight = header ? (header as HTMLElement).offsetHeight : 0;
      const rect = el.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const extraDown = 80; // push the section a bit lower in the viewport
      const target = rect.top + scrollTop - headerHeight + extraDown;
      window.scrollTo({ top: target, behavior: 'smooth' });
    };

    const links: { name: string; path?: string; action?: () => void; key?: string }[] = [
      { name: t('nav.home'), path: '/', key: 'home' },
      { name: 'Serviços', action: scrollToServices },
      { name: t('nav.portfolio'), path: '/portfolio', key: 'portfolio' },
      { name: t('nav.store'), path: '/store', key: 'store' },
      { name: t('nav.book'), action: handleBooking, key: 'booking' },
      { name: t('nav.contact'), path: '/contact', key: 'contact' },
    ];
    // do not include a separate Admin link here; admin is toggled via the eye icon
    return links.filter(l => !l.key || flags.pages[l.key as keyof typeof flags.pages]);
  }, [t, flags]);

  const isHomePage = location.pathname === '/';

  return (
    <header 
      className={`fixed w-full z-50 transition-all duration-500 ${
        isScrolled || !isHomePage
          ? 'bg-primary py-3'
          : 'bg-transparent py-5'
      }`}
    >
      <div className="container-custom flex justify-between items-center">

        {/* Desktop: split navigation into left / center logo / right */}
        <div className="container-custom px-0 flex justify-between items-center md:grid md:grid-cols-3">
          <div className="hidden md:flex items-center">
            <ul className="flex items-center space-x-8">
              <li>
                <button onClick={toggleAdminFromHeader} aria-label={isAdmin ? 'Sair do modo admin' : 'Modo administrador'} className="p-2 text-white hover:text-secondary transition-colors">
                  {isAdmin ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </li>
              {navLinks.slice(0, Math.ceil(navLinks.length / 2)).map((link) => (
                <li key={link.name}>
                  {link.path ? (
                    <Link
                      to={link.path}
                      className={`font-lato text-sm tracking-wide uppercase ${isScrolled || !isHomePage ? 'text-white' : 'text-primary'} hover:text-secondary transition-colors`}
                    >
                      {link.name}
                    </Link>
                  ) : (
                    <button
                      onClick={link.action}
                      className={`font-lato text-sm tracking-wide uppercase ${isScrolled || !isHomePage ? 'text-white' : 'text-primary'} hover:text-secondary transition-colors`}
                    >
                      {link.name}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex justify-center z-50">
            <Link to="/" className="z-50">
              <Logo dark={!(isScrolled || !isHomePage)} />
            </Link>
          </div>

          <div className="hidden md:flex items-center justify-end space-x-6">
            <ul className="flex space-x-8">
              {navLinks.slice(Math.ceil(navLinks.length / 2)).map((link) => (
                <li key={link.name}>
                  {link.path ? (
                    <Link
                      to={link.path}
                      className={`font-lato text-sm tracking-wide uppercase ${isScrolled || !isHomePage ? 'text-white' : 'text-primary'} hover:text-secondary transition-colors`}
                    >
                      {link.name}
                    </Link>
                  ) : (
                    <button
                      onClick={link.action}
                      className={`font-lato text-sm tracking-wide uppercase ${isScrolled || !isHomePage ? 'text-white' : 'text-primary'} hover:text-secondary transition-colors`}
                    >
                      {link.name}
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <div className="flex items-center space-x-6 text-white">
              <CartIcon />
            </div>
          </div>

          <div className="md:hidden flex items-center space-x-4">
            <CartIcon />
            <button
              className="z-50"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X size={24} className={`${isScrolled || !isHomePage ? 'text-white' : 'text-primary'}`} />
              ) : (
                <Menu size={24} className={`${isScrolled || !isHomePage ? 'text-white' : 'text-primary'}`} />
              )}
            </button>
          </div>
        </div>

        <div className={`fixed top-0 bottom-0 right-4 bg-white z-40 md:hidden transform transition-transform duration-300 ease-in-out ${
          mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`} style={{ width: 'calc(100% - 64px)', borderRadius: 12 }}>
          <div className="flex flex-col h-full pt-24 px-6">
            <ul className="flex flex-col space-y-6 text-center">
              {navLinks.map((link) => (
                <li key={link.name}>
                  {link.key === 'admin' ? (
                    <button
                      onClick={toggleAdminFromHeader}
                      className="text-primary font-lato text-lg uppercase tracking-wide hover:text-secondary transition-colors"
                    >
                      {link.name}
                    </button>
                  ) : link.path ? (
                    <Link
                      to={link.path}
                      className="text-primary font-lato text-lg uppercase tracking-wide hover:text-secondary transition-colors"
                    >
                      {link.name}
                    </Link>
                  ) : (
                    <button
                      onClick={link.action}
                      className="text-primary font-lato text-lg uppercase tracking-wide hover:text-secondary transition-colors"
                    >
                      {link.name}
                    </button>
                  )}
                </li>
              ))}

            </ul>
          </div>
        </div>
      </div>

      {showAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl">
            <h3 className="text-xl font-semibold mb-2">Acesso ao painel da loja</h3>
            <p className="text-sm text-gray-600 mb-4">Insira a senha de administrador para acessar o painel.</p>
            <input
              type="email"
              autoFocus
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              className="w-full border border-gray-200 rounded px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-secondary"
              placeholder="Email"
              autoComplete="off"
            />
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              className="w-full border border-gray-200 rounded px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-secondary"
              placeholder="Senha"
              autoComplete="new-password"
            />
            {adminModalError && <div className="text-red-500 text-sm mb-3">{adminModalError}</div>}
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowAdminModal(false); setAdminEmail(''); setAdminPassword(''); setAdminModalError(''); }} className="px-4 py-2 border rounded">Cancelar</button>
              <button onClick={submitAdminModal} className="px-4 py-2 bg-primary text-white rounded">Acessar</button>
            </div>
          </div>
        </div>
      )}

    </header>
  );
};

export default Header;
