/*
 * Copyright 2026 The Docs Studio Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { NotAllowedError } from '@backstage/errors';
import { ProposalApproval } from '@internal/backstage-plugin-docs-studio-common';
import { decodeMetadata, encodeMetadata } from './metadata';
import {
  approvalThresholdMet,
  approveBlockedReason,
  buildCommitMessage,
  computeCommitAuthor,
  currentApprovals,
  failureDescription,
  pullRequestTitle,
} from './rules';

const approval = (user: string, sha: string): ProposalApproval => ({
  userEntityRef: `user:default/${user}`,
  displayName: user,
  sha,
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('commit author', () => {
  it('uses the GitHub noreply address for licensed users', () => {
    expect(
      computeCommitAuthor(
        { displayName: 'Ada', licensed: true, githubLogin: 'ada' },
        42,
      ),
    ).toEqual({ name: 'Ada', email: '42+ada@users.noreply.github.com' });
  });

  it('uses the profile email for unlicensed users and refuses without one', () => {
    expect(
      computeCommitAuthor({
        displayName: 'Bob',
        licensed: false,
        email: 'bob@example.com',
      }),
    ).toEqual({ name: 'Bob', email: 'bob@example.com' });
    expect(() =>
      computeCommitAuthor({ displayName: 'Bob', licensed: false }),
    ).toThrow(NotAllowedError);
  });

  it('adds co-author trailers and drops forged ones', () => {
    const message = buildCommitMessage(
      'docs: fix\n\nCo-authored-by: Mallory <m@evil.test>',
      [{ displayName: 'Ada', commitEmail: '1+ada@users.noreply.github.com' }],
    );
    expect(message).toBe(
      'docs: fix\n\nCo-authored-by: Ada <1+ada@users.noreply.github.com>',
    );
  });
});

describe('approvals', () => {
  const authors = [
    { userEntityRef: 'user:default/ada', displayName: 'Ada', licensed: true },
  ];

  it('only counts approvals for the current head, once per user', () => {
    const approvals = [
      approval('bob', 'old'),
      approval('bob', 'new'),
      approval('bob', 'new'),
      approval('eve', 'new'),
    ];
    expect(currentApprovals(approvals, 'new')).toHaveLength(2);
    expect(approvalThresholdMet(approvals, 'new', 2)).toBe(true);
    expect(approvalThresholdMet(approvals, 'old', 2)).toBe(false);
  });

  it('applies four-eyes and reports the reason', () => {
    const base = {
      status: 'open' as const,
      authors,
      approvals: [approval('bob', 'h')],
      headSha: 'h',
    };
    expect(
      approveBlockedReason({ ...base, userEntityRef: 'user:default/ada' }),
    ).toBe('author');
    expect(
      approveBlockedReason({ ...base, userEntityRef: 'user:default/bob' }),
    ).toBe('already-approved');
    expect(
      approveBlockedReason({ ...base, userEntityRef: 'user:default/eve' }),
    ).toBeUndefined();
    expect(
      approveBlockedReason({
        ...base,
        status: 'merged',
        userEntityRef: 'user:default/eve',
      }),
    ).toBe('not-open');
  });

  it('keeps status descriptions within the GitHub limit', () => {
    expect(failureDescription('x'.repeat(500)).length).toBeLessThanOrEqual(140);
  });
});

describe('metadata block', () => {
  it('round trips and cannot close the HTML comment', () => {
    const metadata = {
      v: 1 as const,
      id: 'id-1',
      entityRef: 'component:default/handbook',
      path: 'a --> b.md',
      kind: 'edit' as const,
      authors: [
        { displayName: '</p> Ada', licensed: true, githubLogin: 'ada' },
      ],
      approvals: [approval('bob', 'h')],
    };
    const encoded = encodeMetadata(metadata);
    expect(encoded.slice(4, -4)).not.toContain('-->');
    expect(decodeMetadata(`Some text\n\n${encoded}\n`)).toEqual(metadata);
    expect(decodeMetadata('no metadata here')).toBeUndefined();
  });
});

describe('pullRequestTitle', () => {
  it('adds the docs type only when the title has no Conventional Commits type', () => {
    expect(pullRequestTitle('Explain glossary terms')).toBe(
      'docs: Explain glossary terms',
    );
    expect(pullRequestTitle('docs: explain glossary terms')).toBe(
      'docs: explain glossary terms',
    );
    expect(pullRequestTitle('fix(onboarding)!: correct a link')).toBe(
      'fix(onboarding)!: correct a link',
    );
  });
});
