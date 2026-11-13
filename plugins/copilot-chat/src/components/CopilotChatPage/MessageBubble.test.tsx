import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { MessageBubble } from './MessageBubble';

describe('MessageBubble', () => {
  it('renders assistant messages as markdown with clickable citations', async () => {
    const href =
      'http://localhost:3000/docs/default/component/engineering-handbook/Rollback%20Procedure/';
    await renderInTestApp(
      <MessageBubble
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: `# Summary\n\n- first item\n- second item\n\nSource: [Rollback Procedure](${href})`,
          timestamp: new Date('2026-03-06T12:00:00Z'),
        }}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Summary' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Rollback Procedure' }),
    ).toHaveAttribute('href', href);
  });
});
