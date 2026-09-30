import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cartAPI } from '../services/api';

export interface CartItem {
    id: string;
    postId?: string;
    title: string;
    caption?: string;
    mediaUrl: string;
    price: number;
    currency?: string;
    vendorId: string;
    vendorName: string;
    quantity: number;
    addedAt?: string;
}

interface CartState {
    items: CartItem[];
    totalItems: number;
    subtotal: number;
    currency: string;
    loading: boolean;
    loadLocalCart: () => Promise<void>;
    fetchCart: (userId: string) => Promise<void>;
    addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }, userId?: string) => Promise<void>;
    updateQuantity: (itemId: string, quantity: number, userId?: string) => Promise<void>;
    removeItem: (itemId: string, userId?: string) => Promise<void>;
    clearCart: (userId?: string) => Promise<void>;
    isInCart: (itemId: string) => boolean;
}

const STORAGE_KEY = '@qiirapointer_cart';

const calculateTotals = (items: CartItem[]) => {
    const totalItems = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const subtotal = items.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
    return { totalItems, subtotal };
};

export const useCartStore = create<CartState>((set, get) => ({
    items: [],
    totalItems: 0,
    subtotal: 0,
    currency: 'NGN',
    loading: false,

    loadLocalCart: async () => {
        try {
            const json = await AsyncStorage.getItem(STORAGE_KEY);
            if (json) {
                const items: CartItem[] = JSON.parse(json);
                const { totalItems, subtotal } = calculateTotals(items);
                set({ items, totalItems, subtotal });
            }
        } catch (e) {
            console.warn('Failed to load local cart:', e);
        }
    },

    fetchCart: async (userId: string) => {
        if (!userId) return;
        set({ loading: true });
        try {
            const response = await cartAPI.getCart(userId);
            const items: CartItem[] = response.data.items || [];
            const { totalItems, subtotal } = calculateTotals(items);
            set({ items, totalItems, subtotal, currency: response.data.currency || 'NGN' });
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch (e) {
            console.warn('Failed to fetch server cart, using local:', e);
            await get().loadLocalCart();
        } finally {
            set({ loading: false });
        }
    },

    addItem: async (itemData, userId) => {
        const { items } = get();
        const existingIndex = items.findIndex((i) => i.id === itemData.id);
        let updatedItems: CartItem[] = [];

        if (existingIndex > -1) {
            updatedItems = items.map((it, idx) =>
                idx === existingIndex ? { ...it, quantity: it.quantity + (itemData.quantity || 1) } : it
            );
        } else {
            const newItem: CartItem = {
                ...itemData,
                quantity: itemData.quantity || 1,
                currency: itemData.currency || 'NGN',
                addedAt: new Date().toISOString(),
            };
            updatedItems = [newItem, ...items];
        }

        const { totalItems, subtotal } = calculateTotals(updatedItems);
        set({ items: updatedItems, totalItems, subtotal });

        try {
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedItems));
            if (userId) {
                await cartAPI.addItem(userId, {
                    ...itemData,
                    quantity: itemData.quantity || 1,
                });
            }
        } catch (e) {
            console.warn('Failed to sync added item with backend:', e);
        }
    },

    updateQuantity: async (itemId, quantity, userId) => {
        const { items } = get();
        let updatedItems: CartItem[] = [];

        if (quantity <= 0) {
            updatedItems = items.filter((i) => i.id !== itemId);
        } else {
            updatedItems = items.map((i) => (i.id === itemId ? { ...i, quantity } : i));
        }

        const { totalItems, subtotal } = calculateTotals(updatedItems);
        set({ items: updatedItems, totalItems, subtotal });

        try {
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedItems));
            if (userId) {
                await cartAPI.updateQuantity(userId, itemId, quantity);
            }
        } catch (e) {
            console.warn('Failed to sync updated quantity with backend:', e);
        }
    },

    removeItem: async (itemId, userId) => {
        const { items } = get();
        const updatedItems = items.filter((i) => i.id !== itemId);
        const { totalItems, subtotal } = calculateTotals(updatedItems);
        set({ items: updatedItems, totalItems, subtotal });

        try {
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedItems));
            if (userId) {
                await cartAPI.removeItem(userId, itemId);
            }
        } catch (e) {
            console.warn('Failed to sync removed item with backend:', e);
        }
    },

    clearCart: async (userId) => {
        set({ items: [], totalItems: 0, subtotal: 0 });
        try {
            await AsyncStorage.removeItem(STORAGE_KEY);
            if (userId) {
                await cartAPI.clearCart(userId);
            }
        } catch (e) {
            console.warn('Failed to sync clear cart with backend:', e);
        }
    },

    isInCart: (itemId) => {
        return get().items.some((i) => i.id === itemId);
    },
}));
