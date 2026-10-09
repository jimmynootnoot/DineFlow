import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DashboardPerformance from './DashboardPerformance';
import { serverRequest } from '../../services/platformService';

jest.mock('../../services/platformService', () => ({ serverRequest: jest.fn() }));

const aggregates = {
  revenue: 590, totalOrders: 3, completedOrders: 2, averageOrderValue: 295,
  changePercent: null, demoOrderCount: 1,
  items: [{ id: 'bangsilog', name: 'Bangsilog', quantity: 2 }],
};

beforeEach(() => { jest.clearAllMocks(); });

test('management figures and top sellers use one selected period with demo provenance', async () => {
  serverRequest.mockResolvedValue({ aggregates, insight: null });
  render(<DashboardPerformance orders={[]} />);
  expect(await screen.findByText('₱590.00')).toBeInTheDocument();
  expect(screen.getByText('₱295.00')).toBeInTheDocument();
  expect(screen.getByText(/includes 1 demonstration order/i)).toBeInTheDocument();
  expect(screen.getByText('Bangsilog')).toBeInTheDocument();
  expect(serverRequest).toHaveBeenCalledWith('sales-insight', expect.objectContaining({ start: expect.any(String), end: expect.any(String) }));

  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('Through'), { target: { value: '2026-10-09' } });
  fireEvent.click(screen.getByRole('button', { name: 'View period' }));
  await waitFor(() => expect(serverRequest).toHaveBeenLastCalledWith('sales-insight', { start: '2026-10-01', end: '2026-10-09' }));
});

test('AI insight is generated on demand and stale summaries are hidden', async () => {
  serverRequest.mockResolvedValueOnce({ aggregates, insight: null, stale: true })
    .mockResolvedValueOnce({ aggregates, insight: { summary: 'Two completed bills generated PHP 590.', mode: 'generative', generated_at: '2026-10-09T04:00:00Z' } });
  render(<DashboardPerformance orders={[]} />);
  expect(await screen.findByText(/saved summary no longer matches/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Generate AI summary' }));
  expect(await screen.findByText('Two completed bills generated PHP 590.')).toBeInTheDocument();
  expect(serverRequest).toHaveBeenLastCalledWith('sales-insight', expect.objectContaining({ generate: true, regenerate: false }));
});
