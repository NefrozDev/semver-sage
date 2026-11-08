import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseService } from '../database.service';
import { getAuthConfig } from './auth.config';
import type { EndedSession } from './identity-tokens';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Who the header shows as signed in. */
export interface SessionUser {
  sub: string;
  username: string;
}

export interface OpenedSession {
  /** Goes into the cookie only: the database keeps its SHA-256. */
  token: string;
  expiresAt: Date;
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/** Semver Sage's own sessions, opened once the identity service vouched for the person. */
@Injectable()
export class SessionsService {
  private readonly ttlMs = getAuthConfig().sessionTtlDays * DAY_MS;

  constructor(private readonly db: DatabaseService) {}

  async open(user: SessionUser, oidcSid: string | null, now = new Date()): Promise<OpenedSession> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + this.ttlMs);
    // Expired sessions are swept here rather than by a scheduled job.
    await this.db.pool.query(`DELETE FROM sessions WHERE expires_at <= $1`, [now]);
    await this.db.pool.query(
      `INSERT INTO sessions (token_hash, sub, username, oidc_sid, expires_at) VALUES ($1, $2, $3, $4, $5)`,
      [hash(token), user.sub, user.username, oidcSid, expiresAt],
    );
    return { token, expiresAt };
  }

  async find(token: string | undefined, now = new Date()): Promise<SessionUser | null> {
    if (!token) return null;
    const { rows } = await this.db.pool.query<SessionUser>(
      `SELECT sub, username FROM sessions WHERE token_hash = $1 AND expires_at > $2`,
      [hash(token), now],
    );
    return rows[0] ?? null;
  }

  async close(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.db.pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [hash(token)]);
  }

  /** A back-channel logout: the sessions of that identity session, or of the whole account. */
  async end(ended: EndedSession): Promise<number> {
    const { rowCount } = ended.sid
      ? await this.db.pool.query(`DELETE FROM sessions WHERE oidc_sid = $1`, [ended.sid])
      : await this.db.pool.query(`DELETE FROM sessions WHERE sub = $1`, [ended.sub]);
    return rowCount ?? 0;
  }

  /** The account was deleted: its sessions were all Semver Sage kept about it. */
  async forget(sub: string): Promise<void> {
    await this.db.pool.query(`DELETE FROM sessions WHERE sub = $1`, [sub]);
  }
}
