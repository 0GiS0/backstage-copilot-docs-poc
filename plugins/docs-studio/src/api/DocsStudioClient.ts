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

import type { DiscoveryApi, FetchApi } from '@backstage/frontend-plugin-api';
import type {
  CreateProposalRequest,
  DocsStudioIdentity,
  PageContent,
  ProposalDetail,
  ProposalSummary,
} from '@internal/backstage-plugin-docs-studio-common';
import type {
  ApproveResult,
  AssetQuery,
  CommitToProposalRequest,
  DocsStudioApi,
  ListProposalsQuery,
  PageQuery,
} from './DocsStudioApi';
import { DocsStudioApiError, ProposalConflictError } from './errors';

type QueryValue = string | undefined;

function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, value);
    }
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
}

async function readErrorBody(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function toError(response: Response): Promise<DocsStudioApiError> {
  const body = await readErrorBody(response);
  const message =
    body?.error?.message ??
    (typeof body?.error === 'string' ? body.error : undefined) ??
    `${response.status} ${response.statusText}`.trim();
  if (response.status === 409) {
    return new ProposalConflictError(message, {
      currentSha: body?.currentSha,
      currentContent: body?.currentContent,
    });
  }
  return new DocsStudioApiError(response.status, message);
}

/**
 * Default {@link DocsStudioApi} implementation backed by the Docs Studio
 * backend plugin.
 *
 * @public
 */
export class DocsStudioClient implements DocsStudioApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  getMe(): Promise<DocsStudioIdentity> {
    return this.requestJson('/me');
  }

  getPage(query: PageQuery): Promise<PageContent> {
    return this.requestJson(
      `/page${buildQuery({
        entityRef: query.entityRef,
        docPath: query.docPath,
        proposalId: query.proposalId,
      })}`,
    );
  }

  async getAsset(query: AssetQuery): Promise<Blob> {
    const response = await this.request(
      `/asset${buildQuery({
        entityRef: query.entityRef,
        path: query.path,
        proposalId: query.proposalId,
      })}`,
    );
    return response.blob();
  }

  async listProposals(
    query: ListProposalsQuery = {},
  ): Promise<ProposalSummary[]> {
    const result = await this.requestJson<{ items: ProposalSummary[] }>(
      `/proposals${buildQuery({
        entityRef: query.entityRef,
        path: query.path,
        scope: query.scope,
        status: query.status,
      })}`,
    );
    return result.items;
  }

  getProposal(id: string): Promise<ProposalDetail> {
    return this.requestJson(`/proposals/${encodeURIComponent(id)}`);
  }

  createProposal(request: CreateProposalRequest): Promise<ProposalDetail> {
    return this.postJson('/proposals', request);
  }

  commitToProposal(
    id: string,
    request: CommitToProposalRequest,
  ): Promise<ProposalDetail> {
    return this.postJson(
      `/proposals/${encodeURIComponent(id)}/commits`,
      request,
    );
  }

  approve(id: string, comment?: string): Promise<ApproveResult> {
    return this.postJson(
      `/proposals/${encodeURIComponent(id)}/approve`,
      comment ? { comment } : {},
    );
  }

  requestChanges(id: string, comment: string): Promise<ProposalDetail> {
    return this.postJson(
      `/proposals/${encodeURIComponent(id)}/request-changes`,
      { comment },
    );
  }

  merge(id: string): Promise<ProposalDetail> {
    return this.postJson(`/proposals/${encodeURIComponent(id)}/merge`, {});
  }

  discard(id: string): Promise<ProposalDetail> {
    return this.postJson(`/proposals/${encodeURIComponent(id)}/discard`, {});
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const baseUrl = await this.discoveryApi.getBaseUrl('docs-studio');
    const response = await this.fetchApi.fetch(`${baseUrl}${path}`, init);
    if (!response.ok) {
      throw await toError(response);
    }
    return response;
  }

  private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.request(path, init);
    return (await response.json()) as T;
  }

  private postJson<T>(path: string, body: unknown): Promise<T> {
    return this.requestJson<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
}
