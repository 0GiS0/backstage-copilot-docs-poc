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

import {
  ConflictError,
  NotAllowedError,
  NotFoundError,
  ServiceUnavailableError,
} from '@backstage/errors';

/**
 * A file changed under our feet: the sha precondition failed, or the branch
 * moved and the update was not a fast-forward.
 */
export class ShaMismatchError extends Error {
  readonly name = 'ShaMismatchError';
  constructor(message: string, readonly path?: string) {
    super(message);
  }
}

/** GitHub refused to merge, for example because a ruleset is not satisfied. */
export class MergeBlockedError extends Error {
  readonly name = 'MergeBlockedError';
}

/** A conflict response that also carries the current state of the file. */
export class ContentConflictError extends ConflictError {
  constructor(
    message: string,
    readonly currentSha?: string,
    readonly currentContent?: string,
  ) {
    super(message);
  }
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown })?.status;
  return typeof status === 'number' ? status : undefined;
}

export function isGithubStatus(error: unknown, status: number): boolean {
  return statusOf(error) === status;
}

export function githubMessage(error: unknown): string {
  const message = (error as { message?: unknown })?.message;
  // Octokit messages can embed the request documentation URL; keep the first line.
  return typeof message === 'string' ? message.split('\n')[0] : 'unknown error';
}

/** Maps an Octokit failure to a Backstage error without leaking request data. */
export function mapGithubError(error: unknown, action: string): Error {
  const status = statusOf(error);
  if (status === undefined) {
    return error instanceof Error ? error : new Error(`${action} failed`);
  }
  const detail = githubMessage(error);
  if (status === 404) {
    return new NotFoundError(`GitHub: ${action}: not found`);
  }
  if (status === 429 || (status === 403 && /rate limit/i.test(detail))) {
    return new ServiceUnavailableError(`GitHub rate limit hit while ${action}`);
  }
  if (status === 401 || status === 403) {
    return new NotAllowedError(
      `GitHub rejected the request while ${action}: ${detail}`,
    );
  }
  return new Error(
    `GitHub request failed while ${action} (${status}): ${detail}`,
  );
}
