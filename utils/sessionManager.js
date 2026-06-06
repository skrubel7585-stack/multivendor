// utils/sessionManager.js
class SessionManager {
    constructor() {
        this.sessions = new Map(); // Using JavaScript Map as HashMap
        this.sessionTTL = 3600000; // 1 hour
    }

    createSession(userId, userData) {
        const sessionId = this.generateSessionId();
        const session = {
            userId,
            userData,
            createdAt: Date.now(),
            expiresAt: Date.now() + this.sessionTTL
        };
        this.sessions.set(sessionId, session);
        
        // Auto cleanup after expiry
        setTimeout(() => {
            this.sessions.delete(sessionId);
        }, this.sessionTTL);
        
        return sessionId;
    }

    getSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session && session.expiresAt > Date.now()) {
            return session;
        }
        this.sessions.delete(sessionId);
        return null;
    }

    invalidateSession(sessionId) {
        return this.sessions.delete(sessionId);
    }

    generateSessionId() {
        return Math.random().toString(36).substring(2) + Date.now().toString(36);
    }

    getActiveSessionCount() {
        let count = 0;
        for (let [_, session] of this.sessions) {
            if (session.expiresAt > Date.now()) count++;
        }
        return count;
    }

    cleanupExpiredSessions() {
        for (let [key, session] of this.sessions) {
            if (session.expiresAt <= Date.now()) {
                this.sessions.delete(key);
            }
        }
    }
}

module.exports = new SessionManager();