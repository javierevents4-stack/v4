import { db } from './firebaseClient';
import { collection, getDocs, updateDoc, doc, addDoc, orderBy, query } from 'firebase/firestore';

export interface Review {
  id?: string;
  name: string;
  event?: string;
  text: string;
  rating?: number;
  image?: string;
  created_at?: string;
}

export const fetchReviews = async (): Promise<Review[]> => {
  try {
    const col = collection(db, 'reviews');
    const q = query(col, orderBy('created_at', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Review));
  } catch (e) {
    console.warn('fetchReviews failed', e);
    return [];
  }
};

export const updateReview = async (id: string, updates: Partial<Review>) => {
  try {
    await updateDoc(doc(db, 'reviews', id), updates as any);
    return true;
  } catch (e) {
    console.error('updateReview failed', e);
    throw e;
  }
};

export const createReview = async (payload: Omit<Review, 'id'>) => {
  try {
    const created = await addDoc(collection(db, 'reviews'), { ...payload, created_at: new Date().toISOString() });
    return { id: created.id, ...payload } as Review;
  } catch (e) {
    console.error('createReview failed', e);
    throw e;
  }
};
