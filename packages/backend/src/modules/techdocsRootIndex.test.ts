import { buildLandingPage } from './techdocsRootIndex';

describe('buildLandingPage', () => {
  it('links each top-level nav entry to its first page', () => {
    const page = buildLandingPage('Handbook', [
      { Home: 'Space/Handbook/README.md' },
      {
        'Platform Operations': [
          'Space/Handbook/Platform Operations/README.md',
          { 'Deployment Guide': ['Space/Handbook/Deploy/README.md'] },
        ],
      },
      'Space/Handbook/Glossary.md',
      { GitHub: 'https://github.com' },
    ]);

    expect(page).toContain('# Handbook');
    expect(page).toContain('- [Home](Space/Handbook/README.md)');
    expect(page).toContain(
      '- [Platform Operations](Space/Handbook/Platform%20Operations/README.md)',
    );
    expect(page).toContain('- [Glossary](Space/Handbook/Glossary.md)');
    expect(page).not.toContain('github.com');
  });

  it('returns undefined when there is no nav', () => {
    expect(buildLandingPage('Handbook', undefined)).toBeUndefined();
  });
});
