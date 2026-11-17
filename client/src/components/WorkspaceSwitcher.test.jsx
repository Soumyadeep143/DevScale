import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import WorkspaceSwitcher from './WorkspaceSwitcher';

afterEach(() => cleanup());

describe('WorkspaceSwitcher', () => {
  it('marks the active option and calls onChange on click', () => {
    const onChange = vi.fn();
    render(<WorkspaceSwitcher workspace="personal" setWorkspace={onChange} />);
    expect(screen.getByRole('radio', { name: 'Personal' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'Team' }));
    expect(onChange).toHaveBeenCalledWith('team');
  });

  it('supports arrow-key navigation with a roving tabindex', () => {
    const onChange = vi.fn();
    render(<WorkspaceSwitcher workspace="personal" setWorkspace={onChange} />);
    expect(screen.getByRole('radio', { name: 'Team' }).getAttribute('tabindex')).toBe('-1');
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Personal' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('team');
  });
});
