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

import { AuditorService, HttpAuthService } from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import express, { NextFunction, Request, Response } from 'express';
import Router from 'express-promise-router';
import { ContentConflictError } from './github/errors';
import { ProposalListQuery, ProposalService } from './service/ProposalService';
import {
  parseApproveRequest,
  parseCommitRequest,
  parseCreateRequest,
  parseEntityRefParam,
  parsePagePath,
  parseRequestChangesRequest,
} from './service/validation';

export interface RouterOptions {
  service: ProposalService;
  httpAuth: HttpAuthService;
  auditor: AuditorService;
  /** Largest accepted request body, in megabytes. */
  maxBodyMb: number;
}

function queryString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new InputError(`${name} must be a single string`);
  }
  return value;
}

function oneOf<T extends string>(
  value: unknown,
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const text = queryString(value, name);
  if (text === undefined) {
    return fallback;
  }
  if (!(allowed as readonly string[]).includes(text)) {
    throw new InputError(`${name} must be one of: ${allowed.join(', ')}`);
  }
  return text as T;
}

export async function createRouter(options: RouterOptions) {
  const { service, httpAuth, auditor, maxBodyMb } = options;
  const router = Router();
  router.use(express.json({ limit: `${Math.ceil(maxBodyMb)}mb` }));

  const credentialsOf = (req: Request) =>
    httpAuth.credentials(req, { allow: ['user'] });

  /** Runs a mutation and records it in the audit log, without request content. */
  async function audited<T>(
    req: Request,
    eventId: string,
    meta: Record<string, string>,
    fn: () => Promise<T>,
  ): Promise<T> {
    const event = await auditor.createEvent({ eventId, request: req, meta });
    try {
      const result = await fn();
      await event.success();
      return result;
    } catch (error) {
      await event.fail({ error: error as Error });
      throw error;
    }
  }

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/me', async (req, res) => {
    res.json(await service.getIdentity(await credentialsOf(req)));
  });

  router.get('/page', async (req, res) => {
    const credentials = await credentialsOf(req);
    const docPath = req.query.docPath;
    res.json(
      await service.getPage(credentials, {
        entityRef: parseEntityRefParam(req.query.entityRef),
        docPath: typeof docPath === 'string' ? docPath : '',
        proposalId: queryString(req.query.proposalId, 'proposalId'),
      }),
    );
  });

  router.get('/asset', async (req, res) => {
    const credentials = await credentialsOf(req);
    const { bytes, contentType } = await service.getAsset(credentials, {
      entityRef: parseEntityRefParam(req.query.entityRef),
      path: queryString(req.query.path, 'path') ?? '',
      proposalId: queryString(req.query.proposalId, 'proposalId'),
    });
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(bytes);
  });

  router.get('/proposals', async (req, res) => {
    const credentials = await credentialsOf(req);
    const path = queryString(req.query.path, 'path');
    const query: ProposalListQuery = {
      entityRef:
        queryString(req.query.entityRef, 'entityRef') === undefined
          ? undefined
          : parseEntityRefParam(req.query.entityRef),
      path: path === undefined ? undefined : parsePagePath(path),
      scope: oneOf(
        req.query.scope,
        'scope',
        ['mine', 'toApprove', 'all'],
        'all',
      ),
      status: oneOf(
        req.query.status,
        'status',
        ['open', 'closed', 'any'],
        'open',
      ),
    };
    res.json({ items: await service.listProposals(credentials, query) });
  });

  router.get('/proposals/:id', async (req, res) => {
    res.json(
      await service.getProposal(await credentialsOf(req), req.params.id),
    );
  });

  router.post('/proposals', async (req, res) => {
    const credentials = await credentialsOf(req);
    const body = parseCreateRequest(req.body);
    const { proposal, created } = await audited(
      req,
      'proposal-create',
      { entityRef: body.entityRef, path: body.path },
      () => service.createProposal(credentials, body),
    );
    res.status(created ? 201 : 200).json(proposal);
  });

  router.post('/proposals/:id/commits', async (req, res) => {
    const credentials = await credentialsOf(req);
    const body = parseCommitRequest(req.body);
    res.json(
      await audited(req, 'proposal-commit', { proposalId: req.params.id }, () =>
        service.commit(credentials, req.params.id, body),
      ),
    );
  });

  router.post('/proposals/:id/approve', async (req, res) => {
    const credentials = await credentialsOf(req);
    const body = parseApproveRequest(req.body);
    const { proposal, mergeError } = await audited(
      req,
      'proposal-approve',
      { proposalId: req.params.id },
      () => service.approve(credentials, req.params.id, body),
    );
    res.json(mergeError ? { ...proposal, mergeError } : proposal);
  });

  router.post('/proposals/:id/request-changes', async (req, res) => {
    const credentials = await credentialsOf(req);
    const body = parseRequestChangesRequest(req.body);
    res.json(
      await audited(
        req,
        'proposal-request-changes',
        { proposalId: req.params.id },
        () => service.requestChanges(credentials, req.params.id, body),
      ),
    );
  });

  router.post('/proposals/:id/merge', async (req, res) => {
    const credentials = await credentialsOf(req);
    res.json(
      await audited(req, 'proposal-merge', { proposalId: req.params.id }, () =>
        service.merge(credentials, req.params.id),
      ),
    );
  });

  router.post('/proposals/:id/discard', async (req, res) => {
    const credentials = await credentialsOf(req);
    res.json(
      await audited(
        req,
        'proposal-discard',
        { proposalId: req.params.id },
        () => service.discard(credentials, req.params.id),
      ),
    );
  });

  // Conflicts carry the current file so the editor can offer a diff. The
  // standard error shape is kept and the extra fields are added next to it.
  router.use(
    (error: Error, _req: Request, res: Response, next: NextFunction) => {
      if (!(error instanceof ContentConflictError)) {
        next(error);
        return;
      }
      res.status(409).json({
        error: { name: 'ConflictError', message: error.message },
        response: { statusCode: 409 },
        currentSha: error.currentSha,
        currentContent: error.currentContent,
      });
    },
  );

  return router;
}
