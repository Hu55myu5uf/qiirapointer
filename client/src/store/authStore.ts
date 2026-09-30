import { create } from 'zustand';
import { User } from 'firebase/auth';

interface AuthState {
    user: User | null;
    userRole: 'client' | 'vendor' | 'admin' | null;
    realRole: 'client' | 'vendor' | 'admin' | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    setUser: (user: User | null) => void;
    setUserRole: (role: 'client' | 'vendor' | 'admin' | null) => void;
    setRealRole: (role: 'client' | 'vendor' | 'admin' | null) => void;
    switchViewRole: (role: 'client' | 'vendor' | 'admin') => void;
    setLoading: (loading: boolean) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    userRole: null,
    realRole: null,
    isAuthenticated: false,
    isLoading: true,
    setUser: (user) => set({ user, isAuthenticated: !!user }),
    setUserRole: (role) => set({ userRole: role }),
    setRealRole: (role) => set({ realRole: role, userRole: role }),
    switchViewRole: (role) => set({ userRole: role }),
    setLoading: (loading) => set({ isLoading: loading }),
    logout: () => set({ user: null, userRole: null, realRole: null, isAuthenticated: false }),
}));
