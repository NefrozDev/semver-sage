import { createHash } from 'node:crypto';
import type { DatabaseService } from '../database.service';
import { SessionsService } from './sessions.service';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('SessionsService', () => {
  const query = vi.fn();
  const service = new SessionsService({ pool: { query } } as unknown as DatabaseService);
  const now = new Date('2026-11-08T12:00:00Z');

  beforeEach(() => {
    query.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('opens a 30-day session, storing only the hash of a random token, after sweeping expired ones', async () => {
    const session = await service.open({ sub: 'u1', username: 'ada' }, 'sid-1', now);

    expect(session.token).toMatch(/^[\w-]{43}$/);
    expect(session.expiresAt).toEqual(new Date('2026-12-08T12:00:00Z'));
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('DELETE FROM sessions WHERE expires_at <='), [now]);
    const [sql, params] = query.mock.calls[1];
    expect(sql).toContain('INSERT INTO sessions');
    expect(params).toEqual([sha256(session.token), 'u1', 'ada', 'sid-1', session.expiresAt]);
    expect(params).not.toContain(session.token);
  });

  it('gives every session its own token', async () => {
    const first = await service.open({ sub: 'u1', username: 'ada' }, null, now);
    const second = await service.open({ sub: 'u1', username: 'ada' }, null, now);

    expect(first.token).not.toBe(second.token);
  });

  it('finds the user of a live session by the hash of its token', async () => {
    query.mockResolvedValue({ rows: [{ sub: 'u1', username: 'ada' }] });

    await expect(service.find('token', now)).resolves.toEqual({ sub: 'u1', username: 'ada' });
    expect(query).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('expires_at > $2'), [sha256('token'), now]);
  });

  it('finds no one for an unknown or expired session', async () => {
    await expect(service.find('token', now)).resolves.toBeNull();
  });

  it('does not query without a token', async () => {
    await expect(service.find(undefined)).resolves.toBeNull();
    await service.close(undefined);

    expect(query).not.toHaveBeenCalled();
  });

  it('closes a session by the hash of its token', async () => {
    await service.close('token');

    expect(query).toHaveBeenCalledExactlyOnceWith('DELETE FROM sessions WHERE token_hash = $1', [sha256('token')]);
  });

  it('ends the sessions of one identity session when the logout names it', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 2 });

    await expect(service.end({ sub: 'u1', sid: 'sid-1' })).resolves.toBe(2);
    expect(query).toHaveBeenCalledExactlyOnceWith('DELETE FROM sessions WHERE oidc_sid = $1', ['sid-1']);
  });

  it('ends every session of the account when the logout names only the account', async () => {
    await expect(service.end({ sub: 'u1' })).resolves.toBe(0);
    expect(query).toHaveBeenCalledExactlyOnceWith('DELETE FROM sessions WHERE sub = $1', ['u1']);
  });

  it('forgets a deleted account', async () => {
    await service.forget('u1');

    expect(query).toHaveBeenCalledExactlyOnceWith('DELETE FROM sessions WHERE sub = $1', ['u1']);
  });
});
