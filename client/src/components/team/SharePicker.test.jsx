import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SharePicker from './SharePicker';

afterEach(() => cleanup());

const lead = (i) => ({ id: `l${i}`, company: `Company ${String(i).padStart(3, '0')}`, role: i % 2 ? 'Backend' : 'Data' });
const items = (n) => Array.from({ length: n }, (_, i) => lead(i + 1));
const setup = (props = {}) => {
  const p = { open: true, onClose: vi.fn(), title: 'Move a lead to Team', items: items(3), getTitle: (l) => l.company, getSub: (l) => l.role, onShare: vi.fn(), onShareMany: vi.fn().mockResolvedValue(), noun: 'leads', emptyText: 'none', ...props };
  render(<SharePicker {...p} />);
  return p;
};

describe('SharePicker: choosing several', () => {
  it('has a checkbox per item, and no move bar until something is ticked', () => {
    setup();
    expect(screen.getAllByRole('checkbox')).toHaveLength(4); // 3 items + select all
    expect(screen.queryByText(/selected$/)).toBeNull();
  });

  it('moves exactly the ticked items together', async () => {
    const p = setup();
    fireEvent.click(screen.getByLabelText('Select Company 001'));
    fireEvent.click(screen.getByLabelText('Select Company 003'));
    expect(screen.getByRole('status').textContent).toBe('2 selected');
    fireEvent.click(screen.getByText('Move 2 to Team'));
    await waitFor(() => expect(p.onShareMany).toHaveBeenCalledTimes(1));
    expect(p.onShareMany.mock.calls[0][0].map((l) => l.id)).toEqual(['l1', 'l3']);
    expect(p.onShare).not.toHaveBeenCalled();
    await waitFor(() => expect(p.onClose).toHaveBeenCalled());
  });

  it('still lets you move a single item with its own button', () => {
    const p = setup();
    fireEvent.click(screen.getByLabelText('Move Company 002 to Team'));
    expect(p.onShare).toHaveBeenCalledWith(expect.objectContaining({ id: 'l2' }));
    expect(p.onShareMany).not.toHaveBeenCalled();
  });

  it('"Select all" ticks everything, and unticks it again', () => {
    setup();
    fireEvent.click(screen.getByLabelText('Select all 3'));
    expect(screen.getByRole('status').textContent).toBe('3 selected');
    fireEvent.click(screen.getByLabelText('Select all 3'));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('with a search, "Select all" means only the matches', async () => {
    const p = setup({ items: items(10) });
    fireEvent.change(screen.getByLabelText('Search records to move'), { target: { value: 'company 00' } });
    fireEvent.change(screen.getByLabelText('Search records to move'), { target: { value: 'company 005' } });
    fireEvent.click(screen.getByLabelText('Select all 1 matching'));
    fireEvent.click(screen.getByText('Move 1 to Team'));
    await waitFor(() => expect(p.onShareMany).toHaveBeenCalled());
    expect(p.onShareMany.mock.calls[0][0].map((l) => l.id)).toEqual(['l5']);
  });

  it('shows 40 at a time but "Select all" covers the whole list, including what is not on screen yet', async () => {
    const p = setup({ items: items(130) });
    expect(screen.getAllByLabelText(/^Select Company/)).toHaveLength(40);
    fireEvent.click(screen.getByLabelText('Select all 130'));
    expect(screen.getByRole('status').textContent).toBe('130 selected');
    fireEvent.click(screen.getByText('Move 130 to Team'));
    await waitFor(() => expect(p.onShareMany.mock.calls[0][0]).toHaveLength(130));
  });

  it('ticks survive searching, and "Clear" removes them', () => {
    setup({ items: items(10) });
    fireEvent.click(screen.getByLabelText('Select Company 002'));
    fireEvent.change(screen.getByLabelText('Search records to move'), { target: { value: 'company 009' } });
    expect(screen.getByRole('status').textContent).toBe('1 selected');
    fireEvent.click(screen.getByText('Clear'));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('drops ticks for items that disappear (moved or deleted elsewhere)', () => {
    const base = { open: true, onClose: vi.fn(), title: 't', getTitle: (l) => l.company, getSub: (l) => l.role, onShare: vi.fn(), onShareMany: vi.fn(), emptyText: 'none' };
    const { rerender } = render(<SharePicker {...base} items={items(3)} />);
    fireEvent.click(screen.getByLabelText('Select Company 001'));
    fireEvent.click(screen.getByLabelText('Select Company 002'));
    rerender(<SharePicker {...base} items={items(3).slice(1)} />);
    expect(screen.getByRole('status').textContent).toBe('1 selected');
  });

  it('falls back to moving one at a time if the page gives no bulk handler', async () => {
    const onShare = vi.fn().mockResolvedValue();
    setup({ onShareMany: undefined, onShare });
    fireEvent.click(screen.getByLabelText('Select Company 001'));
    fireEvent.click(screen.getByLabelText('Select Company 002'));
    fireEvent.click(screen.getByText('Move 2 to Team'));
    await waitFor(() => expect(onShare).toHaveBeenCalledTimes(2));
  });

  it('keeps the dialog open and the ticks when the bulk move throws', async () => {
    const p = setup({ onShareMany: vi.fn().mockRejectedValue(new Error('nope')) });
    fireEvent.click(screen.getByLabelText('Select Company 001'));
    fireEvent.click(screen.getByText('Move 1 to Team'));
    await waitFor(() => expect(p.onShareMany).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Move 1 to Team').closest('button').disabled).toBe(false));
    expect(p.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('1 selected');
  });

  it('shows the empty message when there is nothing to move', () => {
    setup({ items: [], emptyText: 'You have no personal leads to share.' });
    expect(screen.getByText('You have no personal leads to share.')).toBeTruthy();
    expect(within(screen.getByRole('dialog')).queryAllByRole('checkbox')).toHaveLength(0);
  });
});
