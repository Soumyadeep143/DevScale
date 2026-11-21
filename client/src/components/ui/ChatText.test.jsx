import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChatText from './ChatText';

describe('ChatText', () => {
  it('renders bold and bullets without showing the markers', () => {
    const { container } = render(<ChatText text={'**What’s holding you back**\n\n- **Follow-ups** – three notes\n- plain item'} />);
    expect(container.textContent).not.toContain('*');
    expect(container.querySelectorAll('strong')).toHaveLength(2);
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText('Follow-ups').tagName).toBe('STRONG');
  });

  it('never turns model output into HTML', () => {
    const { container } = render(<ChatText text={'<img src=x onerror=alert(1)> **ok**'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img');
  });
});
