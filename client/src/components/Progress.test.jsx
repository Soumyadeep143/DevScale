import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../lib/api', () => ({ fetchLeetcodePage: vi.fn(), fetchLeetcodeSummary: vi.fn(), updateLeetcodeStatus: vi.fn() }));
vi.mock('recharts', () => {
  const Box = ({ children }) => <div>{children}</div>;
  return Object.fromEntries(['ResponsiveContainer', 'PieChart', 'Pie', 'Cell', 'Tooltip'].map((n) => [n, Box]));
});
import * as api from '../lib/api';
import Progress from './Progress';

const problem = (i, over = {}) => ({ row: i, week: 'Week 1', day: `Day ${i}`, weekTheme: 't', topic: 'Arrays', dayFocus: 'f', problem: `Problem ${i}`, link: '', difficulty: 'Easy', concept: '', status: 'Not Started', updatedAt: null, ...over });
const summary = (over = {}) => ({
  total: 120, solved: 3, inProgress: 0, notStarted: 117, percent: 2.5,
  byWeek: [{ week: 'Week 1', theme: 'T', total: 60, solved: 3 }, { week: 'Week 2', theme: 'U', total: 60, solved: 0 }],
  byDifficulty: [{ name: 'Easy', total: 40, solved: 3 }, { name: 'Medium', total: 60, solved: 0 }, { name: 'Hard', total: 20, solved: 0 }],
  recent: [], ...over,
});
// 120 problems served 50 at a time, like the real endpoint.
const serve = ({ offset, limit, week }) => {
  const all = Array.from({ length: week === 'Week 2' ? 60 : 120 }, (_, i) => problem(i + 1, week === 'Week 2' ? { week: 'Week 2' } : {}));
  return Promise.resolve({ items: all.slice(offset, offset + limit), hasMore: offset + limit < all.length });
};

beforeEach(() => {
  vi.clearAllMocks();
  delete globalThis.IntersectionObserver;
  api.fetchLeetcodeSummary.mockResolvedValue(summary());
  api.fetchLeetcodePage.mockImplementation(serve);
  api.updateLeetcodeStatus.mockResolvedValue();
});
afterEach(() => cleanup());

const rowsShown = () => screen.getAllByLabelText('Problem status').length;

describe('LeetCode problem list paging', () => {
  it('shows the first page only, then more on request, and says when everything is loaded', async () => {
    render(<Progress />);
    await screen.findByText('Problem 1');
    expect(rowsShown()).toBe(50);
    expect(screen.queryByText('Problem 51')).toBeNull();
    expect(api.fetchLeetcodePage).toHaveBeenCalledWith({ offset: 0, limit: 50, week: null });

    fireEvent.click(screen.getByText('Load more'));
    await screen.findByText('Problem 51');
    expect(rowsShown()).toBe(100);
    fireEvent.click(screen.getByText('Load more'));
    await screen.findByText('Problem 120');
    expect(rowsShown()).toBe(120);
    expect(screen.getByText('All 120 problems loaded')).toBeTruthy();
    expect(screen.queryByText('Load more')).toBeNull();
  });

  it('loads the next page by itself when the end of the list scrolls into view', async () => {
    let trigger;
    globalThis.IntersectionObserver = class { constructor(cb) { trigger = cb; } observe() {} disconnect() {} };
    render(<Progress />);
    await screen.findByText('Problem 50');
    await act(async () => { trigger([{ isIntersecting: true }]); });
    await screen.findByText('Problem 100');
    expect(api.fetchLeetcodePage).toHaveBeenCalledWith({ offset: 50, limit: 50, week: null });
  });

  it('starts over from the top when a week is picked', async () => {
    render(<Progress />);
    await screen.findByText('Problem 1');
    fireEvent.click(screen.getByText('Load more'));
    await screen.findByText('Problem 51');
    fireEvent.click(screen.getByText('Week 2').closest('button'));
    await waitFor(() => expect(api.fetchLeetcodePage).toHaveBeenCalledWith({ offset: 0, limit: 50, week: 'Week 2' }));
    await waitFor(() => expect(rowsShown()).toBe(50));
    expect(screen.queryByText('Problem 51')).toBeNull();
  });

  it('ignores a slow response for an old filter', async () => {
    let releaseSlow;
    api.fetchLeetcodePage.mockImplementation(({ offset, limit, week }) => (week === 'Week 2'
      ? serve({ offset, limit, week })
      : new Promise((res) => { releaseSlow = () => res(serve({ offset, limit, week })); })));
    render(<Progress />);
    await screen.findByText('Week 2');
    fireEvent.click(screen.getByText('Week 2').closest('button'));
    await screen.findAllByLabelText('Problem status');
    await act(async () => { releaseSlow(); });
    expect(rowsShown()).toBe(50);
    expect(screen.getAllByText('Week 2').length).toBeGreaterThan(0);
  });

  it('shows an error with a retry when a page fails, keeping what is already loaded', async () => {
    api.fetchLeetcodePage.mockImplementationOnce(serve).mockRejectedValueOnce(new Error('network down'));
    render(<Progress />);
    await screen.findByText('Problem 1');
    fireEvent.click(screen.getByText('Load more'));
    expect((await screen.findByRole('alert')).textContent).toContain('network down');
    expect(rowsShown()).toBe(50);
    api.fetchLeetcodePage.mockImplementation(serve);
    fireEvent.click(screen.getByText('Try again'));
    await screen.findByText('Problem 51');
  });
});

describe('changing a problem status in the paged list', () => {
  it('updates in place without reloading the list, then refreshes the totals', async () => {
    render(<Progress />);
    await screen.findByText('Problem 1');
    const first = screen.getAllByLabelText('Problem status')[0];
    fireEvent.change(first, { target: { value: 'Solved ✅' } });
    await waitFor(() => expect(api.updateLeetcodeStatus).toHaveBeenCalledWith(1, 'Solved ✅'));
    await waitFor(() => expect(api.fetchLeetcodeSummary).toHaveBeenCalledTimes(2));
    expect(api.fetchLeetcodePage).toHaveBeenCalledTimes(1); // the list was not refetched
    expect(first.value).toBe('Solved ✅');
  });

  it('puts the old status back when saving fails', async () => {
    api.updateLeetcodeStatus.mockRejectedValue(new Error('nope'));
    render(<Progress />);
    await screen.findByText('Problem 1');
    const first = screen.getAllByLabelText('Problem status')[0];
    fireEvent.change(first, { target: { value: 'Solved ✅' } });
    await waitFor(() => expect(first.value).toBe('Not Started'));
    expect(api.fetchLeetcodeSummary).toHaveBeenCalledTimes(1); // nothing changed, so no refresh
  });
});

it('shows an empty message for a week with no problems', async () => {
  api.fetchLeetcodePage.mockResolvedValue({ items: [], hasMore: false });
  render(<Progress />);
  expect(await screen.findByText(/No problems/)).toBeTruthy();
});
