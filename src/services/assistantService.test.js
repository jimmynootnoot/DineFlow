import { askAssistant } from './assistantService';
import { serverRequest } from './platformService';

jest.mock('./platformService', () => ({
  serverRequest: jest.fn(),
}));

jest.mock('./supabase', () => ({
  supabase: {},
}));

test('uses the deployed assistant endpoint without substituting a local answer', async () => {
  serverRequest.mockRejectedValueOnce(new Error('Deployment unavailable'));

  await expect(askAssistant({ question: 'What is available?', sessionId: null }))
    .rejects.toThrow('Deployment unavailable');

  expect(serverRequest).toHaveBeenCalledWith('assistant', {
    question: 'What is available?',
    sessionId: null,
  });
});
