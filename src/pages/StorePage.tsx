import { useEffect, useState } from 'react';
import { Product } from '../types/store';
import { db } from '../utils/firebaseClient';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, query } from 'firebase/firestore';
import { Plus, Trash2 } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import ProductEditorModal from '../components/store/ProductEditorModal';
import AdminStoreDashboard from '../components/store/AdminStoreDashboard';
import OrdersManagement from '../components/store/OrdersManagement';
import PhotoPackagesManagement from '../components/store/PhotoPackagesManagement';
import ContractsManagement from '../components/store/ContractsManagement';

interface StoreProduct extends Product {
  custom_text?: string;
}

const StorePage = () => {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('todos');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminView, setAdminView] = useState<'dashboard' | 'products' | 'orders' | 'contracts' | 'packages'>('dashboard');
  const [adminFullscreen, setAdminFullscreen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<StoreProduct | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const { addToCart: addToMainCart } = useCart();

  useEffect(() => {
    fetchProducts();
  }, []);


  useEffect(() => {
    const handler = (e: Event | any) => {
      const val = e?.detail ?? (localStorage.getItem('site_admin_mode') ? true : false);
      setIsAdmin(Boolean(val));
    };
    window.addEventListener('siteAdminModeChanged', handler as EventListener);
    window.addEventListener('storage', handler as EventListener);

    const seedIfEmpty = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (products.length === 0 && !localStorage.getItem('seeded_products')) {
        try {
          const defaults: Partial<StoreProduct>[] = [
            { name: 'Álbum Premium 30x30', description: 'Álbum fotográfico de alta calidad con 30 páginas.', price: 340, category: 'album', image_url: 'https://images.pexels.com/photos/18378220/pexels-photo-18378220.jpeg?auto=compress&cs=tinysrgb&w=1600', custom_text: 'NUEVO' },
            { name: 'Impresión Fine Art A3', description: 'Papel algodón libre de ácido para máxima durabilidad.', price: 80, category: 'impresion', image_url: 'https://images.pexels.com/photos/6795104/pexels-photo-6795104.jpeg?auto=compress&cs=tinysrgb&w=1600' },
            { name: 'Marco de Madera 30x45', description: 'Marco artesanal con vidrio antirreflejo.', price: 120, category: 'decoracion', image_url: 'https://images.pexels.com/photos/2692555/pexels-photo-2692555.jpeg?auto=compress&cs=tinysrgb&w=1600' },
            { name: 'USB Personalizado 32GB', description: 'Entrega de fotos en USB grabado.', price: 68, category: 'acessorios', image_url: 'https://images.pexels.com/photos/30332/pexels-photo.jpg?auto=compress&cs=tinysrgb&w=1600' },
            { name: 'Poster 50x70', description: 'Poster fotográfico premium listo para colgar.', price: 90, category: 'impresion', image_url: 'https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&w=1600' }
          ];
          // add to Firestore
          const { addDoc, collection } = await import('firebase/firestore');
          const { db } = await import('../utils/firebaseClient');
          await Promise.all(defaults.map(item => addDoc(collection(db, 'products'), {
            ...item,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })));
          localStorage.setItem('seeded_products', '1');
          fetchProducts();
        } catch (e) {
          console.warn('Seed products failed', e);
        }
      }
    };
    seedIfEmpty();
    // cleanup
    return () => {
      window.removeEventListener('siteAdminModeChanged', handler as EventListener);
      window.removeEventListener('storage', handler as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.length]);

  const toggleAdminMode = () => {
    if (!isAdmin) {
      const adminPassword = prompt('Senha de administrador:');
      if (adminPassword === '1234') {
        setIsAdmin(true);
        setAdminView('dashboard');
        try { localStorage.setItem('site_admin_mode', '1'); } catch (_) {}
        window.dispatchEvent(new CustomEvent('siteAdminModeChanged', { detail: true }));
      } else if (adminPassword !== null) {
        alert('Senha incorreta');
      }
    } else {
      setIsAdmin(false);
      setEditingProduct(null);
      setEditorOpen(false);
      setAdminView('dashboard');
      try { localStorage.removeItem('site_admin_mode'); } catch (_) {}
      window.dispatchEvent(new CustomEvent('siteAdminModeChanged', { detail: false }));
    }
  };

  const fetchProducts = async () => {
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) { setProducts([]); return; }
      const col = collection(db, 'products');
      let q: any = col;
      try { q = query(col, orderBy('created_at', 'desc')); } catch (_) { q = col; }
      const snap = await getDocs(q);
      const raw = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as StoreProduct[];
      const seen = new Set<string>();
      const unique: StoreProduct[] = [];
      for (const p of raw) {
        const key = `${String(p.name||'').trim().toLowerCase()}|${Number(p.price)||0}|${String(p.category||'').trim().toLowerCase()}`;
        if (!seen.has(key)) { seen.add(key); unique.push(p); }
      }
      setProducts(unique);
    } catch (error) {
      console.warn('Não foi possível carregar produtos no momento.');
      setProducts([]);
    }
  };

  const categories = ['todos', ...new Set(products.map(p => p.category))];

  const categoryTranslations: { [key: string]: string } = {
    'todos': 'Todos',
    'equipamento': 'Equipamentos',
    'album': 'Álbuns',
    'acessorios': 'Acessórios',
    'decoracao': 'Decoração'
  };

  const filteredProducts = selectedCategory === 'todos'
    ? products.filter(p => (p as any).active !== false)
    : products.filter(p => (p as any).active !== false && p.category === selectedCategory);

  const addStoreItemToGlobalCart = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    addToMainCart({
      id: product.id,
      type: 'store',
      name: product.name,
      price: `R$ ${product.price.toFixed(2).replace('.', ',')}`,
      duration: '',
      image: product.image_url
    });
  };




  const handleSaveProduct = async () => {
    try {
      if (editingProduct) {
        // Update existing product
        await updateDoc(doc(db, 'products', editingProduct.id), {
          name: editingProduct.name,
          description: editingProduct.description,
          price: editingProduct.price,
          category: editingProduct.category,
          image_url: editingProduct.image_url,
          custom_text: editingProduct.custom_text,
          updated_at: new Date().toISOString()
        });
        setEditingProduct(null);
      } else {
        // Create new product
        await addDoc(collection(db, 'products'), {
          name: newProduct.name,
          description: newProduct.description,
          price: newProduct.price,
          category: newProduct.category,
          image_url: newProduct.image_url,
          custom_text: newProduct.custom_text,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        setNewProduct({
          name: '',
          description: '',
          price: 0,
          category: 'equipamento',
          image_url: '',
          custom_text: ''
        });
        setShowAddForm(false);
      }
      
      fetchProducts();
    } catch (error) {
      console.error('Erro ao salvar produto:', error);
      alert('Erro ao salvar o produto');
    }
  };

  const handleDeactivate = async (productId: string, activate: boolean) => {
    try {
      await updateDoc(doc(db, 'products', productId), { active: activate, updated_at: new Date().toISOString() });
      await fetchProducts();
    } catch (e) {
      console.error('Erro ao atualizar status do produto:', e);
      alert('No se pudo actualizar el estado');
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (confirm('Tem certeza de que deseja excluir este produto?')) {
      try {
        await deleteDoc(doc(db, 'products', productId));
        fetchProducts();
      } catch (error) {
        console.error('Erro ao excluir produto:', error);
        alert('Erro ao excluir o produto');
      }
    }
  };

  return (
    <section className="pt-32 pb-16">
      <div className="container-custom">
        <div className="flex justify-between items-center mb-8">
          <h1 className="section-title">Tienda</h1>
          <div className="flex items-center gap-4" />
        </div>

        {/* Admin dashboard + products */}
        {isAdmin && (
          <div className="mb-8 space-y-6">
            <div className="flex items-center gap-2">
              <button onClick={() => setAdminView('dashboard')} className={`px-4 py-2 rounded-none border-2 ${adminView==='dashboard' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Panel</button>
              <button onClick={() => setAdminView('products')} className={`px-4 py-2 rounded-none border-2 ${adminView==='products' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Productos</button>
              <button onClick={() => setAdminView('orders')} className={`px-4 py-2 rounded-none border-2 ${adminView==='orders' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Órdenes</button>
              <button onClick={() => setAdminView('contracts')} className={`px-4 py-2 rounded-none border-2 ${adminView==='contracts' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Contratos</button>
              <button onClick={() => setAdminView('packages')} className={`px-4 py-2 rounded-none border-2 ${adminView==='packages' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Paquetes</button>
              <div className="ml-auto">
                <button onClick={() => setAdminFullscreen(v => !v)} className="px-4 py-2 rounded-none border-2 border-black text-black hover:bg-black hover:text-white">{adminFullscreen ? 'Restaurar' : 'Maximizar'}</button>
              </div>
            </div>

            {adminView === 'dashboard' && (
              <AdminStoreDashboard onNavigate={(v) => setAdminView(v)} />
            )}

            {adminView === 'products' && (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="section-title">Gestión de Productos</h2>
                  <div className="flex items-center gap-2">
                    <button onClick={async () => {
                      if (!confirm('Buscar y eliminar productos duplicados por nombre y precio?')) return;
                      const seen = new Map<string, string>();
                      for (const p of products) {
                        const key = `${String(p.name||'').trim().toLowerCase()}|${Number(p.price)||0}|${String(p.category||'').trim().toLowerCase()}`;
                        if (seen.has(key)) {
                          try { await deleteDoc(doc(db, 'products', p.id)); } catch {}
                        } else {
                          seen.set(key, p.id);
                        }
                      }
                      fetchProducts();
                    }} className="px-4 py-2 rounded-none border-2 border-black text-black hover:bg-black hover:text-white transition-colors">Eliminar Duplicados</button>
                    <button onClick={() => { setEditingProduct(null); setEditorOpen(true); }} className="px-4 py-2 rounded-none border-2 border-black text-black hover:bg-black hover:text-white transition-colors">+ Agregar Producto</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {products.map(product => (
                    <div key={product.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden h-full flex flex-col">
                      <div className="relative">
                        <img loading="lazy" src={product.image_url} alt={product.name} className="w-full h-44 object-cover" />
                        {(product as any).active === false && (
                          <span className="absolute top-2 left-2 text-xs px-2 py-1 rounded bg-gray-200 text-gray-700">inactivo</span>
                        )}
                      </div>
                      <div className="p-4 flex flex-col h-full">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-semibold">{product.name}</h3>
                          <span className="text-primary font-bold">${Number(product.price).toFixed(0)}</span>
                        </div>
                        <p className="text-gray-600 text-sm mt-1 line-clamp-2">{product.description}</p>
                        <div className="mt-3 flex items-center gap-2 text-xs text-gray-600">
                          <span className="px-2 py-1 bg-gray-100 rounded">{product.category || 'General'}</span>
                        </div>
                        <div className="mt-4 flex items-center gap-2 mt-auto">
                          <button onClick={() => { setEditingProduct(product); setEditorOpen(true); }} className="flex-1 border-2 border-black text-black px-3 py-2 rounded-none hover:bg-black hover:text-white">Editar</button>
                          <button onClick={() => handleDeactivate(product.id, (product as any).active === false ? true : false)} className={`flex-1 border-2 border-black px-3 py-2 rounded-none ${
  (product as any).active === false
    ? 'bg-white text-black hover:bg-black hover:text-white'
    : 'bg-black text-white hover:opacity-90'
}`}>{(product as any).active === false ? 'Activar' : 'Desactivar'}</button>
                          <button onClick={() => handleDeleteProduct(product.id)} className="border-2 border-black text-black px-3 py-2 rounded hover:bg-black hover:text-white"><Trash2 size={16} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <ProductEditorModal open={editorOpen} onClose={() => setEditorOpen(false)} product={editingProduct as any} onSaved={fetchProducts} />
              </div>
            )}

            {adminView === 'orders' && (
              <OrdersManagement />
            )}
            {adminView === 'contracts' && (
              <ContractsManagement />
            )}
            {adminView === 'packages' && (
              <PhotoPackagesManagement />
            )}
          </div>
        )}

        {isAdmin && adminFullscreen && (
          <div className="fixed inset-0 z-50 bg-white overflow-auto p-6">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center gap-2 mb-6">
                <button onClick={() => setAdminView('dashboard')} className={`px-4 py-2 rounded-none border-2 ${adminView==='dashboard' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Panel</button>
                <button onClick={() => setAdminView('products')} className={`px-4 py-2 rounded-none border-2 ${adminView==='products' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Productos</button>
                <button onClick={() => setAdminView('orders')} className={`px-4 py-2 rounded-none border-2 ${adminView==='orders' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Órdenes</button>
                <button onClick={() => setAdminView('contracts')} className={`px-4 py-2 rounded-none border-2 ${adminView==='contracts' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Contratos</button>
              <button onClick={() => setAdminView('packages')} className={`px-4 py-2 rounded-none border-2 ${adminView==='packages' ? 'bg-black text-white border-black' : 'border-black text-black hover:bg-black hover:text-white'}`}>Paquetes</button>
              <div className="ml-auto">
                  <button onClick={() => setAdminFullscreen(false)} className="px-4 py-2 rounded-none border-2 border-black text-black hover:bg-black hover:text-white">Cerrar pantalla completa</button>
                </div>
              </div>
              {adminView === 'dashboard' && <AdminStoreDashboard onNavigate={v => setAdminView(v)} />}
              {adminView === 'products' && (
                <div>
                  <div className="flex justify-between items-center mb-6">
                  <h2 className="section-title">Gestión de Productos</h2>
                  <div className="flex items-center gap-2">
                    <button onClick={async () => {
                      if (!confirm('Buscar y eliminar productos duplicados por nombre y precio?')) return;
                      const seen = new Map<string, string>();
                      for (const p of products) {
                        const key = `${String(p.name||'').trim().toLowerCase()}|${Number(p.price)||0}|${String(p.category||'').trim().toLowerCase()}`;
                        if (seen.has(key)) {
                          try { await deleteDoc(doc(db, 'products', p.id)); } catch {}
                        } else {
                          seen.set(key, p.id);
                        }
                      }
                      fetchProducts();
                    }} className="px-4 py-2 rounded-none border-2 border-black text-black hover:bg-black hover:text-white transition-colors">Eliminar Duplicados</button>
                    <button onClick={() => { setEditingProduct(null); setEditorOpen(true); }} className="px-4 py-2 rounded-none border-2 border-black text-black hover:bg-black hover:text-white transition-colors">+ Agregar Producto</button>
                  </div>
                </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {products.map(product => (
                      <div key={product.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden h-full flex flex-col">
                        <div className="relative">
                          <img loading="lazy" src={product.image_url} alt={product.name} className="w-full h-44 object-cover" />
                          {(product as any).active === false && (
                            <span className="absolute top-2 left-2 text-xs px-2 py-1 rounded bg-gray-200 text-gray-700">inactivo</span>
                          )}
                        </div>
                        <div className="p-4 flex flex-col h-full">
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="font-semibold">{product.name}</h3>
                            <span className="text-primary font-bold">${Number(product.price).toFixed(0)}</span>
                          </div>
                          <p className="text-gray-600 text-sm mt-1 line-clamp-2">{product.description}</p>
                          <div className="mt-3 flex items-center gap-2 text-xs text-gray-600">
                            <span className="px-2 py-1 bg-gray-100 rounded">{product.category || 'General'}</span>
                          </div>
                          <div className="mt-4 flex items-center gap-2 mt-auto">
                            <button onClick={() => { setEditingProduct(product); setEditorOpen(true); }} className="flex-1 border-2 border-black text-black px-3 py-2 rounded-none hover:bg-black hover:text-white">Editar</button>
                            <button onClick={() => handleDeactivate(product.id, (product as any).active === false ? true : false)} className={`flex-1 border-2 border-black px-3 py-2 rounded-none ${
  (product as any).active === false
    ? 'bg-white text-black hover:bg-black hover:text-white'
    : 'bg-black text-white hover:opacity-90'
}`}>{(product as any).active === false ? 'Activar' : 'Desactivar'}</button>
                            <button onClick={() => handleDeleteProduct(product.id)} className="border-2 border-black text-black px-3 py-2 rounded hover:bg-black hover:text-white"><Trash2 size={16} /></button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <ProductEditorModal open={editorOpen} onClose={() => setEditorOpen(false)} product={editingProduct as any} onSaved={fetchProducts} />
                </div>
              )}
              {adminView === 'orders' && <OrdersManagement />}
              {adminView === 'contracts' && <ContractsManagement />}
              {adminView === 'packages' && <PhotoPackagesManagement />}
            </div>
          </div>
        )}

        {!isAdmin && (
          <>
            <div className="flex flex-wrap gap-4 mb-8">
              {categories.map(category => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2 rounded-none border-2 ${
                    selectedCategory === category
                      ? 'bg-black text-white border-black'
                      : 'border-black text-black hover:bg-black hover:text-white'
                  }`}
                >
                  {categoryTranslations[category] || category}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filteredProducts.map(product => (
                <div key={product.id} className="bg-white rounded-lg shadow-md overflow-hidden relative">
                  <div className="relative">
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-full h-48 object-cover"
                    />
                    {product.custom_text && (
                      <div className="absolute top-2 left-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs">
                        {product.custom_text}
                      </div>
                    )}
                    <div className="absolute top-2 left-2 bg-primary bg-opacity-80 text-white px-2 py-1 rounded text-xs">
                      FOTO
                    </div>
                  </div>

                  <div className="p-4">
                    <h3 className="text-lg font-medium mb-2">{product.name}</h3>
                    <p className="text-gray-600 text-sm mb-4">{product.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xl font-playfair text-primary">
                        R$ {product.price.toFixed(2)}
                      </span>
                      <button
                        onClick={() => addStoreItemToGlobalCart(product.id)}
                        className="bg-primary text-white p-2 rounded-full hover:bg-opacity-90"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}


      </div>
    </section>
  );
};

export default StorePage;
