import { useEffect, useMemo, useState } from 'react';
import { db } from '../../utils/firebaseClient';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { Trash2, Clock, Loader, CheckCircle, List, User, Calendar, DollarSign, Settings, ChevronDown, ChevronUp, Mail, MapPin, CreditCard, FileText, Pencil, Plus, Trash } from 'lucide-react';
import { defaultWorkflow, categoryColors, WorkflowTemplate } from './_contractsWorkflowHelper';

export type OrderStatus = 'pendiente' | 'procesando' | 'completado';

interface WorkflowTask { id: string; title: string; done: boolean; due?: string | null; note?: string }
interface WorkflowCategory { id: string; name: string; tasks: WorkflowTask[] }

interface OrderLineItem {
  product_id?: string;
  productId?: string;
  name?: string;
  qty?: number;
  quantity?: number;
  price?: number;
  total?: number;
}

interface OrderAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

interface OrderItem {
  id: string;
  customer_name?: string;
  customer_email?: string;
  payment_method?: string;
  notes?: string;
  items?: OrderLineItem[];
  total?: number;
  created_at?: string;
  status?: OrderStatus | string;
  workflow?: WorkflowCategory[];
  contractId?: string;
}

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const OrdersManagement = () => {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<'todas' | OrderStatus>('todas');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [viewing, setViewing] = useState<OrderItem | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowCategory[] | null>(null);
  const [wfEditMode, setWfEditMode] = useState(false);
  const [savingWf, setSavingWf] = useState(false);

  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [defaults, setDefaults] = useState<{ products?: string; packages?: string }>({});

  const fetchOrders = async () => {
    setLoading(true);
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setOrders([]);
        return;
      }
      let items: OrderItem[] = [];
      try {
        const snap = await getDocs(query(collection(db, 'orders'), orderBy('created_at', 'desc')));
        items = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      } catch (_) {
        try {
          const snap = await getDocs(collection(db, 'orders'));
          items = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
          items.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
        } catch (e) {
          console.warn('No se pudieron cargar las órdenes', e);
          items = [];
        }
      }
      setOrders(items);
    } catch (e) {
      console.warn('Error inesperado al cargar órdenes', e);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    const snap = await getDocs(collection(db, 'workflowTemplates'));
    const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as WorkflowTemplate[];
    setTemplates(list);
    const defDoc = await getDoc(doc(db, 'settings', 'workflowDefaults'));
    setDefaults((defDoc.exists() ? defDoc.data() : {}) as any);
  };

  useEffect(() => { fetchOrders(); }, []);

  const filtered = useMemo(() => {
    return orders.filter(o => {
      const byStatus = statusFilter === 'todas' ? true : (o.status === statusFilter);
      const s = search.trim().toLowerCase();
      const bySearch = s ? ((o.customer_name || '').toLowerCase().includes(s) || (o.customer_email || '').toLowerCase().includes(s)) : true;
      return byStatus && bySearch;
    });
  }, [orders, statusFilter, search]);

  const counts = useMemo(() => ({
    todas: orders.length,
    pendiente: orders.filter(o => o.status === 'pendiente').length,
    procesando: orders.filter(o => o.status === 'procesando').length,
    completado: orders.filter(o => o.status === 'completado').length,
  }), [orders]);

  const updateStatus = async (id: string, status: OrderStatus) => {
    await updateDoc(doc(db, 'orders', id), { status });
    await fetchOrders();
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar esta orden?')) return;
    await deleteDoc(doc(db, 'orders', id));
    await fetchOrders();
  };

  const openWorkflow = async (o: OrderItem) => {
    setViewing(o);
    const wf = (o.workflow && o.workflow.length) ? o.workflow : defaultWorkflow({});
    setWorkflow(JSON.parse(JSON.stringify(wf)));
    if (templates.length === 0) await fetchTemplates();
    setWfEditMode(false);
  };

  const saveWorkflow = async () => {
    if (!viewing || !workflow) return;
    setSavingWf(true);
    try {
      await updateDoc(doc(db, 'orders', viewing.id), { workflow } as any);
      await fetchOrders();
    } finally {
      setSavingWf(false);
    }
  };

  const applyTemplateToOrder = (tpl: WorkflowTemplate | null) => {
    if (!tpl) return;
    const cloned = tpl.categories.map(c => ({ id: c.id || uid(), name: c.name, tasks: c.tasks.map(t => ({ ...t, id: t.id || uid(), done: false })) }));
    setWorkflow(cloned);
  };

  const colorsFor = (len: number) => categoryColors(len);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Gestión de Órdenes</h2>
        <div className="flex items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente/email" className="px-3 py-2 border rounded-full" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['todas','pendiente','procesando','completado'] as const).map(s => {
          const Icon = s === 'todas' ? List : s === 'pendiente' ? Clock : s === 'procesando' ? Loader : CheckCircle;
          const count = (counts as any)[s];
          const color = s === 'pendiente'
            ? 'border-red-600 text-red-600 hover:bg-red-600 hover:text-white'
            : s === 'procesando'
            ? 'border-yellow-500 text-yellow-700 hover:bg-yellow-500 hover:text-black'
            : s === 'completado'
            ? 'border-green-600 text-green-600 hover:bg-green-600 hover:text-white'
            : 'border-black text-black hover:bg-black hover:text-white';
          const active = statusFilter === s
            ? (s === 'pendiente' ? 'bg-red-600 text-white border-red-600'
              : s === 'procesando' ? 'bg-yellow-500 text-black border-yellow-500'
              : s === 'completado' ? 'bg-green-600 text-white border-green-600'
              : 'bg-black text-white border-black')
            : '';
          return (
            <button key={s} onClick={() => setStatusFilter(s)} title={s} className={`px-3 py-2 rounded-full border-2 inline-flex items-center gap-2 ${active || color}`}>
              <Icon size={16} />
              <span className="text-xs px-1.5 py-0.5 border rounded">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-12 p-3 text-xs font-medium border-b">
          <div className="col-span-1" />
          <div className="col-span-3">Cliente</div>
          <div className="col-span-2">Fecha</div>
          <div className="col-span-1">Total</div>
          <div className="col-span-3">Progreso del flujo</div>
          <div className="col-span-2 text-right">Acciones</div>
        </div>
        {loading && <div className="p-4 text-sm text-gray-500">Cargando...</div>}
        {!loading && filtered.length === 0 && <div className="p-4 text-sm text-gray-500">Sin resultados</div>}
        <div className="divide-y">
          {filtered.map(o => {
            const wf = (o.workflow && o.workflow.length) ? o.workflow : defaultWorkflow({});
            const segments = wf.map(cat => {
              const total = cat.tasks.length || 1;
              const done = cat.tasks.filter(t => t.done).length;
              return total === 0 ? 0 : Math.round((done/total)*100);
            });
            const cols = colorsFor(wf.length);
            return (
              <div key={o.id} className="grid grid-cols-12 p-3 items-center">
                <div className="col-span-1">
                  <button onClick={() => setExpanded(e => ({ ...e, [o.id]: !e[o.id] }))} className="border-2 border-black text-black px-2 py-1 rounded-full hover:bg-black hover:text-white inline-flex items-center" title={expanded[o.id] ? 'Ocultar' : 'Ver detalles'}>
                    {expanded[o.id] ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                  </button>
                </div>
                <div className="col-span-3 lowercase first-letter:uppercase">{o.customer_name || 'cliente'}</div>
                <div className="col-span-2 text-sm text-gray-600">{o.created_at ? new Date(o.created_at).toLocaleDateString() : ''}</div>
                <div className="col-span-1 font-semibold">${Number(o.total || 0).toFixed(0)}</div>
                <div className="col-span-3">
                  <div className="w-full h-3 rounded bg-gray-200 overflow-hidden flex">
                    {segments.map((p, i) => (
                      <div key={i} className="relative flex-1 bg-gray-200">
                        <div className="absolute inset-y-0 left-0" style={{ width: `${p}%`, backgroundColor: cols[i] }} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="col-span-2 text-right flex items-center justify-end gap-2">
                  <div className="flex gap-1">
                    {(['pendiente','procesando','completado'] as const).map(s => {
                      const colorBase = s==='pendiente' ? 'border-red-600 text-red-600 hover:bg-red-600 hover:text-white' : s==='procesando' ? 'border-yellow-500 text-yellow-700 hover:bg-yellow-500 hover:text-black' : 'border-green-600 text-green-600 hover:bg-green-600 hover:text-white';
                      const active = o.status===s ? (s==='pendiente' ? 'bg-red-600 text-white border-red-600' : s==='procesando' ? 'bg-yellow-500 text-black border-yellow-500' : 'bg-green-600 text-white border-green-600') : '';
                      const Icon = s==='pendiente' ? Clock : s==='procesando' ? Loader : CheckCircle;
                      return (
                        <button key={s} onClick={() => updateStatus(o.id, s)} title={s} className={`px-2 py-1 text-xs border-2 rounded-full inline-flex items-center justify-center ${active || colorBase}`}>
                          <Icon size={14} />
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => openWorkflow(o)} title="Workflow" className="border-2 border-black text-black px-2 py-1 rounded-full hover:bg-black hover:text-white inline-flex items-center"><Pencil size={14}/></button>
                  <button onClick={() => remove(o.id)} title="Eliminar" className="border-2 border-black text-black px-2 py-1 rounded-full hover:bg-black hover:text-white inline-flex items-center"><Trash2 size={14}/></button>
                </div>
                {expanded[o.id] && (
                  <div className="col-span-12 mt-3">
                    <div className="border rounded-lg p-3 bg-gray-50">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div className="flex items-center gap-2"><Mail size={14} className="text-gray-600"/><span>{o.customer_email || '-'}</span></div>
                        <div className="flex items-center gap-2"><CreditCard size={14} className="text-gray-600"/><span>{o.payment_method || '-'}</span></div>
                        <div className="flex items-center gap-2"><FileText size={14} className="text-gray-600"/><span>#{o.id}</span></div>
                      </div>

                      <div className="mt-3">
                        <div className="text-xs font-medium mb-2 flex items-center gap-2"><FileText size={14}/> Productos</div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-gray-600">
                                <th className="py-1">Producto</th>
                                <th className="py-1">Cant.</th>
                                <th className="py-1">Precio</th>
                                <th className="py-1">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(o.items || []).map((it, idx) => {
                                const qty = Number(it.qty ?? it.quantity ?? 1);
                                const price = Number(it.price ?? 0);
                                const total = it.total != null ? Number(it.total) : price * qty;
                                return (
                                  <tr key={idx} className="border-t">
                                    <td className="py-1">{it.name || it.product_id || it.productId || '—'}</td>
                                    <td className="py-1">{qty}</td>
                                    <td className="py-1">${price.toFixed(0)}</td>
                                    <td className="py-1">${total.toFixed(0)}</td>
                                  </tr>
                                );
                              })}
                              {(!o.items || o.items.length === 0) && (
                                <tr className="border-t"><td className="py-2 text-gray-500" colSpan={4}>Sin productos</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {o.notes && (
                        <div className="mt-3 text-sm text-gray-700">
                          <div className="text-xs font-medium mb-1">Notas</div>
                          <div className="whitespace-pre-line">{o.notes}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {viewing && workflow && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={()=> setViewing(null)}>
          <div className="bg-white rounded-xl border border-gray-200 w-full max-w-5xl p-0 overflow-hidden" onClick={(e)=> e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <div className="text-lg font-medium">{viewing.customer_name || 'Cliente'} — Orden #{viewing.id}</div>
                <div className="text-xs text-gray-500">Fecha: {viewing.created_at ? new Date(viewing.created_at).toLocaleString() : '-'}</div>
              </div>
              <button onClick={()=> setViewing(null)} className="text-gray-500 hover:text-gray-900">✕</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
              <div className="md:col-span-1 border-r p-4 max-h-[70vh] overflow-auto">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium">Workflow</h3>
                  <button onClick={()=> setWfEditMode(v=> !v)} className="text-xs border px-2 py-1 rounded-none">{wfEditMode ? 'Salir de edición' : 'Editar'}</button>
                </div>
                <div className="space-y-4">
                  {workflow.map((cat, ci) => {
                    const cols = colorsFor(workflow.length);
                    return (
                      <div key={cat.id} className="relative pl-3">
                        <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded" style={{ backgroundColor: cols[ci] }} />
                        <div className="flex items-center gap-2 mb-2">
                          {wfEditMode ? (
                            <input value={cat.name} onChange={e=>{
                              const val = e.target.value; setWorkflow(w=>{ const n = w? [...w]:[]; n[ci] = { ...n[ci], name: val }; return n;});
                            }} className="text-sm font-semibold border px-2 py-1 rounded-none" />
                          ) : (
                            <div className="text-sm font-semibold">{cat.name}</div>
                          )}
                          {wfEditMode && (
                            <button onClick={()=>{
                              setWorkflow(w=>{ const n = w? [...w]:[]; n.splice(ci,1); return n;});
                            }} className="text-red-600 hover:text-red-800" title="Eliminar categoría"><Trash size={14}/></button>
                          )}
                        </div>
                        <div className="space-y-2">
                          {cat.tasks.map((t, ti) => (
                            <div key={t.id} className="flex items-start gap-2">
                              {!wfEditMode && (
                                <input type="checkbox" checked={t.done} onChange={(e)=>{
                                  setWorkflow(wf=>{ const next = wf ? [...wf] : []; next[ci] = { ...next[ci], tasks: next[ci].tasks.map((x, idx)=> idx===ti? { ...x, done: e.target.checked }: x)}; return next; });
                                }} />
                              )}
                              <div className="flex-1">
                                {wfEditMode ? (
                                  <input value={t.title} onChange={e=>{
                                    const val = e.target.value; setWorkflow(w=>{ const n = w? [...w]:[]; const ts = [...n[ci].tasks]; ts[ti] = { ...ts[ti], title: val }; n[ci] = { ...n[ci], tasks: ts }; return n;});
                                  }} className="text-sm border px-2 py-1 rounded-none w-full" />
                                ) : (
                                  <div className="text-sm">{t.title}</div>
                                )}
                                {t.due && !wfEditMode && <div className="text-xs text-gray-500">Vence: {new Date(t.due).toLocaleString('es-ES')}</div>}
                                {wfEditMode && (
                                  <div className="mt-1 flex items-center gap-2 text-xs">
                                    <label className="text-gray-600">Vence:</label>
                                    <input type="datetime-local" value={t.due ? new Date(t.due).toISOString().slice(0,16): ''} onChange={e=>{
                                      const iso = e.target.value ? new Date(e.target.value).toISOString(): null;
                                      setWorkflow(w=>{ const n = w? [...w]:[]; const ts = [...n[ci].tasks]; ts[ti] = { ...ts[ti], due: iso }; n[ci] = { ...n[ci], tasks: ts }; return n;});
                                    }} className="border px-2 py-1 rounded-none" />
                                    <button onClick={()=>{
                                      setWorkflow(w=>{ const n = w? [...w]:[]; const ts = n[ci].tasks.filter((_,idx)=> idx!==ti); n[ci] = { ...n[ci], tasks: ts }; return n;});
                                    }} className="text-red-600 hover:text-red-800" title="Eliminar tarea"><Trash size={14}/></button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                          {wfEditMode && (
                            <button onClick={()=>{
                              setWorkflow(w=>{ const n = w? [...w]:[]; const ts = [...n[ci].tasks, { id: uid(), title: 'Nueva tarea', done: false }]; n[ci] = { ...n[ci], tasks: ts }; return n;});
                            }} className="text-xs border px-2 py-1 rounded-none inline-flex items-center gap-1"><Plus size={12}/> Añadir tarea</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {wfEditMode && (
                    <button onClick={()=>{
                      setWorkflow(w=>{ const n = w? [...w]:[]; n.push({ id: uid(), name: 'Nueva categoría', tasks: [] }); return n;});
                    }} className="border-2 border-black text-black px-3 py-2 rounded-none hover:bg-black hover:text-white inline-flex items-center gap-2"><Plus size={14}/> Añadir categoría</button>
                  )}
                  <button onClick={saveWorkflow} disabled={savingWf} className="border-2 border-black bg-black text-white px-3 py-2 rounded-none hover:opacity-90 disabled:opacity-50">Guardar</button>
                  <div className="ml-auto flex items-center gap-2">
                    <select onChange={(e)=>{ const id = e.target.value; const tpl = templates.find(t=>t.id===id) || null; applyTemplateToOrder(tpl); }} className="border px-2 py-2 rounded-none text-sm">
                      <option value="">Elegir plantilla…</option>
                      {templates.map(t=> <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <button onClick={async()=>{ const d = await getDoc(doc(db,'settings','workflowDefaults')); const defs = (d.exists()? d.data(): {}) as any; setDefaults(defs); const tpl = templates.find(t=>t.id===defs.products) || null; applyTemplateToOrder(tpl); }} className="border px-2 py-2 text-sm rounded-none">Aplicar def. Productos</button>
                  </div>
                </div>
              </div>
              <div className="md:col-span-2 p-4 max-h-[70vh] overflow-auto space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-600">Cliente:</span> <span className="font-medium">{viewing.customer_name || '-'}</span></div>
                  <div><span className="text-gray-600">Email:</span> <span className="font-medium">{viewing.customer_email || '-'}</span></div>
                  <div><span className="text-gray-600">Fecha:</span> <span className="font-medium">{viewing.created_at ? new Date(viewing.created_at).toLocaleString() : '-'}</span></div>
                  <div><span className="text-gray-600">Método de pago:</span> <span className="font-medium">{viewing.payment_method || '-'}</span></div>
                  <div><span className="text-gray-600">Total:</span> <span className="font-medium">${Number(viewing.total || 0).toFixed(0)}</span></div>
                </div>

                <div>
                  <div className="text-sm font-medium mb-2">Productos</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-600">
                          <th className="py-1">Producto</th>
                          <th className="py-1">Cant.</th>
                          <th className="py-1">Precio</th>
                          <th className="py-1">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(viewing.items || []).map((it, idx) => {
                          const qty = Number(it.qty ?? it.quantity ?? 1);
                          const price = Number(it.price ?? 0);
                          const total = it.total != null ? Number(it.total) : price * qty;
                          return (
                            <tr key={idx} className="border-t">
                              <td className="py-1">{it.name || it.product_id || it.productId || '—'}</td>
                              <td className="py-1">{qty}</td>
                              <td className="py-1">${price.toFixed(0)}</td>
                              <td className="py-1">${total.toFixed(0)}</td>
                            </tr>
                          );
                        })}
                        {(!viewing.items || viewing.items.length === 0) && (
                          <tr className="border-t"><td className="py-2 text-gray-500" colSpan={4}>Sin productos</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrdersManagement;
