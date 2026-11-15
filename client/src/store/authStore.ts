import { create } from 'zustand';
import { User } from 'firebase/auth';

interface AuthState {
    user: User | null;
    userRole: 'client' | 'vendor' | 'admin' | null;
    realRole: 'client' | 'vendor' | 'admin' | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    /** Browsing without an account (feed, vendors, map). Personal features ask to sign in. */
    isGuest: boolean;
    /** Which auth screen to open when a guest chooses to sign in */
    authEntry: 'Login' | 'Register';
    setUser: (user: User | null) => void;
    setUserRole: (role: 'client' | 'vendor' | 'admin' | null) => void;
    setRealRole: (role: 'client' | 'vendor' | 'admin' | null) => void;
    switchViewRole: (role: 'client' | 'vendor' | 'admin') => void;
    setLoading: (loading: boolean) => void;
    enterGuestMode: () => void;
    /** Leave guest mode and show the sign-in (or register) screen */
    requestSignIn: (entry?: 'Login' | 'Register') => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    userRole: null,
    realRole: null,
    isAuthenticated: false,
    isLoading: true,
    isGuest: false,
    authEntry: 'Login',
    setUser: (user) => set({ user, isAuthenticated: !!user, ...(user ? { isGuest: false } : {}) }),
    setUserRole: (role) => set({ userRole: role }),
    setRealRole: (role) => set({ realRole: role, userRole: role }),
    switchViewRole: (role) => set({ userRole: role }),
    setLoading: (loading) => set({ isLoading: loading }),
    enterGuestMode: () => set({ isGuest: true }),
    requestSignIn: (entry = 'Login') => set({ isGuest: false, authEntry: entry }),
    logout: () => set({ user: null, userRole: null, realRole: null, isAuthenticated: false, isGuest: false }),
}));
