import { db } from './firebaseClient';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy
} from 'firebase/firestore';
import { db } from './firebaseClient';

export type PackageType = 'portrait' | 'maternity' | 'events';

export interface DBPackage {
  id: string;
  type: PackageType;
  title: string;
  price: number; // BRL value
  duration: string;
  description: string;
  features: string[];
  image_url: string;
  category?: string; // e.g., 'wedding', 'prewedding'
  created_at?: string;
  active?: boolean;
}

const dedupePackages = (items: DBPackage[]): DBPackage[] => {
  const byKey = new Map<string, DBPackage>();
  for (const p of items) {
    const key = `${p.type}|${String(p.title || '').trim().toLowerCase()}|${Number((p as any).price) || 0}|${String(p.duration || '').trim().toLowerCase()}`;
    if (!byKey.has(key)) byKey.set(key, p);
  }
  return Array.from(byKey.values());
};

export const fetchPackages = async (type?: PackageType): Promise<DBPackage[]> => {
  const col = collection(db, 'packages');
  let q = type ? query(col, where('type', '==', type), orderBy('created_at', 'desc')) : query(col, orderBy('created_at', 'desc'));
  try {
    const snap = await getDocs(q);
    const arr = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<DBPackage, 'id'>) }));
    return dedupePackages(arr);
  } catch (e: any) {
    const msg = String(e?.message || '');
    const code = String(e?.code || '');
    const needsIndex = code === 'failed-precondition' || msg.toLowerCase().includes('requires an index');
    if (needsIndex) {
      try {
        const q2 = type ? query(col, where('type', '==', type)) : query(col);
        const snap2 = await getDocs(q2);
        const arr2 = snap2.docs.map(d => ({ id: d.id, ...(d.data() as Omit<DBPackage, 'id'>) }));
        return dedupePackages(arr2);
      } catch (e2) {
        console.warn('fetchPackages fallback failed', e2);
        return [];
      }
    }
    console.warn('fetchPackages (firebase) failed, returning []', e);
    return [];
  }
};

export const createPackage = async (pkg: Omit<DBPackage, 'id' | 'created_at'>) => {
  try {
    await addDoc(collection(db, 'packages'), { active: true, ...pkg, created_at: new Date().toISOString() });
  } catch (e) {
    console.error('createPackage (firebase) failed', e);
    throw e;
  }
};

export const updatePackage = async (id: string, updates: Partial<DBPackage>) => {
  try {
    await updateDoc(doc(db, 'packages', id), updates);
  } catch (e) {
    console.error('updatePackage (firebase) failed', e);
    throw e;
  }
};

export const deletePackage = async (id: string) => {
  try {
    await deleteDoc(doc(db, 'packages', id));
  } catch (e) {
    console.error('deletePackage (firebase) failed', e);
    throw e;
  }
};
