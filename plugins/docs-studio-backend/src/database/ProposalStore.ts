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

import { isDatabaseConflictError } from '@backstage/backend-plugin-api';
import { ConflictError } from '@backstage/errors';
import {
  CheckState,
  ProposalApproval,
  ProposalEvent,
  ProposalKind,
  ProposalSource,
  ProposalStatus,
} from '@internal/backstage-plugin-docs-studio-common';
import { randomUUID } from 'node:crypto';
import { Knex } from 'knex';
import {
  ACTIVE_STATUSES,
  NewProposalRecord,
  ProposalRecord,
  StoredAuthor,
} from '../service/types';

type ProposalRow = {
  id: string;
  entity_ref: string;
  path: string;
  kind: string;
  title: string;
  description: string | null;
  status: string;
  source: string;
  created_by_ref: string | null;
  created_by_name: string;
  repo_host: string;
  repo_owner: string;
  repo_name: string;
  default_branch: string;
  branch: string;
  pr_number: number;
  pr_url: string;
  head_sha: string;
  check_state: string;
  required_approvals: number;
  created_at: string;
  updated_at: string;
};

type AuthorRow = {
  proposal_id: string;
  user_entity_ref: string | null;
  display_name: string;
  licensed: boolean | number;
  github_login: string | null;
  commit_email: string | null;
  position: number;
};

type ApprovalRow = {
  proposal_id: string;
  user_entity_ref: string;
  display_name: string;
  sha: string;
  comment: string | null;
  created_at: string;
};

type EventRow = {
  id: string;
  type: string;
  actor_ref: string | null;
  actor_name: string | null;
  actor_licensed: boolean | number | null;
  actor_login: string | null;
  sha: string | null;
  message: string | null;
  created_at: string;
};

export interface ProposalFilter {
  entityRef?: string;
  entityRefs?: string[];
  path?: string;
  /** `active` = open, changes requested or approved. */
  state?: 'active' | 'finished' | 'any';
  authorRef?: string;
}

export interface ProposalPatch {
  title?: string;
  description?: string | null;
  status?: ProposalStatus;
  headSha?: string;
  checkState?: CheckState;
  updatedAt: string;
  /** Only update when the stored head is still this commit. */
  expectedHeadSha?: string;
}

export type NewEvent = Omit<ProposalEvent, 'id' | 'createdAt'> & {
  createdAt?: string;
};

function toStoredAuthor(row: AuthorRow): StoredAuthor {
  return {
    userEntityRef: row.user_entity_ref ?? undefined,
    displayName: row.display_name,
    licensed: Boolean(row.licensed),
    githubLogin: row.github_login ?? undefined,
    commitEmail: row.commit_email ?? undefined,
  };
}

function authorRow(proposalId: string, author: StoredAuthor, position: number) {
  return {
    proposal_id: proposalId,
    user_entity_ref: author.userEntityRef ?? null,
    display_name: author.displayName,
    licensed: author.licensed,
    github_login: author.githubLogin ?? null,
    commit_email: author.commitEmail ?? null,
    position,
  };
}

/** Persistence for proposals, their authors, approvals and events. */
export class ProposalStore {
  constructor(private readonly db: Knex) {}

  /** Inserts a proposal, failing if the page already has an active one. */
  async insert(
    proposal: NewProposalRecord,
    events: NewEvent[] = [],
  ): Promise<void> {
    try {
      await this.insertInTransaction(proposal, events);
    } catch (error) {
      if (isDatabaseConflictError(error)) {
        throw new ConflictError(
          'There is already an open proposal for this page',
        );
      }
      throw error;
    }
  }

  private async insertInTransaction(
    proposal: NewProposalRecord,
    events: NewEvent[],
  ): Promise<void> {
    await this.db.transaction(async trx => {
      const existing = await trx<ProposalRow>('proposals')
        .where({ entity_ref: proposal.entityRef, path: proposal.path })
        .whereIn('status', [...ACTIVE_STATUSES])
        .first('id');
      if (existing) {
        throw new ConflictError(
          'There is already an open proposal for this page',
        );
      }
      await trx('proposals').insert({
        id: proposal.id,
        entity_ref: proposal.entityRef,
        path: proposal.path,
        kind: proposal.kind,
        title: proposal.title,
        description: proposal.description ?? null,
        status: proposal.status,
        source: proposal.source,
        created_by_ref: proposal.createdBy.userEntityRef ?? null,
        created_by_name: proposal.createdBy.displayName,
        repo_host: proposal.repoHost,
        repo_owner: proposal.repo.owner,
        repo_name: proposal.repo.name,
        default_branch: proposal.repo.defaultBranch,
        branch: proposal.branch,
        pr_number: proposal.prNumber,
        pr_url: proposal.prUrl,
        head_sha: proposal.headSha,
        check_state: proposal.checkState,
        required_approvals: proposal.requiredApprovals,
        created_at: proposal.createdAt,
        updated_at: proposal.updatedAt,
      });
      if (proposal.authors.length > 0) {
        await trx('proposal_authors').insert(
          proposal.authors.map((a, i) => authorRow(proposal.id, a, i)),
        );
      }
      for (const event of events) {
        await this.insertEvent(trx, proposal.id, event);
      }
    });
  }

  async get(id: string): Promise<ProposalRecord | undefined> {
    const row = await this.db<ProposalRow>('proposals').where({ id }).first();
    return row ? (await this.hydrate([row]))[0] : undefined;
  }

  async getByPullRequest(
    repo: { host: string; owner: string; repo: string },
    prNumber: number,
  ): Promise<ProposalRecord | undefined> {
    const row = await this.db<ProposalRow>('proposals')
      .where({
        repo_host: repo.host,
        repo_owner: repo.owner,
        repo_name: repo.repo,
        pr_number: prNumber,
      })
      .first();
    return row ? (await this.hydrate([row]))[0] : undefined;
  }

  async findActive(
    entityRef: string,
    path: string,
  ): Promise<ProposalRecord | undefined> {
    const [record] = await this.list({ entityRef, path, state: 'active' });
    return record;
  }

  async list(filter: ProposalFilter = {}): Promise<ProposalRecord[]> {
    const query = this.db<ProposalRow>('proposals').orderBy(
      'updated_at',
      'desc',
    );
    if (filter.entityRef) {
      query.where('entity_ref', filter.entityRef);
    }
    if (filter.entityRefs) {
      query.whereIn('entity_ref', filter.entityRefs);
    }
    if (filter.path !== undefined) {
      query.where('path', filter.path);
    }
    if (filter.state === 'active') {
      query.whereIn('status', [...ACTIVE_STATUSES]);
    } else if (filter.state === 'finished') {
      query.whereNotIn('status', [...ACTIVE_STATUSES]);
    }
    if (filter.authorRef) {
      query.whereIn(
        'id',
        this.db('proposal_authors')
          .where('user_entity_ref', filter.authorRef)
          .select('proposal_id'),
      );
    }
    return this.hydrate(await query);
  }

  /** Returns whether a row was updated. */
  async update(id: string, patch: ProposalPatch): Promise<boolean> {
    const values: Record<string, unknown> = { updated_at: patch.updatedAt };
    if (patch.title !== undefined) values.title = patch.title;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.status !== undefined) values.status = patch.status;
    if (patch.headSha !== undefined) values.head_sha = patch.headSha;
    if (patch.checkState !== undefined) values.check_state = patch.checkState;
    const query = this.db('proposals').where({ id });
    if (patch.expectedHeadSha !== undefined) {
      query.andWhere({ head_sha: patch.expectedHeadSha });
    }
    return (await query.update(values)) > 0;
  }

  async addAuthor(id: string, author: StoredAuthor): Promise<void> {
    const [{ count }] = await this.db('proposal_authors')
      .where({ proposal_id: id })
      .count({ count: '*' });
    await this.db('proposal_authors').insert(
      authorRow(id, author, Number(count)),
    );
  }

  async addApproval(id: string, approval: ProposalApproval): Promise<void> {
    await this.db('proposal_approvals')
      .insert({
        proposal_id: id,
        user_entity_ref: approval.userEntityRef,
        display_name: approval.displayName,
        sha: approval.sha,
        comment: approval.comment ?? null,
        created_at: approval.createdAt,
      })
      .onConflict(['proposal_id', 'user_entity_ref', 'sha'])
      .merge(['comment', 'created_at', 'display_name']);
  }

  async addEvent(id: string, event: NewEvent): Promise<void> {
    await this.insertEvent(this.db, id, event);
  }

  async listEvents(id: string): Promise<ProposalEvent[]> {
    const rows = await this.db<EventRow>('proposal_events')
      .where('proposal_id', id)
      .orderBy('created_at', 'asc');
    return rows.map(row => ({
      id: row.id,
      type: row.type as ProposalEvent['type'],
      actor: row.actor_name
        ? {
            userEntityRef: row.actor_ref ?? undefined,
            displayName: row.actor_name,
            licensed: Boolean(row.actor_licensed),
            githubLogin: row.actor_login ?? undefined,
          }
        : undefined,
      sha: row.sha ?? undefined,
      message: row.message ?? undefined,
      createdAt: row.created_at,
    }));
  }

  private async insertEvent(
    db: Knex | Knex.Transaction,
    proposalId: string,
    event: NewEvent,
  ): Promise<void> {
    await db('proposal_events').insert({
      id: randomUUID(),
      proposal_id: proposalId,
      type: event.type,
      actor_ref: event.actor?.userEntityRef ?? null,
      actor_name: event.actor?.displayName ?? null,
      actor_licensed: event.actor ? event.actor.licensed : null,
      actor_login: event.actor?.githubLogin ?? null,
      sha: event.sha ?? null,
      message: event.message ?? null,
      created_at: event.createdAt ?? new Date().toISOString(),
    });
  }

  private async hydrate(rows: ProposalRow[]): Promise<ProposalRecord[]> {
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map(r => r.id);
    const [authors, approvals] = await Promise.all([
      this.db<AuthorRow>('proposal_authors')
        .whereIn('proposal_id', ids)
        .orderBy('position', 'asc'),
      this.db<ApprovalRow>('proposal_approvals')
        .whereIn('proposal_id', ids)
        .orderBy('created_at', 'asc'),
    ]);
    return rows.map(row => {
      const rowAuthors = authors
        .filter(a => a.proposal_id === row.id)
        .map(toStoredAuthor);
      const createdBy: StoredAuthor = rowAuthors[0] ?? {
        userEntityRef: row.created_by_ref ?? undefined,
        displayName: row.created_by_name,
        licensed: false,
      };
      return {
        id: row.id,
        entityRef: row.entity_ref,
        path: row.path,
        kind: row.kind as ProposalKind,
        title: row.title,
        description: row.description ?? undefined,
        status: row.status as ProposalStatus,
        source: row.source as ProposalSource,
        createdBy,
        authors: rowAuthors,
        approvals: approvals
          .filter(a => a.proposal_id === row.id)
          .map(a => ({
            userEntityRef: a.user_entity_ref,
            displayName: a.display_name,
            sha: a.sha,
            createdAt: a.created_at,
            comment: a.comment ?? undefined,
          })),
        requiredApprovals: row.required_approvals,
        checkState: row.check_state as CheckState,
        repoHost: row.repo_host,
        repo: {
          owner: row.repo_owner,
          name: row.repo_name,
          defaultBranch: row.default_branch,
        },
        branch: row.branch,
        prNumber: row.pr_number,
        prUrl: row.pr_url,
        headSha: row.head_sha,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  }
}
