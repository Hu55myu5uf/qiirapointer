/**
 * Minimal in-memory Firestore stand-in for tests.
 * Supports the subset of the Admin SDK API this server uses: collections, sub-collections,
 * get/set(merge)/update/delete/add, where/orderBy/limit/startAfter, count(), batches,
 * transactions, listCollections and FieldValue sentinels.
 */

type Data = Record<string, any>;

class Sentinel {
    constructor(public kind: 'increment' | 'arrayUnion' | 'arrayRemove' | 'serverTimestamp' | 'delete', public value?: any) {}
}

export const FieldValue = {
    increment: (n: number) => new Sentinel('increment', n),
    arrayUnion: (...items: any[]) => new Sentinel('arrayUnion', items),
    arrayRemove: (...items: any[]) => new Sentinel('arrayRemove', items),
    serverTimestamp: () => new Sentinel('serverTimestamp'),
    delete: () => new Sentinel('delete'),
};

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
let autoId = 0;

function applySentinel(current: any, value: any): any {
    if (!(value instanceof Sentinel)) return clone(value);
    switch (value.kind) {
        case 'increment': return (typeof current === 'number' ? current : 0) + value.value;
        case 'arrayUnion': {
            const arr = Array.isArray(current) ? [...current] : [];
            for (const it of value.value) if (!arr.some(a => JSON.stringify(a) === JSON.stringify(it))) arr.push(it);
            return arr;
        }
        case 'arrayRemove': {
            const arr = Array.isArray(current) ? current : [];
            return arr.filter(a => !value.value.some((it: any) => JSON.stringify(a) === JSON.stringify(it)));
        }
        case 'serverTimestamp': return new Date().toISOString();
        default: return undefined;
    }
}

function setPath(target: Data, dotted: string, value: any) {
    const parts = dotted.split('.');
    let obj = target;
    for (let i = 0; i < parts.length - 1; i++) {
        if (typeof obj[parts[i]] !== 'object' || obj[parts[i]] === null) obj[parts[i]] = {};
        obj = obj[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (value instanceof Sentinel && value.kind === 'delete') { delete obj[last]; return; }
    obj[last] = applySentinel(obj[last], value);
}

function mergeDeep(target: Data, src: Data) {
    for (const [k, v] of Object.entries(src)) {
        if (v instanceof Sentinel) {
            if (v.kind === 'delete') delete target[k];
            else target[k] = applySentinel(target[k], v);
        } else if (v && typeof v === 'object' && !Array.isArray(v) && typeof target[k] === 'object' && target[k] && !Array.isArray(target[k])) {
            mergeDeep(target[k], v);
        } else {
            target[k] = clone(v);
        }
    }
}

function getField(data: Data, dotted: string) {
    return dotted.split('.').reduce((o: any, p) => (o == null ? undefined : o[p]), data);
}

export class FakeFirestore {
    store = new Map<string, Data>(); // key: full doc path

    reset() { this.store.clear(); }

    collection(name: string) { return new CollectionRef(this, name); }
    collectionGroup(name: string) { return new Query(this, '', [], [], undefined, undefined, name); }
    doc(path: string) {
        const parts = path.split('/');
        return new DocRef(this, parts.slice(0, -1).join('/'), parts[parts.length - 1]);
    }

    async listCollections() {
        const names = new Set<string>();
        for (const key of this.store.keys()) names.add(key.split('/')[0]);
        return [...names].map(n => new CollectionRef(this, n));
    }

    batch() {
        const ops: (() => Promise<any>)[] = [];
        const b = {
            set: (ref: DocRef, data: Data, opts?: { merge?: boolean }) => { ops.push(() => ref.set(data, opts)); return b; },
            update: (ref: DocRef, data: Data) => { ops.push(() => ref.update(data)); return b; },
            delete: (ref: DocRef) => { ops.push(() => ref.delete()); return b; },
            commit: async () => { for (const op of ops) await op(); },
        };
        return b;
    }

    async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
        const writes: (() => Promise<any>)[] = [];
        const tx = {
            get: (refOrQuery: any) => refOrQuery.get(),
            set: (ref: DocRef, data: Data, opts?: { merge?: boolean }) => { writes.push(() => ref.set(data, opts)); return tx; },
            update: (ref: DocRef, data: Data) => { writes.push(() => ref.update(data)); return tx; },
            delete: (ref: DocRef) => { writes.push(() => ref.delete()); return tx; },
            create: (ref: DocRef, data: Data) => { writes.push(() => ref.create(data)); return tx; },
        };
        const result = await fn(tx);
        for (const w of writes) await w();
        return result;
    }

    // Test helper: read raw data
    raw(path: string) { return clone(this.store.get(path)); }
}

class DocSnapshot {
    constructor(public ref: DocRef, private _data: Data | undefined) {}
    get id() { return this.ref.id; }
    get exists() { return this._data !== undefined; }
    data() { return clone(this._data); }
    get(field: string) { return this._data ? getField(this._data, field) : undefined; }
}

class QuerySnapshot {
    constructor(public docs: DocSnapshot[]) {}
    get empty() { return this.docs.length === 0; }
    get size() { return this.docs.length; }
    forEach(cb: (d: DocSnapshot) => void) { this.docs.forEach(cb); }
}

export class DocRef {
    constructor(private fs: FakeFirestore, public parentPath: string, public id: string) {}
    get path() { return `${this.parentPath}/${this.id}`; }
    get parent() { return new CollectionRef(this.fs, this.parentPath); }
    collection(name: string) { return new CollectionRef(this.fs, `${this.path}/${name}`); }

    async get() { return new DocSnapshot(this, this.fs.store.get(this.path)); }

    async set(data: Data, opts?: { merge?: boolean }) {
        const existing = this.fs.store.get(this.path);
        if (opts?.merge && existing) {
            const next = clone(existing);
            mergeDeep(next, data);
            this.fs.store.set(this.path, next);
        } else {
            const next: Data = {};
            mergeDeep(next, data);
            this.fs.store.set(this.path, next);
        }
    }

    async create(data: Data) {
        if (this.fs.store.has(this.path)) {
            const err: any = new Error('ALREADY_EXISTS'); err.code = 6; throw err;
        }
        return this.set(data);
    }

    async update(data: Data) {
        const existing = this.fs.store.get(this.path);
        if (!existing) { const err: any = new Error(`NOT_FOUND: ${this.path}`); err.code = 5; throw err; }
        const next = clone(existing);
        for (const [k, v] of Object.entries(data)) setPath(next, k, v);
        this.fs.store.set(this.path, next);
    }

    async delete() { this.fs.store.delete(this.path); }

    async listCollections() {
        const prefix = `${this.path}/`;
        const names = new Set<string>();
        for (const key of this.fs.store.keys()) {
            if (key.startsWith(prefix)) names.add(key.slice(prefix.length).split('/')[0]);
        }
        return [...names].map(n => this.collection(n));
    }
}

type Filter = { field: string; op: string; value: any };

class Query {
    constructor(
        protected fs: FakeFirestore,
        public path: string,
        protected filters: Filter[] = [],
        protected orders: { field: string; dir: 'asc' | 'desc' }[] = [],
        protected limitN?: number,
        protected afterValues?: any[],
        protected group?: string,
    ) {}

    where(field: string, op: string, value: any) {
        return new Query(this.fs, this.path, [...this.filters, { field, op, value }], this.orders, this.limitN, this.afterValues, this.group);
    }
    orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
        return new Query(this.fs, this.path, this.filters, [...this.orders, { field, dir }], this.limitN, this.afterValues, this.group);
    }
    limit(n: number) { return new Query(this.fs, this.path, this.filters, this.orders, n, this.afterValues, this.group); }
    startAfter(...values: any[]) {
        const vals = values.length === 1 && values[0] instanceof DocSnapshot
            ? this.orders.map(o => values[0].get(o.field))
            : values;
        return new Query(this.fs, this.path, this.filters, this.orders, this.limitN, vals, this.group);
    }
    count() {
        return { get: async () => { const s = await this.get(); return { data: () => ({ count: s.size }) }; } };
    }

    private matches(data: Data) {
        return this.filters.every(({ field, op, value }) => {
            const v = field === '__name__' ? undefined : getField(data, field);
            switch (op) {
                case '==': return JSON.stringify(v) === JSON.stringify(value);
                case '!=': return v !== undefined && JSON.stringify(v) !== JSON.stringify(value);
                case '<': return v < value;
                case '<=': return v <= value;
                case '>': return v > value;
                case '>=': return v >= value;
                case 'array-contains': return Array.isArray(v) && v.some(x => JSON.stringify(x) === JSON.stringify(value));
                case 'array-contains-any': return Array.isArray(v) && v.some(x => value.includes(x));
                case 'in': return value.includes(v);
                case 'not-in': return v !== undefined && !value.includes(v);
                default: throw new Error(`Unsupported op ${op}`);
            }
        });
    }

    async get() {
        const prefix = `${this.path}/`;
        let docs: DocSnapshot[] = [];
        for (const [key, data] of this.fs.store.entries()) {
            if (this.group) {
                // collectionGroup: any document whose parent collection has this id
                const parts = key.split('/');
                if (parts[parts.length - 2] !== this.group || !this.matches(data)) continue;
                docs.push(new DocSnapshot(new DocRef(this.fs, parts.slice(0, -1).join('/'), parts[parts.length - 1]), data));
                continue;
            }
            if (!key.startsWith(prefix)) continue;
            const rest = key.slice(prefix.length);
            if (rest.includes('/')) continue; // sub-collection doc
            if (!this.matches(data)) continue;
            docs.push(new DocSnapshot(new DocRef(this.fs, this.path, rest), data));
        }
        for (const o of this.orders) {
            // Firestore excludes docs missing an orderBy field
            docs = docs.filter(d => d.get(o.field) !== undefined);
        }
        if (this.orders.length) {
            docs.sort((a, b) => {
                for (const o of this.orders) {
                    const av = a.get(o.field), bv = b.get(o.field);
                    if (av === bv) continue;
                    const cmp = av < bv ? -1 : 1;
                    return o.dir === 'desc' ? -cmp : cmp;
                }
                return 0;
            });
        }
        if (this.afterValues && this.orders.length) {
            const idx = docs.findIndex(d => this.orders.every((o, i) => d.get(o.field) === this.afterValues![i]));
            if (idx >= 0) docs = docs.slice(idx + 1);
        }
        if (this.limitN !== undefined) docs = docs.slice(0, this.limitN);
        return new QuerySnapshot(docs);
    }
}

export class CollectionRef extends Query {
    constructor(fs: FakeFirestore, path: string) { super(fs, path); }
    get id() { return this.path.split('/').pop()!; }
    /** The document that owns this sub-collection (null for top-level collections). */
    get parent(): DocRef | null {
        const parts = this.path.split('/');
        return parts.length >= 3 ? new DocRef(this.fs, parts.slice(0, -2).join('/'), parts[parts.length - 2]) : null;
    }
    doc(id?: string) { return new DocRef(this.fs, this.path, id || `auto_${++autoId}`); }
    async add(data: Data) { const ref = this.doc(); await ref.set(data); return ref; }
}
