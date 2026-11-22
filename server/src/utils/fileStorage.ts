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
        `private/kyc/${id}/`, `private/upgrade/${id}/`, `incoming/${id}/`,
    ];
    for (const prefix of prefixes) {
        try {
            await bucket().deleteFiles({ prefix, force: true });
        } catch (e: any) {
            console.warn(`Storage cleanup note (${prefix}):`, e.message);
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Direct video uploads
//
// Videos are too big to send as base64 through the API, so the app uploads the file straight to
// Cloud Storage with a one-time signed link:
//   1. createVideoUploadUrl(): a write link valid for 15 minutes, for one new path inside the
//      user's own "incoming/<uid>/" folder, with the size capped by Cloud Storage itself.
//   2. claimUploadedVideo(): when the post is published, the server checks that the file is the
//      caller's, within the size limit and really a video (from its first bytes), then moves it to
//      the public posts folder. Anything else is deleted and rejected.
// Storage security rules stay closed; signed links are the only way in.
// ---------------------------------------------------------------------------------------------

export const MAX_DIRECT_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
const INCOMING_PREFIX = 'upload:';
const VIDEO_TYPES: Record<string, string> = { 'video/mp4': '.mp4', 'video/quicktime': '.mov' };

export async function createVideoUploadUrl(uid: string, contentType: unknown, size: unknown) {
    const type = typeof contentType === 'string' ? contentType.toLowerCase() : '';
    const ext = VIDEO_TYPES[type];
    if (!ext) throw new UploadError('Only MP4 or MOV videos can be uploaded.', 415);
    const bytes = Number(size);
    if (!Number.isFinite(bytes) || bytes <= 0) throw new UploadError('Video size is missing.');
    if (bytes > MAX_DIRECT_VIDEO_BYTES) {
        throw new UploadError(`Video is too large (max ${MAX_DIRECT_VIDEO_BYTES / 1024 / 1024} MB). Try a shorter clip.`, 413);
    }

    const path = `incoming/${safeSegment(uid)}/video_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
    const expires = Date.now() + 15 * 60 * 1000;
    const headers = {
        'Content-Type': type,
        'x-goog-content-length-range': `1,${MAX_DIRECT_VIDEO_BYTES}`,
    };
    const [uploadUrl] = await bucket().file(path).getSignedUrl({
        version: 'v4',
        action: 'write',
        expires,
        contentType: type,
        extensionHeaders: { 'x-goog-content-length-range': headers['x-goog-content-length-range'] },
    } as any);
    return { uploadUrl, uploadRef: `${INCOMING_PREFIX}${path}`, method: 'PUT', headers, expiresAt: new Date(expires).toISOString() };
}

export const isUploadRef = (v: unknown): boolean => typeof v === 'string' && v.startsWith(`${INCOMING_PREFIX}incoming/`);

/** Verify a direct upload belongs to `uid` and is a real video, then publish it. Returns the public URL. */
export async function claimUploadedVideo(ref: string, uid: string, folder: string[], namePrefix: string): Promise<string> {
    const path = ref.slice(INCOMING_PREFIX.length);
    // Exactly incoming/<uid>/<file> — no other user's folder, no "..", no sub-folders
    const m = path.match(/^incoming\/([a-zA-Z0-9_-]+)\/(video_[a-zA-Z0-9_]+\.(mp4|mov))$/);
    if (!m || m[1] !== safeSegment(uid)) throw new UploadError('Invalid media', 403);

    const src = bucket().file(path);
    const [exists] = await src.exists();
    if (!exists) throw new UploadError('The video upload was not found or has expired. Please upload it again.');

    const reject = async (msg: string, status = 400): Promise<never> => {
        await src.delete().catch(() => {});
        throw new UploadError(msg, status);
    };
    const [meta] = await src.getMetadata();
    const size = Number(meta?.size || 0);
    if (!size) return reject('The uploaded video is empty.');
    if (size > MAX_DIRECT_VIDEO_BYTES) return reject('Video is too large.', 413);

    const [head] = await src.download({ start: 0, end: 63 });
    const detected = detectFileType(Buffer.from(head));
    if (!detected || detected.kind !== 'video') return reject('That file is not a supported video.', 415);

    const fileName = `${safeSegment(namePrefix)}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${detected.ext}`;
    const destPath = ['public', ...folder.map(safeSegment), fileName].join('/');
    const dest = bucket().file(destPath);
    const token = crypto.randomUUID();
    await src.copy(dest);
    await dest.setMetadata({
        contentType: detected.mime,
        cacheControl: 'public, max-age=31536000',
        metadata: { firebaseStorageDownloadTokens: token },
    });
    await src.delete().catch(() => {});
    return `https://firebasestorage.googleapis.com/v0/b/${bucket().name}/o/${encodeURIComponent(destPath)}?alt=media&token=${token}`;
}
