import axios from 'axios';
import Constants from 'expo-constants';
import { auth } from '../config/firebase';

// ============================================================
// PRODUCTION API URL — Connected to live Render backend
// ============================================================
const PRODUCTION_API_URL = 'https://qiirapointer.onrender.com/api';

// Auto-detect server IP from Expo packager connection
const getApiUrl = () => {
    // Production builds always use the cloud API
    if (typeof __DEV__ !== 'undefined' && !__DEV__) {
        return PRODUCTION_API_URL;
    }

    // Development: auto-detect local server
    if (typeof window !== 'undefined' && window.location && window.location.hostname) {
        return `http://${window.location.hostname}:5000/api`;
    }
    const hostUri = Constants.expoConfig?.hostUri 
        || (Constants as any).manifest?.debuggerHost 
        || (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;

    if (hostUri && !hostUri.includes('exp.direct') && !hostUri.includes('ngrok')) {
        const ip = hostUri.split(':')[0];
        return `http://${ip}:5000/api`;
    }
    return 'http://192.168.1.183:5000/api';
};

export const API_URL = getApiUrl();
console.log('📡 API Base URL configured to:', API_URL);

// Create axios instance
const api = axios.create({
    baseURL: API_URL,
    timeout: 30000, // 30 second timeout
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add auth token to requests
api.interceptors.request.use(
    async (config) => {
        const user = auth.currentUser;
        if (user) {
            const token = await user.getIdToken();
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor for error handling
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Handle unauthorized - logout user
            console.log('Unauthorized - logging out');
        }
        return Promise.reject(error);
    }
);

export default api;

// API Helper functions
export const authAPI = {
    register: (data: any) => api.post('/auth/register', data),
    login: (idToken: string) => api.post('/auth/login', { idToken }),
    oauth: (data: { idToken: string; provider: string; role?: string; fullName?: string; email?: string; photoURL?: string }) =>
        api.post('/auth/oauth', data),
    getUser: (uid: string) => api.get(`/auth/user/${uid}`),
    updateProfile: (uid: string, data: any) => api.put(`/auth/user/${uid}`, data),
    changePassword: (data: { newPassword: string; currentPassword?: string; uid?: string }) =>
        api.post('/auth/change-password', data),
};

export const vendorAPI = {
    getAll: (params?: any) => api.get('/vendors', { params }),
    getById: (id: string) => api.get(`/vendors/${id}`),
    getReviews: (id: string) => api.get(`/vendors/${id}/reviews`),
    addReview: (vendorId: string, data: any) =>
        api.post(`/clients/${data.clientId || data.userId || 'anonymous'}/reviews`, { vendorId, ...data }),
    updateProfile: (id: string, data: any) => api.put(`/vendors/${id}/profile`, data),
    uploadDocuments: (id: string, documentUrls: string[]) =>
        api.post(`/vendors/${id}/documents`, { documentUrls }),
    processPayment: (id: string, paymentData: any) =>
        api.post(`/vendors/${id}/payment`, paymentData),
    // Verified Badge APIs
    getBadgeInfo: () => api.get('/vendors/badge/info'),
    getBadgeStatus: (id: string) => api.get(`/vendors/${id}/badge`),
    purchaseBadge: (id: string, paymentReference?: string) =>
        api.post(`/vendors/${id}/badge/purchase`, { paymentReference }),
    // Menu/Document PDFs
    getDocuments: (id: string) => api.get(`/vendors/${id}/documents`),
    addDocument: (id: string, data: { title: string; url: string; fileType?: string; fileSize?: number }) =>
        api.post(`/vendors/${id}/documents`, data),
    removeDocument: (id: string, docId: string) =>
        api.delete(`/vendors/${id}/documents/${docId}`),
    // Location toggle
    updateLocation: (id: string, data: { useLiveLocation: boolean; liveLatitude?: number; liveLongitude?: number }) =>
        api.put(`/vendors/${id}/location`, data),
};

export const clientAPI = {
    submitReview: (clientId: string, reviewData: any) =>
        api.post(`/clients/${clientId}/reviews`, reviewData),
    getFavorites: (clientId: string) => api.get(`/clients/${clientId}/favorites`),
    addFavorite: (clientId: string, vendorId: string) =>
        api.post(`/clients/${clientId}/favorites`, { vendorId }),
    removeFavorite: (clientId: string, vendorId: string) =>
        api.delete(`/clients/${clientId}/favorites/${vendorId}`),

};

export const adminAPI = {
    getPendingVendors: () => api.get('/admin/vendors/pending'),
    verifyVendor: (id: string, status: 'approved' | 'rejected', rejectionReason?: string) =>
        api.put(`/admin/vendors/${id}/verify`, { status, rejectionReason }),
    getAnalytics: () => api.get('/admin/analytics'),
    deleteUser: (id: string) => api.delete(`/admin/users/${id}`),
    createVendor: (data: any) => api.post('/admin/vendors/create', data),
    getUsers: () => api.get('/admin/users'),
    getReviews: () => api.get('/admin/reviews'),
    suspendUser: (id: string, suspended: boolean) =>
        api.put(`/admin/users/${id}/suspend`, { suspended }),
    setUserVerified: (userId: string, isVerified: boolean) =>
        api.put(`/admin/users/${userId}/verified`, { isVerified }),
};

export const chatAPI = {
    getConversations: (userId: string) => api.get(`/chats/conversations/${userId}`),
    getMessages: (conversationId: string) => api.get(`/chats/conversations/${conversationId}/messages`),
    sendMessage: (data: {
        conversationId?: string;
        senderId: string;
        receiverId: string;
        text: string;
        receiverName: string;
        receiverImage?: string;
        senderImage?: string;
    }) => api.post('/chats/messages', data),
};

export const postAPI = {
    getFeed: (params?: { type?: string; category?: string; limit?: number; userId?: string }) =>
        api.get('/posts/feed', { params }),
    getReels: (userId?: string) =>
        api.get('/posts/reels', { params: { userId } }),
    getVendorPosts: (vendorId: string, userId?: string) =>
        api.get(`/posts/vendor/${vendorId}`, { params: { userId } }),
    getPost: (id: string, userId?: string) =>
        api.get(`/posts/${id}`, { params: { userId } }),
    createPost: (data: {
        vendorId: string;
        type?: 'post' | 'reel';
        caption: string;
        mediaUrl: string;
        mediaUrls?: string[];
        thumbnailUrl?: string;
        price?: number;
        currency?: string;
        category?: string;
        tags?: string[] | string;
    }) => api.post('/posts', data),
    likePost: (id: string, userId: string) =>
        api.post(`/posts/${id}/like`, { userId }),
    getComments: (id: string) =>
        api.get(`/posts/${id}/comments`),
    addComment: (id: string, data: { userId: string; userName: string; userAvatar?: string; text: string }) =>
        api.post(`/posts/${id}/comments`, data),
    deletePost: (id: string, params?: { userId?: string; role?: string }) =>
        api.delete(`/posts/${id}`, { data: params, params }),
};

export const cartAPI = {
    getCart: (userId: string) =>
        api.get(`/cart/${userId}`),
    addItem: (userId: string, item: any) =>
        api.post(`/cart/${userId}/add`, item),
    updateQuantity: (userId: string, itemId: string, quantity: number) =>
        api.put(`/cart/${userId}/item/${itemId}`, { quantity }),
    removeItem: (userId: string, itemId: string) =>
        api.delete(`/cart/${userId}/item/${itemId}`),
    clearCart: (userId: string) =>
        api.delete(`/cart/${userId}/clear`),
};

export const callAPI = {
    initiateCall: (data: {
        callerId: string;
        callerName: string;
        callerAvatar?: string;
        receiverId: string;
        receiverName: string;
        receiverAvatar?: string;
        callType?: 'voice' | 'video';
    }) => api.post('/calls/initiate', data),
    checkIncomingCall: (userId: string) =>
        api.get(`/calls/incoming/${userId}`),
    getCallStatus: (callId: string) =>
        api.get(`/calls/${callId}/status`),
    answerCall: (callId: string) =>
        api.post(`/calls/${callId}/answer`),
    rejectCall: (callId: string) =>
        api.post(`/calls/${callId}/reject`),
    endCall: (callId: string, durationSeconds?: number) =>
        api.post(`/calls/${callId}/end`, { durationSeconds }),
    getHistory: (userId: string) =>
        api.get(`/calls/history/${userId}`),
};
