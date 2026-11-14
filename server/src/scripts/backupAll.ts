/**
 * Read-only backup of ALL Firestore data and Supabase data (tables + storage files).
 *
 * Usage (from server/):  npx ts-node src/scripts/backupAll.ts
 * Output: <repo>/backups/<timestamp>/  (gitignored — contains personal data, keep it private)
 *
 * This script never writes to or deletes from any database.
 */
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../config/firebase';
import supabase from '../config/supabase';

const SUPABASE_TABLES = ['users', 'vendors', 'reviews', 'favorites', 'conversations', 'messages', 'cart_items', 'reports'];
const SUPABASE_BUCKET = 'qiira-uploads';
const PAGE = 1000;

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(__dirname, '../../../backups', stamp);

function writeJson(rel: string, data: unknown) {
    const file = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, firestoreReplacer, 2));
}

// Serialise Firestore Timestamps / GeoPoints / DocumentReferences into plain JSON
function firestoreReplacer(_key: string, value: any) {
    if (value && typeof value === 'object') {
        if (typeof value.toDate === 'function' && 'seconds' in value) {
            return { __type: 'timestamp', iso: value.toDate().toISOString() };
        }
        if ('latitude' in value && 'longitude' in value && typeof value.isEqual === 'function') {
            return { __type: 'geopoint', latitude: value.latitude, longitude: value.longitude };
        }
        if (typeof value.path === 'string' && typeof value.firestore === 'object') {
            return { __type: 'ref', path: value.path };
        }
    }
    return value;
}

async function dumpCollection(col: FirebaseFirestore.CollectionReference): Promise<any[]> {
    const snap = await col.get();
    const docs: any[] = [];
    for (const doc of snap.docs) {
        const entry: any = { id: doc.id, data: doc.data() };
        const subs = await doc.ref.listCollections();
        if (subs.length > 0) {
            entry.subcollections = {};
            for (const sub of subs) {
                entry.subcollections[sub.id] = await dumpCollection(sub);
            }
        }
        docs.push(entry);
    }
    return docs;
}

async function backupFirestore() {
    const collections = await db.listCollections();
    const summary: Record<string, number> = {};
    for (const col of collections) {
        const docs = await dumpCollection(col);
        writeJson(`firestore/${col.id}.json`, docs);
        summary[col.id] = docs.length;
        console.log(`  firestore/${col.id}: ${docs.length} docs`);
    }
    return summary;
}

async function backupSupabaseTables() {
    const summary: Record<string, number | string> = {};
    for (const table of SUPABASE_TABLES) {
        const rows: any[] = [];
        let from = 0;
        let failed: string | null = null;
        while (true) {
            const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1);
            if (error) { failed = error.message; break; }
            rows.push(...(data || []));
            if (!data || data.length < PAGE) break;
            from += PAGE;
        }
        if (failed) {
            summary[table] = `error: ${failed}`;
            console.log(`  supabase/${table}: skipped (${failed})`);
            continue;
        }
        writeJson(`supabase/${table}.json`, rows);
        summary[table] = rows.length;
        console.log(`  supabase/${table}: ${rows.length} rows`);
    }
    return summary;
}

async function listAllFiles(prefix = ''): Promise<string[]> {
    const files: string[] = [];
    let offset = 0;
    while (true) {
        const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).list(prefix, { limit: PAGE, offset });
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const item of data) {
            const full = prefix ? `${prefix}/${item.name}` : item.name;
            // Folders have no id/metadata in Supabase listings
            if (item.id === null || !item.metadata) {
                files.push(...(await listAllFiles(full)));
            } else {
                files.push(full);
            }
        }
        if (data.length < PAGE) break;
        offset += PAGE;
    }
    return files;
}

async function backupSupabaseStorage() {
    let files: string[] = [];
    try {
        files = await listAllFiles();
    } catch (e: any) {
        console.log(`  storage: skipped (${e.message})`);
        return { files: 0, failed: 0, note: e.message };
    }
    let ok = 0;
    const failed: string[] = [];
    for (const f of files) {
        const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).download(f);
        if (error || !data) { failed.push(f); continue; }
        const target = path.join(outDir, 'supabase-storage', f);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, Buffer.from(await data.arrayBuffer()));
        ok++;
    }
    console.log(`  storage: ${ok}/${files.length} files downloaded`);
    if (failed.length) writeJson('supabase-storage-failed.json', failed);
    return { files: ok, failed: failed.length };
}

async function main() {
    fs.mkdirSync(outDir, { recursive: true });
    console.log(`Backing up to ${outDir}`);

    console.log('Firestore...');
    const firestore = await backupFirestore();
    console.log('Supabase tables...');
    const tables = await backupSupabaseTables();
    console.log('Supabase storage...');
    const storage = await backupSupabaseStorage();

    writeJson('manifest.json', { createdAt: new Date().toISOString(), firestore, supabaseTables: tables, supabaseStorage: storage });
    console.log('Backup complete.');
    process.exit(0);
}

main().catch((err) => {
    console.error('Backup failed:', err);
    process.exit(1);
});
