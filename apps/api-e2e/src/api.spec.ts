import type { AskStreamEvent, AuthSession, IndexedVersion } from '@semver-sage/types';

// Against the real running API and database. The LLM is never needed: streams are read only up to
// the sources, or end without one (AngularJS notice).
const API = process.env['API_URL'] ?? 'http://localhost:3000';

const ask = (body: unknown) =>
  fetch(`${API}/api/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** Reads SSE events until `until` matches one (or the stream ends), then stops reading. */
async function readEvents(res: Response, until: (e: AskStreamEvent) => boolean = () => false) {
  const events: AskStreamEvent[] = [];
  // (TextDecoderStream's DOM typing accepts any BufferSource, which pipeThrough's typing rejects.)
  const decoder = new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>;
  const reader = (res.body as ReadableStream<Uint8Array>).pipeThrough(decoder).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return events;
    buffer += value;
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      // Comment frames (": ping") only keep the connection alive.
      if (!frame.startsWith('data: ')) continue;
      const event = JSON.parse(frame.slice('data: '.length)) as AskStreamEvent;
      events.push(event);
      if (until(event)) {
        await reader.cancel();
        return events;
      }
    }
  }
}

describe('GET /api/health', () => {
  it('reports the database is reachable', async () => {
    const res = await fetch(`${API}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok' });
  });
});

describe('GET /api/versions', () => {
  it('lists indexed versions', async () => {
    const versions = (await (await fetch(`${API}/api/versions`)).json()) as IndexedVersion[];
    expect(versions.length).toBeGreaterThan(0);
    expect(versions[0]).toEqual(expect.objectContaining({ framework: expect.any(String), version: expect.any(String) }));
  });
});

describe('POST /api/ask', () => {
  it.each([
    [{ question: '' }, 'question must be'],
    [{ question: 'x', framework: 'cobol' }, 'unknown framework'],
    [{ question: 'x', framework: 'vue', version: 'banana' }, 'invalid version'],
    [{ question: 'x', framework: 'vue', version: `${' '.repeat(5000)}2` }, 'invalid version'],
    [{ question: 'x', compareVersion: '3' }, 'compareVersion needs a framework'],
  ])('rejects %j', async (body, message) => {
    const res = await ask(body);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toContain(message);
  });

  it('streams the scope, then sources from the asked version', async () => {
    const res = await ask({ question: 'How do I register a global filter in Vue 2?' });
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const events = await readEvents(res, (e) => e.type === 'citations');
    expect(events.map((e) => e.type)).toEqual(['scope', 'citations']);
    expect(events[0]).toMatchObject({ scope: { framework: 'vue', version: '2', source: 'question' } });
    const citations = events[1].type === 'citations' ? events[1].citations : [];
    expect(citations).toHaveLength(6);
    expect(citations.every((c) => c.framework === 'vue' && c.version === '2')).toBe(true);
    expect(citations.map((c) => c.url).join(' ')).toContain('v2.vuejs.org');
  });

  it('scopes compare questions to both versions', async () => {
    const res = await ask({ question: 'What changed in v-model between Vue 2 and 3?' });
    const events = await readEvents(res, (e) => e.type === 'citations');
    expect(events[0]).toMatchObject({ scope: { version: '2' }, compare: { version: '3' } });
    const citations = events[1].type === 'citations' ? events[1].citations : [];
    expect(new Set(citations.map((c) => c.version))).toEqual(new Set(['2', '3']));
  });

  it('answers AngularJS questions with the fixed notice, without the LLM', async () => {
    const events = await readEvents(await ask({ question: 'How do I use $scope in AngularJS?' }));
    expect(events.map((e) => e.type)).toEqual(['scope', 'citations', 'token', 'done']);
    expect(events.at(-1)).toMatchObject({ type: 'done', model: 'none' });
    expect(events[2].type === 'token' && events[2].text).toContain('Angular 1.x is AngularJS');
  });
});

describe('signing in with the Synapse account', () => {
  it('answers that nobody is signed in, without an error, and links the account page', async () => {
    const res = await fetch(`${API}/api/auth/session`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as AuthSession;
    expect(body.username).toBeNull();
    expect(body.accountUrl).toMatch(/^https?:\/\/.+\/account$/);
  });

  it('knows no one from a made-up session cookie (looked up in the sessions table)', async () => {
    const res = await fetch(`${API}/api/auth/session`, { headers: { Cookie: 'semver_sage_session=made-up' } });

    expect(res.status).toBe(200);
    expect(((await res.json()) as AuthSession).username).toBeNull();
  });

  it('refuses a sign-out sent from another site', async () => {
    const res = await fetch(`${API}/api/auth/logout`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', Cookie: 'semver_sage_session=made-up' },
    });

    expect(res.status).toBe(403);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('refuses back-channel logouts and deletion notices the identity service did not sign', async () => {
    const logout = await fetch(`${API}/api/auth/backchannel-logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'logout_token=not-a-jwt',
    });
    const deletion = await fetch(`${API}/api/auth/account-deleted`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/secevent+jwt' },
      body: 'not-a-jwt',
    });

    expect(logout.status).toBe(400);
    expect(deletion.status).toBe(400);
  });
});
