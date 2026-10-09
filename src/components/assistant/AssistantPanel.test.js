import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AssistantPanel from './AssistantPanel';
import { askAssistant, loadConversation } from '../../services/assistantService';

jest.mock('../../services/assistantService', () => ({
  askAssistant: jest.fn(),
  loadConversation: jest.fn(),
  exportConversation: jest.fn(),
}));

jest.mock('../../services/platformService', () => ({
  downloadText: jest.fn(),
}));

jest.mock('../../services/escalationService', () => ({
  createEscalation: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  loadConversation.mockResolvedValue({ sessionId: null, messages: [] });
});

test('shows the deployed service error instead of a local chatbot answer', async () => {
  askAssistant.mockRejectedValue(new Error('The online service is unavailable.'));
  render(<AssistantPanel user={{ id: 'customer-1' }} />);

  fireEvent.click(screen.getByRole('button', { name: /ask dineflow/i }));
  await waitFor(() => expect(screen.getByPlaceholderText(/ask about a dish/i)).toBeEnabled());
  fireEvent.change(screen.getByPlaceholderText(/ask about a dish/i), { target: { value: 'What is available?' } });
  fireEvent.click(screen.getByRole('button', { name: /send question/i }));

  expect(await screen.findByText('The online service is unavailable.')).toBeInTheDocument();
  expect(screen.getByText(/online service unavailable/i)).toBeInTheDocument();
  expect(screen.queryByText(/local-grounded/i)).not.toBeInTheDocument();
});
