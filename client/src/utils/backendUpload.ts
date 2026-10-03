import * as FileSystem from 'expo-file-system/legacy';
import { API_URL } from '../services/api';
import { auth } from '../config/firebase';

// Build JSON headers including the Firebase ID token (required by secured upload endpoints)
const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const user = auth.currentUser;
    if (user) {
        const token = await user.getIdToken();
        headers.Authorization = `Bearer ${token}`;
    }
    return headers;
};

const resolveUserId = (userId?: string) => userId || auth.currentUser?.uid || '';

// Helper: Upload image via backend API (temporary, testing without Firebase Storage)
export const uploadImageViaBackend = async (uri: string, imageType: 'profile' | 'banner' | string, userId?: string): Promise<string> => {
    let base64 = '';

    if (uri.startsWith('data:image')) {
        // Already a base64 data URI from web picker
        console.log('[Upload] Received data URI from web.');
        // We need just the base64 part for the payload, actually the payload expects data:image/...
        // But our backend upload logic uses `imageData.replace(/^data:image\/\w+;base64,/, '');`
        // So we can just pass the full URI.
        const response = await fetch(`${API_URL}/vendors/upload-image`, {
            method: 'POST',
            headers: await getAuthHeaders(),
            body: JSON.stringify({
                imageData: uri,
                imageType,
                userId: resolveUserId(userId)
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Upload failed');
        }

        const data = await response.json();
        console.log('[Upload] Success! URL:', data.imageUrl);
        return data.imageUrl;
    }

    if (uri.startsWith('blob:')) {
        // Blob URI from web picker
        console.log('[Upload] Received blob URI from web, converting to base64...');
        const blob = await fetch(uri).then(r => r.blob());
        base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                resolve(result.split(',')[1]); // get just the base64 part
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } else {
        // Native file URI
        console.log('[Upload] Reading file as Base64:', uri.substring(0, 50) + '...');
        base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    }

    console.log('[Upload] Base64 read. Length:', base64.length);

    const dataURI = `data:image/jpeg;base64,${base64}`;

    // If no userId is provided, fallback to a default 'temp' folder or similar (but backend requires userId)
    // We will ensure userId is passed from the callers.
    const payload = {
        imageData: dataURI,
        imageType,
        userId: resolveUserId(userId)
    };

    console.log('[Upload] Sending to backend API...');
    const response = await fetch(`${API_URL}/vendors/upload-image`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
    }

    const data = await response.json();
    console.log('[Upload] Success! URL:', data.imageUrl);
    return data.imageUrl;
};

// Helper: Upload document (PDF) via backend API
export const uploadDocumentViaBackend = async (
    uri: string,
    fileName: string,
    userId?: string,
    mimeType: string = 'application/pdf'
): Promise<{ fileUrl: string; fileName: string; fileSize: number }> => {
    let base64 = '';

    if (uri.startsWith('data:')) {
        // Already a base64 data URI
        console.log('[Upload Doc] Received data URI.');
        const response = await fetch(`${API_URL}/vendors/upload-document`, {
            method: 'POST',
            headers: await getAuthHeaders(),
            body: JSON.stringify({
                fileData: uri,
                fileName,
                fileType: mimeType,
                userId: resolveUserId(userId)
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Document upload failed');
        }

        const data = await response.json();
        return data;
    }

    if (uri.startsWith('blob:')) {
        // Blob URI from web picker
        console.log('[Upload Doc] Received blob URI from web, converting to base64...');
        const blob = await fetch(uri).then(r => r.blob());
        base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                resolve(result.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } else {
        // Native file URI
        console.log('[Upload Doc] Reading file as Base64:', uri.substring(0, 50) + '...');
        base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    }

    const dataURI = `data:${mimeType};base64,${base64}`;

    const payload = {
        fileData: dataURI,
        fileName,
        fileType: mimeType,
        userId: resolveUserId(userId)
    };

    console.log('[Upload Doc] Sending document to backend API...');
    const response = await fetch(`${API_URL}/vendors/upload-document`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Document upload failed');
    }

    const data = await response.json();
    console.log('[Upload Doc] Success! File URL:', data.fileUrl);
    return data;
};

