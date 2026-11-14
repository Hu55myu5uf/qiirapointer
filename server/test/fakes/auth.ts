/**
 * In-memory Firebase Admin Auth stand-in.
 * A request is authenticated as user X by sending the header  `Authorization: Bearer valid:X`.
 */
export class FakeAuth {
    users = new Map<string, any>();

    reset() { this.users.clear(); }

    async verifyIdToken(token: string) {
        if (!token.startsWith('valid:')) {
            const err: any = new Error('invalid token'); err.code = 'auth/argument-error'; throw err;
        }
        const uid = token.slice('valid:'.length);
        const user = this.users.get(uid);
        return { uid, email: user?.email, name: user?.displayName };
    }

    async getUser(uid: string) {
        const u = this.users.get(uid);
        if (!u) { const err: any = new Error('user not found'); err.code = 'auth/user-not-found'; throw err; }
        return u;
    }

    async getUserByEmail(email: string) {
        for (const u of this.users.values()) if (u.email === email) return u;
        const err: any = new Error('user not found'); err.code = 'auth/user-not-found'; throw err;
    }

    async createUser(props: any) {
        for (const u of this.users.values()) {
            if (props.email && u.email === props.email) {
                const err: any = new Error('email exists'); err.code = 'auth/email-already-exists'; throw err;
            }
        }
        const uid = props.uid || `uid_${this.users.size + 1}_${Date.now()}`;
        const record = { uid, ...props };
        this.users.set(uid, record);
        return record;
    }

    async updateUser(uid: string, props: any) {
        const u = await this.getUser(uid);
        Object.assign(u, props);
        return u;
    }

    async deleteUser(uid: string) {
        await this.getUser(uid);
        this.users.delete(uid);
    }

    async revokeRefreshTokens(_uid: string) {}
}
