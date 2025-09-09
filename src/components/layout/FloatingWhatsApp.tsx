import { useEffect, useRef, useState } from 'react';

const PHONE = '5541984875565';

const FloatingWhatsApp = () => {
  const [open, setOpen] = useState(true); // show expanded on load
  const [message, setMessage] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleScroll = () => {
      setOpen(false);
    };

    document.addEventListener('click', handleClick);
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      document.removeEventListener('click', handleClick);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const sendWhatsApp = () => {
    const text = message && message.trim() ? message.trim() : 'Hola, quiero reservar una sesión';
    const url = `https://wa.me/${PHONE}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    setMessage('');
    setOpen(false);
  };

  return (
    <div ref={ref} className="fixed right-4 bottom-6 z-50">
      {/* Expanded panel */}
      <div className={`transform transition-all duration-300 ${open ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0 pointer-events-none'} mb-3`}>
        <div className="w-80 max-w-[90vw] bg-primary text-white rounded-xl shadow-lg p-3">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                <path d="M20.52 3.48A11.88 11.88 0 0012.02.12 11.9 11.9 0 003.5 8.64c0 2.1.55 4.14 1.6 5.95L2 22l7.66-2.03a11.85 11.85 0 004.36.85h.01c6.58 0 11.98-5.34 11.98-11.92 0-3.2-1.25-6.2-3.2-8.37zM12.02 20.22c-1.3 0-2.57-.34-3.67-.99l-.26-.15-4.56 1.21 1.22-4.44-.17-.29a8.05 8.05 0 01-1.25-3.99 8.08 8.08 0 018.08-8.08c4.34 0 7.88 3.54 7.88 7.89 0 4.35-3.54 7.89-7.88 7.89z" />
                <path d="M17.56 14.8c-.32-.16-1.9-.94-2.2-1.05-.3-.11-.52-.16-.74.16-.22.32-.84 1.05-1.03 1.26-.19.21-.38.24-.7.08-.32-.16-1.36-.5-2.59-1.6-.96-.79-1.6-1.76-1.79-2.08-.19-.32-.02-.49.14-.65.14-.14.32-.38.47-.57.16-.19.21-.32.32-.53.11-.22.05-.41-.02-.57-.07-.16-.74-1.78-1.02-2.43-.27-.64-.55-.56-.75-.57l-.64-.01c-.22 0-.57.08-.87.41-.3.32-1.15 1.12-1.15 2.73 0 1.61 1.18 3.17 1.34 3.39.16.22 2.33 3.56 5.65 4.99 3.32 1.44 3.32 0.96 3.92 0.9.6-.06 1.9-.77 2.17-1.51.27-.74.27-1.37.19-1.5-.08-.14-.3-.22-.62-.38z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="font-medium">¿Deseas contactarnos?</div>
              <div className="text-sm opacity-80">Envíanos un WhatsApp y te ayudamos a reservar tu sesión.</div>

              <div className="mt-3 flex gap-2">
                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Escribe tu mensaje..."
                  className="flex-1 p-2 rounded-md text-primary focus:outline-none"
                />
                <button onClick={sendWhatsApp} className="bg-white text-primary px-3 rounded-md">Enviar</button>
              </div>

              <div className="mt-2 text-xs opacity-80">Al enviar, se abrirá WhatsApp con tu mensaje.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Collapsed icon/button */}
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center shadow-lg"
        aria-label="Abrir WhatsApp"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
          <path d="M20.52 3.48A11.88 11.88 0 0012.02.12 11.9 11.9 0 003.5 8.64c0 2.1.55 4.14 1.6 5.95L2 22l7.66-2.03a11.85 11.85 0 004.36.85h.01c6.58 0 11.98-5.34 11.98-11.92 0-3.2-1.25-6.2-3.2-8.37zM12.02 20.22c-1.3 0-2.57-.34-3.67-.99l-.26-.15-4.56 1.21 1.22-4.44-.17-.29a8.05 8.05 0 01-1.25-3.99 8.08 8.08 0 018.08-8.08c4.34 0 7.88 3.54 7.88 7.89 0 4.35-3.54 7.89-7.88 7.89z" />
        </svg>
      </button>
    </div>
  );
};

export default FloatingWhatsApp;
