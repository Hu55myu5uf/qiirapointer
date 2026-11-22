import * as FileSystem from 'expo-file-system/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { postAPI } from '../services/api';

/**
 * Videos are uploaded as files, straight to storage, through a one-time link from the server:
 * no base64 (a phone can't hold a large video as text in memory) and no 20 MB API limit.
 * The server checks the file is really a video before it is published.
 */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // keep in step with the server
export const MAX_VIDEO_SECONDS = 90;

export function videoMimeOf(uri: string, mime?: string | null): 'video/mp4' | 'video/quicktime' {
    if (mime === 'video/quicktime' || /\.mov(\?|$)/i.test(uri)) return 'video/quicktime';
    return 'video/mp4';
}

export async function fileSizeOf(uri: string, known?: number | null): Promise<number> {
    if (known && known > 0) return known;
    const info: any = await FileSystem.getInfoAsync(uri);
    return Number(info?.size) || 0;
}

/** Upload a local video file. Resolves to the reference the server expects in mediaUrls. */
export async function uploadVideo(
    localUri: string,
    opts: { mime?: string | null; size?: number | null; onProgress?: (fraction: number) => void } = {}
): Promise<string> {
    const size = await fileSizeOf(localUri, opts.size);
    if (!size) throw new Error('Could not read the video file. Please choose it again.');
    if (size > MAX_VIDEO_BYTES) {
        throw new Error(`This video is ${Math.round(size / 1024 / 1024)} MB. The limit is ${MAX_VIDEO_BYTES / 1024 / 1024} MB; please choose a shorter clip.`);
    }

    const { data } = await postAPI.getVideoUploadUrl({ contentType: videoMimeOf(localUri, opts.mime), size });
    const task = FileSystem.createUploadTask(
        data.uploadUrl,
        localUri,
        { httpMethod: 'PUT', uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers: data.headers },
        (p) => {
            if (p.totalBytesExpectedToSend > 0) opts.onProgress?.(p.totalBytesSent / p.totalBytesExpectedToSend);
        }
    );
    const res = await task.uploadAsync();
    if (!res || res.status < 200 || res.status >= 300) {
        throw new Error(`The video upload did not finish (error ${res?.status ?? 'network'}). Please try again.`);
    }
    opts.onProgress?.(1);
    return data.uploadRef as string;
}

/** A still frame from the video at `seconds`, as a local image file. */
export async function videoFrame(uri: string, seconds = 0): Promise<string | null> {
    try {
        const { uri: frame } = await VideoThumbnails.getThumbnailAsync(uri, { time: Math.max(0, Math.round(seconds * 1000)), quality: 0.7 });
        return frame;
    } catch (e: any) {
        console.warn('Video frame note:', e?.message);
        return null;
    }
}

/** Read a local image file as a data URI (for the small cover image). */
export async function imageFileAsDataUri(uri: string): Promise<string> {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return `data:image/jpeg;base64,${b64}`;
}
