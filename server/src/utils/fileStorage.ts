/**
 * Firebase Cloud Storage uploads.
 *
 * - Every upload is decoded from base64 and its REAL type is detected from the file's first bytes
 *   ("magic numbers"). The extension or MIME type the client claims is never trusted.
 * - Public files (profile/banner/post/catalog images, menus, chat attachments) get a Firebase
 *   download-token URL that works directly in the app.
 * - Private files (identity documents for verification) get NO public URL. The database stores a
 *   reference like "private:kyc/<uid>/<file>", and only admins receive a short-lived signed link.
 */
import crypto from 'crypto';
import { storage } from '../config/firebase';

export type FileKind = 'image' | 'video' | 'pdf' | 'word';

export const MAX_BYTES: Record<FileKind, number> = {
    image: 10 * 1024 * 1024,  // 10 MB
    video: 20 * 1024 * 1024,  // 20 MB (base64 bodies are capped at 30 MB)
    pdf: 10 * 1024 * 1024,
    word: 10 * 1024 * 1024,
};

const PRIVATE_PREFIX = 'private:';

export class UploadError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}

interface Detected { kind: FileKind; mime: string; ext: string }

/** Identify a file from its leading bytes. Returns null for anything not on the allow-list. */
export function detectFileType(buf: Buffer): Detected | null {
    if (buf.length < 12) return null;
    const ascii = (start: number, end: number) => buf.subarray(start, end).toString('latin1');

    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: 'image', mime: 'image/jpeg', ext: '.jpg' };
    if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: 'image', mime: 'image/png', ext: '.png' };
    if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { kind: 'image', mime: 'image/webp', ext: '.webp' };
    if (ascii(0, 5) === '%PDF-') return { kind: 'pdf', mime: 'application/pdf', ext: '.pdf' };

    // ISO base media (MP4 / MOV / HEIC): "ftyp" box at offset 4, brand at 8
    if (ascii(4, 8) === 'ftyp') {
        const brand = ascii(8, 12);
        if (['heic', 'heix', 'hevc', 'mif1', 'msf1', 'avif'].includes(brand)) {
            return { kind: 'image', mime: brand === 'avif' ? 'image/avif' : 'image/heic', ext: brand === 'avif' ? '.avif' : '.heic' };
        }
        if (brand === 'qt  ') return { kind: 'video', mime: 'video/quicktime', ext: '.mov' };
        return { kind: 'video', mime: 'video/mp4', ext: '.mp4' };
    }

    // Legacy Word (.doc, OLE2) and Word .docx (a ZIP containing word/document.xml)
    if (buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) {
        return { kind: 'word', mime: 'application/msword', ext: '.doc' };
    }
    if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04 && buf.includes(Buffer.from('word/'))) {
        return { kind: 'word', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: '.docx' };
    }
    return null;
}

/** Decode a base64 string (with or without a data: prefix) and validate type + size. */
export function decodeUpload(base64Data: unknown, allowed: FileKind[]): { buffer: Buffer } & Detected {
    if (typeof base64Data !== 'string' || base64Data.length === 0) {
        throw new UploadError('No file data received');
    }
    const clean = base64Data.replace(/^data:[^;,]*;base64,/, '');
    const buffer = Buffer.from(clean, 'base64');
    if (buffer.length === 0) throw new UploadError('The file is empty or not valid base64');

    const detected = detectFileType(buffer);
    if (!detected || !allowed.includes(detected.kind)) {
        const names = allowed.map(k => ({ image: 'photos', video: 'videos', pdf: 'PDFs', word: 'Word documents' }[k])).join(', ');
        throw new UploadError(`Unsupported file type. Allowed: ${names}.`, 415);
    }
    if (buffer.length > MAX_BYTES[detected.kind]) {
        throw new UploadError(`File is too large (max ${Math.round(MAX_BYTES[detected.kind] / 1024 / 1024)} MB).`, 413);
    }
    return { buffer, ...detected };
}

const safeSegment = (s: string) => String(s).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128) || 'x';

function bucket() {
    return storage.bucket();
}

/**
 * Upload a validated file. `folder` is a list of path segments (each sanitised).
 * Returns the URL to store: a public download URL, or a "private:<path>" reference.
 */
export async function saveUpload(opts: {
    folder: string[];
    namePrefix: string;
    file: { buffer: Buffer; mime: string; ext: string };
    visibility: 'public' | 'private';
}): Promise<{ url: string; path: string; size: number; contentType: string }> {
    const { folder, namePrefix, file, visibility } = opts;
    const fileName = `${safeSegment(namePrefix)}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${file.ext}`;
    const root = visibility === 'private' ? 'private' : 'public';
    const path = [root, ...folder.map(safeSegment), fileName].join('/');

    const token = crypto.randomUUID();
    await bucket().file(path).save(file.buffer, {
        resumable: false,
        contentType: file.mime,
        metadata: {
            cacheControl: visibility === 'public' ? 'public, max-age=31536000' : 'private, no-store',
            // Download tokens are only issued for public files
            metadata: visibility === 'public' ? { firebaseStorageDownloadTokens: token } : {},
        },
    });

    const url = visibility === 'public'
        ? `https://firebasestorage.googleapis.com/v0/b/${bucket().name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`
        : `${PRIVATE_PREFIX}${path}`;
    return { url, path, size: file.buffer.length, contentType: file.mime };
}

export const isPrivateRef = (v: unknown): boolean => typeof v === 'string' && v.startsWith(PRIVATE_PREFIX);

/** True if `ref` is a private file uploaded by `uid` under the given area (e.g. "kyc"). */
export function isOwnPrivateRef(ref: unknown, area: string, uid: string): boolean {
    return isPrivateRef(ref) && (ref as string).startsWith(`${PRIVATE_PREFIX}private/${safeSegment(area)}/${safeSegment(uid)}/`);
}

/** Short-lived signed link for a private file (admins only — callers must check). */
export async function signedUrlFor(ref: unknown, minutes = 15): Promise<string | null> {
    if (!isPrivateRef(ref)) return typeof ref === 'string' ? ref : null;
    try {
        const [url] = await bucket().file((ref as string).slice(PRIVATE_PREFIX.length)).getSignedUrl({
            action: 'read',
            expires: Date.now() + minutes * 60 * 1000,
        });
        return url;
    } catch (e: any) {
        console.warn('Signed URL error:', e.message);
        return null;
    }
}

/** Storage path for one of our own URLs/refs, or null for external links. */
export function storagePathOf(urlOrRef: unknown): string | null {
    if (typeof urlOrRef !== 'string') return null;
    if (isPrivateRef(urlOrRef)) return urlOrRef.slice(PRIVATE_PREFIX.length);
    const m = urlOrRef.match(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?]+)/);
    if (m && m[1] === bucket().name) return decodeURIComponent(m[2]);
    return null;
}

/** Delete every file a user uploaded (used by account deletion). */
export async function deleteUserFiles(uid: string): Promise<void> {
    const id = safeSegment(uid);
    const prefixes = [
        `public/users/${id}/`, `public/vendors/${id}/`, `public/posts/${id}/`, `public/chats/${id}/`,
        `private/kyc/${id}/`, `private/upgrade/${id}/`,
    ];
    for (const prefix of prefixes) {
        try {
            await bucket().deleteFiles({ prefix, force: true });
        } catch (e: any) {
            console.warn(`Storage cleanup note (${prefix}):`, e.message);
        }
    }
}
