import axios from 'axios';

describe('GET /api/health', () => {
  it('reports the database is reachable', async () => {
    const res = await axios.get(`/api/health`);

    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ status: 'ok' });
  });
});

describe('POST /api/ask', () => {
  it('rejects an empty question', async () => {
    const res = await axios.post(`/api/ask`, { question: '' }, { validateStatus: () => true });

    expect(res.status).toBe(400);
  });
});
