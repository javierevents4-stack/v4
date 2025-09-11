import { useEffect, useMemo, useState } from 'react';
import { db } from '../../utils/firebaseClient';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { Clock, Loader, CheckCircle, List, Mail, CreditCard, FileText, Plus, Trash } from 'lucide-react';
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

  const [viewing, setViewing] = useState<OrderItem | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowCategory[] | null>(null);
  const [wfEditMode, setWfEditMode] = useState(false);
  const [savingWf, setSavingWf] = useState(false);

  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [defaults, setDefaults] = useState<{ products?: string; packages?: string }>({});

  const [contractsMap, setContractsMap] = useState<Record<string, any>>({});
  const [contractsByEmail, setContractsByEmail] = useState<Record<string, any>>({});
  const [linking, setLinking] = useState(false);

  // products lookup to automatically get image_url by product id or name
  const [productsById, setProductsById] = useState<Record<string, any>>({});
  const [productsByName, setProductsByName] = useState<Record<string, any>>({});

  const normalizeStr = (s: string) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

  const resolveImageForItem = (it: any) => {
    if (!it) return undefined;
    // Prefer explicit image fields on the order item
    const candidates = [it.image_url, it.image, it.img, it.imageUrl, it.thumbnail].filter(Boolean);
    if (candidates.length) return candidates[0];
    // Try product id
    const pid = it.productId || it.product_id || it.productId || it.id;
    if (pid && productsById[pid] && productsById[pid].image_url) return productsById[pid].image_url;
    // Try by name
    const nameKey = normalizeStr(it.name || it.product_name || it.title || '');
    if (nameKey && productsByName[nameKey] && productsByName[nameKey].image_url) return productsByName[nameKey].image_url;
    return undefined;
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setOrders([]);
        return;
      }
      let items: OrderItem[] = [];

      // load products map for automatic image lookup
      try {
        const psnap = await getDocs(collection(db, 'products'));
        const byId: Record<string, any> = {};
        const byName: Record<string, any> = {};
        psnap.docs.forEach(pdoc => {
          const pdata = pdoc.data() as any;
          byId[pdoc.id] = pdata;
          const nameKey = String((pdata.name || '')).toLowerCase().trim();
          if (nameKey) byName[nameKey] = pdata;
        });
        setProductsById(byId);
        setProductsByName(byName);
      } catch (e) {
        // ignore product load errors
        setProductsById({});
        setProductsByName({});
      }

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

      // Ensure every contract with storeItems has a single order record (aggregate per contract)
      try {
        const csnap = await getDocs(query(collection(db, 'contracts'), orderBy('createdAt', 'desc')));
        const contractsList = csnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

        const generatedFromContracts: OrderItem[] = [];

        for (const c of contractsList) {
          const storeItems = Array.isArray(c.storeItems) ? c.storeItems : [];
          if (!storeItems.length) continue;

          // If an order for this contract already exists in items, skip
          const existsInItems = items.some(it => String(it.contractId || it.contract_id || it.contract).replace(/^contract-/, '') === String(c.id));
          if (existsInItems) continue;

          // Try to find orders in DB for this contract
          let existingOrders: any[] = [];
          try {
            const existingSnap = await getDocs(query(collection(db, 'orders'), where('contractId', '==', c.id)));
            if (!existingSnap.empty) existingOrders = existingSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
          } catch (e) {
            console.warn('Error checking existing orders for contract', c.id, e);
          }

          if (existingOrders.length > 0) {
            // aggregate existing orders
            const aggItems: OrderLineItem[] = [];
            let totalAmt = 0;
            let createdAt = existingOrders[0].createdAt || existingOrders[0].created_at || new Date().toISOString();
            let thumbnail: string | undefined;

            for (const eo of existingOrders) {
              const its = Array.isArray(eo.items) ? eo.items : [];
              its.forEach((it: any) => {
                const qty = Number(it.quantity ?? it.qty ?? 1) || 1;
                const price = Number(it.price ?? 0) || 0;
                const total = it.total != null ? Number(it.total) : price * qty;
                aggItems.push({ name: it.name || it.product_id || '', qty: qty, price, total });
                totalAmt += total;
                if (!thumbnail) {
                  const resolved = resolveImageForItem(it);
                  if (resolved) thumbnail = resolved;
                }
              });
              createdAt = createdAt || (eo.createdAt || eo.created_at);
            }

            generatedFromContracts.push({
              id: existingOrders[0].id,
              customer_name: c.clientName || c.client_name || '',
              customer_email: c.clientEmail || c.client_email || '',
              items: aggItems,
              total: totalAmt,
              created_at: createdAt,
              status: existingOrders[0].status || 'pendiente',
              workflow: c.workflow || undefined,
              contractId: c.id,
              thumbnail
            } as OrderItem);
            continue;
          }

          // No existing orders in DB: create an aggregated order document
          const itemsForOrder = storeItems.map((si: any) => {
            const qty = Number(si.quantity ?? si.qty ?? 1) || 1;
            const price = Number(si.price ?? 0) || 0;
            const total = si.total != null ? Number(si.total) : price * qty;
            return { name: si.name || si.title || '', quantity: qty, price, total, image_url: si.image_url };
          });

          const totalAmountForContract = itemsForOrder.reduce((s, it) => s + Number(it.total || 0), 0) + Number(c.travelFee || 0);
          const orderData: any = {
            clientName: c.clientName || c.client_name || '',
            clientEmail: c.clientEmail || c.client_email || '',
            items: itemsForOrder,
            totalAmount: totalAmountForContract,
            status: 'pending',
            paymentMethod: c.paymentMethod || '',
            contractId: c.id,
            createdAt: c.contractDate || c.createdAt || new Date().toISOString()
          };

          try {
            const refDoc = await addDoc(collection(db, 'orders'), orderData);
            generatedFromContracts.push({ id: refDoc.id, ...orderData, thumbnail: (itemsForOrder[0] && (itemsForOrder[0] as any).image_url) } as OrderItem);
          } catch (e) {
            console.warn('Failed to create aggregated order for contract', c.id, e);
          }
        }

        // merge generatedFromContracts into items
        if (generatedFromContracts.length > 0) {
          items = [...(items || []), ...generatedFromContracts];
        }
      } catch (e) {
        console.warn('Error ensuring orders for contracts', e);
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

  const loadContractsMap = async () => {
    try {
      const snap = await getDocs(collection(db, 'contracts'));
      const map: Record<string, any> = {};
      const byEmail: Record<string, any> = {};
      snap.docs.forEach(d => {
        const data = { id: d.id, ...(d.data() as any) };
        map[d.id] = data;
        const email = String((data.clientEmail || data.client_email || '').toLowerCase()).trim();
        if (email) byEmail[email] = data;
      });
      setContractsMap(map);
      setContractsByEmail(byEmail);
      return { map, byEmail };
    } catch (e) {
      setContractsMap({});
      setContractsByEmail({});
      return { map: {}, byEmail: {} };
    }
  };

  useEffect(() => { loadContractsMap(); }, []);

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

  const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

  const getDisplayItems = (o: OrderItem) => {
    if (!o) return o.items || [];
    let c = o.contractId ? contractsMap[o.contractId] : null;
    if (!c && o.customer_email) {
      const key = String(o.customer_email).toLowerCase().trim();
      c = contractsByEmail[key] || Object.values(contractsMap).find((x: any) => String((x.clientEmail || x.client_email || '')).toLowerCase().trim() === key) || null;
    }

    const orderItems = Array.isArray(o.items) ? o.items : [];

    if (c && Array.isArray(c.storeItems) && c.storeItems.length) {
      // Build canonical contract items
      const contractItems = (c.storeItems || []).map((si: any) => ({
        name: si.name || si.productName || si.title || '',
        quantity: Number(si.quantity ?? si.qty ?? 1),
        price: Number(si.price ?? 0),
        total: si.total != null ? Number(si.total) : Number(si.price ?? 0) * Number(si.quantity ?? si.qty ?? 1),
      }));

      const norm = (s: string) => normalize(String(s || ''));
      const contractNames = new Set(contractItems.map(ci => norm(ci.name)));

      // Merge: prefer order item values when present, otherwise fallback to contract item
      const merged = contractItems.map(ci => {
        const match = orderItems.find(oi => norm(oi.name || oi.product_id || oi.productId || '') === norm(ci.name));
        if (match) {
          const qty = Number(match.qty ?? match.quantity ?? ci.quantity);
          const price = Number(match.price ?? match.price ?? ci.price);
          const total = match.total != null ? Number(match.total) : price * qty;
          return { name: match.name || ci.name, qty, price, total } as OrderLineItem;
        }
        return { name: ci.name, qty: ci.quantity, price: ci.price, total: ci.total } as OrderLineItem;
      });

      // Any extra items present in orderItems that are not in contract storeItems
      const extras = orderItems.filter(oi => !contractNames.has(norm(oi.name || oi.product_id || oi.productId || ''))).map(e => ({
        name: e.name || e.product_id || e.productId || '',
        qty: Number(e.qty ?? e.quantity ?? 1),
        price: Number(e.price ?? 0),
        total: e.total != null ? Number(e.total) : Number(e.price ?? 0) * Number(e.qty ?? e.quantity ?? 1),
      } as OrderLineItem));

      return [...merged, ...extras];
    }

    // No contract mapping - return order items as-is (normalized fields)
    return orderItems.map(it => ({
      name: it.name || it.product_id || it.productId || '',
      qty: Number(it.qty ?? it.quantity ?? 1),
      price: Number(it.price ?? 0),
      total: it.total != null ? Number(it.total) : Number(it.price ?? 0) * Number(it.qty ?? it.quantity ?? 1),
    } as OrderLineItem));
  };

  const ensureDeliveryTasks = (base: WorkflowCategory[], productNames: string[]) => {
    const cloned = JSON.parse(JSON.stringify(base)) as WorkflowCategory[];
    const findIdx = cloned.findIndex(c => normalize(c.name).includes('entrega'));
    const idx = findIdx >= 0 ? findIdx : cloned.length;
    if (findIdx < 0) cloned.push({ id: uid(), name: 'Entrega de productos', tasks: [] });
    const cat = cloned[idx];
    productNames.forEach(n => {
      const title = `Entregar ${n}`;
      if (!cat.tasks.some(t => normalize(t.title) === normalize(title))) {
        cat.tasks.push({ id: uid(), title, done: false });
      }
    });
    cloned[idx] = cat;
    return cloned;
  };

  const openWorkflow = async (o: OrderItem) => {
    setViewing(o);
    // ensure contracts map is loaded to display store items correctly
    if (!contractsMap || Object.keys(contractsMap).length === 0) {
      await loadContractsMap();
    }
    const base = (o.workflow && o.workflow.length) ? o.workflow : [];
    const items = getDisplayItems(o);
    const names = items.map(it => String(it.name || it.product_id || it.productId || ''));
    const wf = ensureDeliveryTasks(base, names);
    setWorkflow(JSON.parse(JSON.stringify(wf)));
    if (templates.length === 0) await fetchTemplates();
    setWfEditMode(false);
  };

  const saveWorkflow = async () => {
    if (!viewing || !workflow) return;
    setSavingWf(true);
    try {
      await updateDoc(doc(db, 'orders', viewing.id), { workflow } as any);

      // Try to sync to contract: prefer explicit contractId, otherwise match by customer_email
      let targetContractId = viewing.contractId || null;
      let targetRef: any = null;
      if (!targetContractId && viewing.customer_email) {
        const key = String(viewing.customer_email).toLowerCase().trim();
        const matched = contractsByEmail[key] || Object.values(contractsMap).find((x: any) => String((x.clientEmail || x.client_email || '')).toLowerCase().trim() === key) || null;
        if (matched) targetContractId = matched.id;
      }
      if (targetContractId) {
        const cRef = doc(db, 'contracts', targetContractId);
        const cSnap = await getDoc(cRef);
        if (cSnap.exists()) {
          const contract = { id: cSnap.id, ...(cSnap.data() as any) } as any;
          const base = (contract.workflow && contract.workflow.length) ? contract.workflow : [];
          const items = getDisplayItems(viewing);
          const names = items.map(it => String(it.name || it.product_id || it.productId || ''));
          const merged = ensureDeliveryTasks(base, names);
          const ordDeliveryCat = (workflow as WorkflowCategory[]).find(c => normalize(c.name).includes('entrega'));
          if (ordDeliveryCat) {
            merged.forEach(cat => {
              if (normalize(cat.name).includes('entrega')) {
                cat.tasks = cat.tasks.map(t => {
                  const match = ordDeliveryCat.tasks.find(ot => normalize(ot.title) === normalize(t.title));
                  return match ? { ...t, done: !!match.done } : t;
                });
              }
            });
          }
          await updateDoc(cRef, { workflow: merged } as any);
        }
      }

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

  const autoLinkOrders = async () => {
    if (!confirm('Vincular órdenes sin contractId a contratos coincidentes por email o productos?')) return;
    setLinking(true);
    try {
      const toProcess = (orders || []).filter(o => !o.contractId);
      let count = 0;
      for (const o of toProcess) {
        let target: any = null;
        if (o.customer_email) {
          const key = String(o.customer_email).toLowerCase().trim();
          target = contractsByEmail[key] || Object.values(contractsMap).find((x: any) => String((x.clientEmail || x.client_email || '')).toLowerCase().trim() === key) || null;
        }
        if (!target) {
          const onames = new Set((o.items || []).map(it => String(it.name || it.product_id || it.productId || '').toLowerCase().trim()));
          target = Object.values(contractsMap).find((c: any) => Array.isArray(c.storeItems) && c.storeItems.some((si: any)=> onames.has(String(si.name||'').toLowerCase().trim())) );
        }
        if (target) {
          try {
            await updateDoc(doc(db,'orders', o.id), { contractId: target.id } as any);
            count++;
          } catch (e) {
            console.warn('Error linking order', o.id, e);
          }
        }
      }
      await fetchOrders();
      const snap = await getDocs(collection(db, 'contracts'));
      const map: Record<string, any> = {};
      const byEmail: Record<string, any> = {};
      snap.docs.forEach(d => { const data = { id: d.id, ...(d.data() as any) }; map[d.id] = data; const email = String((data.clientEmail || data.client_email || '').toLowerCase()).trim(); if (email) byEmail[email] = data; });
      setContractsMap(map);
      setContractsByEmail(byEmail);
      alert('Vinculadas ' + count + ' órdenes');
    } finally {
      setLinking(false);
    }
  };

  // New handlers: mark delivery as paid (marks entrega tasks as done on contract and order), and reset
  const markDeliveryPaid = async () => {
    if (!viewing) return;
    setSavingWf(true);
    try {
      // determine target contract id
      let targetContractId = viewing.contractId || null;
      if (!targetContractId && viewing.customer_email) {
        const key = String(viewing.customer_email).toLowerCase().trim();
        const matched = contractsByEmail[key] || Object.values(contractsMap).find((x: any) => String((x.clientEmail || x.client_email || '')).toLowerCase().trim() === key) || null;
        if (matched) targetContractId = matched.id;
      }

      // update local workflow state to mark entrega tasks done
  const updatedLocal = (workflow || []).map(cat => ({ ...cat, tasks: cat.tasks.map(t => ({ ...t, done: normalize(cat.name).includes('entrega') ? true : t.done })) }));
  setWorkflow(updatedLocal);
  // reflect paid & delivered state immediately in the open modal
  setViewing(v => v ? { ...v, depositPaid: true, workflow: updatedLocal, status: 'completado' } as any : v);

  // update order doc: mark as paid and delivered (completado)
  try {
    await updateDoc(doc(db, 'orders', viewing.id), { workflow: updatedLocal, depositPaid: true, status: 'completado', deliveredAt: new Date().toISOString() } as any);
  } catch (e) {
    console.warn('Failed updating order with paid state', e);
  }

      // update contract if available
      if (targetContractId) {
        try {
          const cRef = doc(db, 'contracts', targetContractId);
          const cSnap = await getDoc(cRef);
          if (cSnap.exists()) {
            const contract = { id: cSnap.id, ...(cSnap.data() as any) } as any;
            const base = (contract.workflow && contract.workflow.length) ? contract.workflow : [];
            const items = getDisplayItems(viewing as OrderItem);
            const names = items.map(it => String(it.name || it.product_id || it.productId || ''));
            const merged = ensureDeliveryTasks(base, names);
            // mark entrega tasks done
            merged.forEach(cat => {
              if (normalize(cat.name).includes('entrega')) cat.tasks = cat.tasks.map(t => ({ ...t, done: true }));
            });
            await updateDoc(cRef, { workflow: merged, depositPaid: true } as any);
            // refresh local contracts map so UI reads updated depositPaid
            await loadContractsMap();
          }
        } catch (e) {
          console.warn('Failed updating contract workflow on mark paid', e);
        }
      }

      // refresh orders map
      await fetchOrders();
      // ensure contracts map is fresh after changes
      await loadContractsMap();
    } finally {
      setSavingWf(false);
    }
  };

  const resetDeliveryPaid = async () => {
    if (!viewing) return;
    setSavingWf(true);
    try {
      let targetContractId = viewing.contractId || null;
      if (!targetContractId && viewing.customer_email) {
        const key = String(viewing.customer_email).toLowerCase().trim();
        const matched = contractsByEmail[key] || Object.values(contractsMap).find((x: any) => String((x.clientEmail || x.client_email || '')).toLowerCase().trim() === key) || null;
        if (matched) targetContractId = matched.id;
      }

      const updatedLocal = (workflow || []).map(cat => ({ ...cat, tasks: cat.tasks.map(t => ({ ...t, done: normalize(cat.name).includes('entrega') ? false : t.done })) }));
  setWorkflow(updatedLocal);
  // reflect reset state immediately in the open modal
  setViewing(v => v ? { ...v, depositPaid: false, workflow: updatedLocal, status: 'pendiente' } as any : v);

  try {
    // revert fields set by Pagado, including deliveredAt
    await updateDoc(doc(db, 'orders', viewing.id), { workflow: updatedLocal, depositPaid: false, status: 'pendiente', deliveredAt: null } as any);
  } catch (e) {
    console.warn('Failed resetting order paid state', e);
  }

      if (targetContractId) {
        try {
          const cRef = doc(db, 'contracts', targetContractId);
          const cSnap = await getDoc(cRef);
          if (cSnap.exists()) {
            const contract = { id: cSnap.id, ...(cSnap.data() as any) } as any;
            const base = (contract.workflow && contract.workflow.length) ? contract.workflow : [];
            const items = getDisplayItems(viewing as OrderItem);
            const names = items.map(it => String(it.name || it.product_id || it.productId || ''));
            const merged = ensureDeliveryTasks(base, names);
            merged.forEach(cat => {
              if (normalize(cat.name).includes('entrega')) cat.tasks = cat.tasks.map(t => ({ ...t, done: false }));
            });
            await updateDoc(cRef, { workflow: merged, depositPaid: false } as any);
            // refresh local contracts map so UI reads updated depositPaid
            await loadContractsMap();
          }
        } catch (e) {
          console.warn('Failed resetting contract workflow', e);
        }
      }

      await fetchOrders();
      // ensure contracts map is fresh after changes
      await loadContractsMap();
    } finally {
      setSavingWf(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Gestión de Órdenes</h2>
        <div className="flex items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente/email" className="px-3 py-2 border rounded-full" />
          <button onClick={autoLinkOrders} className={`px-3 py-2 border rounded-none ${linking? 'opacity-60': ''}`}>{linking? 'Vinculando...':'Vincular órdenes'}</button>
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
            const wf = (o.workflow && o.workflow.length) ? o.workflow : [];
            const segments = wf.map(cat => {
              const total = cat.tasks.length || 1;
              const done = cat.tasks.filter(t => t.done).length;
              return total === 0 ? 0 : Math.round((done/total)*100);
            });
            const cols = colorsFor(wf.length);
            return (
              <div key={o.id} className="grid grid-cols-12 p-3 items-center hover:bg-gray-50 cursor-pointer" onClick={() => openWorkflow(o)}>
                <div className="col-span-3 lowercase first-letter:uppercase">{o.customer_name || 'cliente'}</div>
                <div className="col-span-2 text-sm text-gray-600">{o.created_at ? new Date(o.created_at).toLocaleDateString() + ', ' + new Date(o.created_at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : ''}</div>
                <div className="col-span-1 font-semibold">R${Number(o.total || o.totalAmount || 0).toFixed(0)}</div>
                <div className="col-span-3">
                  <div className="w-full h-3 rounded bg-gray-200 overflow-hidden flex">
                    {segments.map((p, i) => (
                      <div key={i} className="relative flex-1 bg-gray-200">
                        <div className="absolute inset-y-0 left-0" style={{ width: `${p}%`, backgroundColor: cols[i] }} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="col-span-1 text-right">
                  {/* thumbnail */}
                  { (o as any).thumbnail ? (
                    <img src={(o as any).thumbnail} alt="thumb" className="w-12 h-8 object-cover rounded ml-auto" />
                  ) : (
                    // if no thumbnail, try to use first item image_url
                    (Array.isArray(o.items) && (o.items as any[])[0] && (o.items as any[])[0].image_url) ? (
                      <img src={(o.items as any[])[0].image_url} alt="thumb" className="w-12 h-8 object-cover rounded ml-auto" />
                    ) : null
                  )}
                </div>
                <div className="col-span-2 text-right">
                  {/* Row opens modal on click; actions removed */}
                </div>
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
                                <input type="checkbox" checked={t.done} onChange={async (e)=>{
                                  const checked = e.target.checked;
                                  if (!workflow || !viewing) return;
                                  const updated = workflow.map((c, ci2) => ci2===ci ? { ...c, tasks: c.tasks.map((x, ti2)=> ti2===ti ? { ...x, done: checked } : x) } : c);
                                  setWorkflow(updated);
                                  try {
                                    const isVirtual = String(viewing.id || '').startsWith('contract-');
                                    if (isVirtual) {
                                      const contractId = viewing.contractId || String(viewing.id || '').replace(/^contract-/, '');
                                      if (contractId) {
                                        const cRef = doc(db, 'contracts', contractId);
                                        const cSnap = await getDoc(cRef);
                                        if (cSnap.exists()) {
                                          const contract = { id: cSnap.id, ...(cSnap.data() as any) } as any;
                                          const base = (contract.workflow && contract.workflow.length) ? contract.workflow : [];
                                          const items = getDisplayItems(viewing as OrderItem);
                                          const names = items.map(it => String(it.name || it.product_id || it.productId || ''));
                                          const merged = ensureDeliveryTasks(base, names);
                                          const ordDeliveryCat = updated.find(cu => normalize(cu.name).includes('entrega'));
                                          if (ordDeliveryCat) {
                                            merged.forEach(cat => {
                                              if (normalize(cat.name).includes('entrega')) {
                                                cat.tasks = cat.tasks.map(t => {
                                                  const match = ordDeliveryCat.tasks.find(ot => normalize(ot.title) === normalize(t.title));
                                                  return match ? { ...t, done: !!match.done } : t;
                                                });
                                              }
                                            });
                                          }
                                          await updateDoc(cRef, { workflow: merged } as any);
                                        }
                                      }
                                    } else {
                                      await updateDoc(doc(db, 'orders', viewing.id), { workflow: updated } as any);
                                      let targetContractId = viewing.contractId || null;
                                      if (!targetContractId && viewing.customer_email) {
                                        const key = String(viewing.customer_email).toLowerCase().trim();
                                        const matched = contractsByEmail[key] || Object.values(contractsMap).find((x: any) => String((x.clientEmail || x.client_email || '')).toLowerCase().trim() === key) || null;
                                        if (matched) targetContractId = matched.id;
                                      }
                                      if (targetContractId) {
                                        const cRef = doc(db, 'contracts', targetContractId);
                                        const cSnap = await getDoc(cRef);
                                        if (cSnap.exists()) {
                                          const contract = { id: cSnap.id, ...(cSnap.data() as any) } as any;
                                          const base = (contract.workflow && contract.workflow.length) ? contract.workflow : [];
                                          const items = getDisplayItems(viewing as OrderItem);
                                          const names = items.map(it => String(it.name || it.product_id || it.productId || ''));
                                          const merged = ensureDeliveryTasks(base, names);
                                          const ordDeliveryCat = updated.find(cu => normalize(cu.name).includes('entrega'));
                                          if (ordDeliveryCat) {
                                            merged.forEach(cat => {
                                              if (normalize(cat.name).includes('entrega')) {
                                                cat.tasks = cat.tasks.map(t => {
                                                  const match = ordDeliveryCat.tasks.find(ot => normalize(ot.title) === normalize(t.title));
                                                  return match ? { ...t, done: !!match.done } : t;
                                                });
                                              }
                                            });
                                          }
                                          await updateDoc(cRef, { workflow: merged } as any);
                                        }
                                      }
                                    }
                                  } catch (err) {
                                    console.warn('Error persisting workflow change', err);
                                  }
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
                  <div><span className="text-gray-600">Total:</span> <span className="font-medium">R${Number(viewing.total || 0).toFixed(0)}</span></div>
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
                        </tr>
                      </thead>
                      <tbody>
                        {getDisplayItems(viewing).map((it, idx) => {
                          const qty = Number(it.qty ?? it.quantity ?? 1);
                          const price = Number(it.price ?? 0);
                          // removed per-row total as requested
                          return (
                            <tr key={idx} className="border-t">
                              <td className="py-1">
                                <div className="flex items-center gap-3">
                                  { (() => {
                                    const imgSrc = resolveImageForItem(it);
                                    if (imgSrc) return (<img src={imgSrc} alt={String(it.name||'product')} className="w-12 h-12 object-cover rounded" />);
                                    return (<div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-500">No img</div>);
                                  })() }
                                  <div className="truncate">{it.name || it.product_id || it.productId || '—'}</div>
                                </div>
                              </td>
                              <td className="py-1">{qty}</td>
                              <td className="py-1">R${price.toFixed(0)}</td>
                            </tr>
                          );
                        })}
                        {getDisplayItems(viewing).length === 0 && (
                          <tr className="border-t"><td className="py-2 text-gray-500" colSpan={3}>Sin productos</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary: total products, deposit, remaining */}
                  {
                    (() => {
                      const contract = viewing && viewing.contractId ? contractsMap[viewing.contractId] : null;
                      // compute store total: prefer contract.storeItems if available
                      let storeTotal = 0;
                      if (contract && Array.isArray(contract.storeItems) && contract.storeItems.length > 0) {
                        storeTotal = contract.storeItems.reduce((s: number, it: any) => s + (Number(it.price ?? 0) * Number(it.quantity ?? it.qty ?? 1)), 0);
                      } else if (viewing) {
                        // fallback to summing displayed items
                        const disp = getDisplayItems(viewing);
                        storeTotal = disp.reduce((s, it: any) => s + (Number(it.total ?? (it.price ?? 0) * (it.qty ?? it.quantity ?? 1)) ), 0);
                      }

                      const depositAmount = Math.round((storeTotal * 0.5) * 100) / 100; // 50% of store items
                      // show restante as subtotal - deposito (always)
                      const remaining = Math.max(0, storeTotal - depositAmount);
                      const depositPaid = Boolean(contract && contract.depositPaid) || Boolean((viewing as any)?.depositPaid);

                      return (
                        <div className="mt-4 p-4 border-t">
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <div className="text-sm text-gray-600">Subtotal productos:</div>
                              <div className="text-lg font-semibold text-red-600">R${storeTotal.toFixed(2)}</div>
                            </div>

                            <div className="flex items-center justify-between">
                              <div className="text-sm font-medium text-green-600">Depósito (50%):</div>
                              <div className="text-sm font-medium text-green-600">R${depositAmount.toFixed(2)} {depositPaid ? <span className="ml-2 text-sm text-green-700">(Pagado)</span> : <span className="ml-2 text-sm text-gray-500">(No pagado)</span>}</div>
                            </div>

                            <div className="flex items-center justify-between">
                              <div className="text-sm text-gray-600">Restante</div>
                              <div className="flex items-center gap-3">
                                <div className={`text-sm font-medium ${depositPaid ? 'text-green-600' : 'text-red-600'}`}>R${remaining.toFixed(2)}</div>
                                <button onClick={markDeliveryPaid} disabled={savingWf} className="px-2 py-1 border rounded bg-green-600 text-white text-sm">{savingWf ? 'Procesando...' : 'Pagado'}</button>
                                <button onClick={resetDeliveryPaid} disabled={savingWf} className="px-2 py-1 border rounded text-sm">Reiniciar</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  }

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
