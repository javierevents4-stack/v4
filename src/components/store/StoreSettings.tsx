import React, { useEffect, useMemo, useState } from 'react';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';

const LS_MP_TOKEN_KEY = 'mp_access_token';

const StoreSettings: React.FC = () => {
  const { flags, setPageEnabled, setPaymentEnabled } = useFeatureFlags();
  const [mpEnabledLocal, setMpEnabledLocal] = useState<boolean>(Boolean(flags.payments?.mpEnabled ?? true));
  const [accessToken, setAccessToken] = useState<string>('');
  const [saved, setSaved] = useState<'none' | 'ok'>('none');

  useEffect(() => {
    const savedToken = typeof window !== 'undefined' ? localStorage.getItem(LS_MP_TOKEN_KEY) : '';
    setAccessToken(savedToken || '');
  }, []);

  useEffect(() => {
    setMpEnabledLocal(Boolean(flags.payments?.mpEnabled ?? true));
  }, [flags.payments?.mpEnabled]);

  const pageEntries = useMemo(() => Object.entries(flags.pages), [flags.pages]);

  const handleSaveToken = () => {
    try {
      localStorage.setItem(LS_MP_TOKEN_KEY, accessToken.trim());
      setSaved('ok');
      setTimeout(() => setSaved('none'), 1500);
    } catch (_) {}
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="section-title">Ajustes da Loja</h2>
        <p className="text-gray-600">Configure a visibilidade de páginas e opções de pagamento.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-medium mb-3">Visibilidade de Páginas</h3>
          <p className="text-sm text-gray-600 mb-3">Habilite ou desabilite páginas para ocultá-las do site.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {pageEntries.map(([key, value]) => (
              <label key={key} className="flex items-center gap-3 border rounded-lg p-2">
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(e) => setPageEnabled(key as any, e.target.checked)}
                />
                <span className="capitalize text-sm">{key.replace(/([A-Z])/g, ' $1').replace(/\s+/g, ' ').trim()}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-medium mb-3">Pagamentos</h3>
          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={mpEnabledLocal}
                onChange={async (e) => {
                  setMpEnabledLocal(e.target.checked);
                  await setPaymentEnabled(e.target.checked);
                }}
              />
              <span className="text-sm">Ativar pagamento com Mercado Pago</span>
            </label>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Access Token (MP_ACCESS_TOKEN)</label>
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2"
                placeholder="APP_USR-..."
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleSaveToken}
                  className="px-4 py-2 rounded-none border-2 border-black text-black hover:bg-black hover:text-white"
                >Salvar</button>
                {saved === 'ok' && <span className="text-green-600 text-sm self-center">Salvo</span>}
              </div>
              <p className="text-xs text-gray-500 mt-2">Este token é salvo apenas no seu navegador para uso administrativo. Em produção, configure as variáveis no provedor (Netlify).</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StoreSettings;
