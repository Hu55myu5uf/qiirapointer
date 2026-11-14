import supabase from '../config/supabase';
import * as fs from 'fs';
import * as path from 'path';

export const QIIRA_STORAGE_BUCKET = 'qiira-uploads';

let bucketChecked = false;

/**
 * Ensure that the Supabase public storage bucket exists.
 */
export async function ensureStorageBucket(): Promise<void> {
    if (bucketChecked) return;
    try {
        const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
        if (listErr) {
            console.warn('⚠️ Supabase listBuckets notice:', listErr.message);
            return;
        }

        const found = buckets?.some(b => b.name === QIIRA_STORAGE_BUCKET);
        if (!found) {
            console.log(`📦 Creating Supabase storage bucket '${QIIRA_STORAGE_BUCKET}'...`);
            const { error: createErr } = await supabase.storage.createBucket(QIIRA_STORAGE_BUCKET, {
                public: true,
                fileSizeLimit: '50MB'
            });
            if (createErr && !createErr.message.includes('already exists')) {
                console.warn('⚠️ Failed to create Supabase storage bucket:', createErr.message);
            } else {
                console.log(`✅ Supabase bucket '${QIIRA_STORAGE_BUCKET}' ready`);
            }
        }
        bucketChecked = true;
    } catch (err: any) {
        console.warn('⚠️ Supabase storage check error:', err.message);
    }
}

export interface UploadResult {
    url: string;
    path: string;
    size: number;
    contentType: string;
}

/**
 * Upload a raw Buffer to Supabase Storage with local disk fallback if offline.
 */
export async function uploadBufferToStorage(options: {
    folder: string;
    filename: string;
    buffer: Buffer;
    contentType: string;
    reqHost?: string;
    protocol?: string;
}): Promise<UploadResult> {
    const { folder, filename, buffer, contentType, reqHost = 'localhost:5000', protocol = 'http' } = options;

    await ensureStorageBucket();

    // Clean folder and filename
    const cleanFolder = folder.replace(/[^a-zA-Z0-9_\-\/]/g, '').replace(/^\/+|\/+$/g, '');
    const cleanFilename = filename.replace(/[^a-zA-Z0-9_.\-]/g, '_');
    const storagePath = `${cleanFolder}/${cleanFilename}`;

    try {
        const { data, error } = await supabase.storage
            .from(QIIRA_STORAGE_BUCKET)
            .upload(storagePath, buffer, {
                contentType,
                upsert: true
            });

        if (error) {
            console.error('⚠️ Supabase storage upload returned error, falling back to disk:', error.message);
            throw error;
        }

        const { data: publicData } = supabase.storage
            .from(QIIRA_STORAGE_BUCKET)
            .getPublicUrl(storagePath);

        return {
            url: publicData.publicUrl,
            path: storagePath,
            size: buffer.length,
            contentType
        };
    } catch (uploadError: any) {
        console.warn('⚠️ Supabase Storage upload failed, saving to local disk fallback:', uploadError.message);

        // Fallback: local disk
        const baseUploadsDir = path.resolve(__dirname, '../../uploads');
        const targetDir = path.resolve(baseUploadsDir, cleanFolder);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        const filepath = path.resolve(targetDir, cleanFilename);
        fs.writeFileSync(filepath, buffer);

        const localUrl = `${protocol}://${reqHost}/uploads/${cleanFolder}/${cleanFilename}`;
        return {
            url: localUrl,
            path: storagePath,
            size: buffer.length,
            contentType
        };
    }
}

/**
 * Upload base64 data string (with or without data: URL prefix) to Supabase Storage.
 */
export async function uploadBase64ToStorage(options: {
    folder: string;
    filenamePrefix: string;
    base64Data: string;
    preferredExtension?: string;
    reqHost?: string;
    protocol?: string;
}): Promise<UploadResult> {
    const { folder, filenamePrefix, base64Data, preferredExtension, reqHost, protocol } = options;

    // Detect mime type from data URI if present
    let contentType = 'application/octet-stream';
    let ext = preferredExtension || '.jpg';

    const mimeMatch = base64Data.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/i);
    if (mimeMatch) {
        contentType = mimeMatch[1].toLowerCase();
        if (contentType.includes('png')) ext = '.png';
        else if (contentType.includes('webp')) ext = '.webp';
        else if (contentType.includes('pdf')) ext = '.pdf';
        else if (contentType.includes('mp4')) ext = '.mp4';
        else if (contentType.includes('quicktime') || contentType.includes('mov')) ext = '.mov';
        else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
    } else if (preferredExtension) {
        ext = preferredExtension.startsWith('.') ? preferredExtension : `.${preferredExtension}`;
        if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        else if (ext === '.png') contentType = 'image/png';
        else if (ext === '.webp') contentType = 'image/webp';
        else if (ext === '.pdf') contentType = 'application/pdf';
        else if (ext === '.mp4') contentType = 'video/mp4';
    }

    const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const safePrefix = filenamePrefix.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safePrefix}_${Date.now()}${ext}`;

    return uploadBufferToStorage({
        folder,
        filename,
        buffer,
        contentType,
        reqHost,
        protocol
    });
}
