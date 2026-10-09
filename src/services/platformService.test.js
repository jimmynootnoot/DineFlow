import { serverRequest } from './platformService';
import { supabase } from './supabase';

jest.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
  },
}));

beforeEach(() => {
  supabase.auth.getSession.mockResolvedValue({
    data: { session: { access_token: 'test-token' } },
    error: null,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('identifies Vercel deployment protection instead of reporting a generic API failure', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: false,
    status: 401,
    headers: { get: () => 'application/json' },
    json: async () => ({ error: { message: 'Protected deployment' }, message: 'Protected by Vercel Authentication' }),
  });

  await expect(serverRequest('assistant', { question: 'What is available?' }))
    .rejects.toThrow('Vercel Deployment Protection is blocking the online service.');
});
