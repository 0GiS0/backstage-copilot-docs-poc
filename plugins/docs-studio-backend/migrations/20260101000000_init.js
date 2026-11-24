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

// @ts-check

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('proposals', table => {
    table.comment(
      'Documentation change proposals, one per GitHub pull request',
    );
    table.string('id', 36).primary();
    table.string('entity_ref', 512).notNullable();
    table
      .string('path', 1024)
      .notNullable()
      .comment('Relative to the docs dir');
    table.string('kind', 16).notNullable();
    table.text('title').notNullable();
    table.text('description').nullable();
    table.string('status', 32).notNullable();
    table.string('source', 32).notNullable();
    table.string('created_by_ref', 512).nullable();
    table.string('created_by_name', 512).notNullable();
    table.string('repo_host', 255).notNullable();
    table.string('repo_owner', 255).notNullable();
    table.string('repo_name', 255).notNullable();
    table.string('default_branch', 255).notNullable();
    table.string('branch', 512).notNullable();
    table.integer('pr_number').notNullable();
    table.text('pr_url').notNullable();
    table.string('head_sha', 64).notNullable();
    table.string('check_state', 16).notNullable();
    table.integer('required_approvals').notNullable();
    table.string('created_at', 32).notNullable();
    table.string('updated_at', 32).notNullable();
    table.index(['entity_ref'], 'proposals_entity_ref_idx');
    table.index(['status'], 'proposals_status_idx');
    table.unique(['repo_host', 'repo_owner', 'repo_name', 'pr_number'], {
      indexName: 'proposals_pr_idx',
    });
  });

  // At most one active proposal per page.
  await knex.schema.raw(
    `CREATE UNIQUE INDEX proposals_active_page_idx ON proposals (entity_ref, path) WHERE status IN ('open', 'changes_requested', 'approved')`,
  );

  await knex.schema.createTable('proposal_authors', table => {
    table.increments('id').primary();
    table
      .string('proposal_id', 36)
      .notNullable()
      .references('id')
      .inTable('proposals')
      .onDelete('CASCADE');
    table.string('user_entity_ref', 512).nullable();
    table.string('display_name', 512).notNullable();
    table.boolean('licensed').notNullable();
    table.string('github_login', 255).nullable();
    table
      .string('commit_email', 512)
      .nullable()
      .comment('Email used to attribute commits and co-author trailers');
    table.integer('position').notNullable().comment('0 is the creator');
    table.index(['proposal_id'], 'proposal_authors_proposal_idx');
  });

  await knex.schema.createTable('proposal_approvals', table => {
    table.increments('id').primary();
    table
      .string('proposal_id', 36)
      .notNullable()
      .references('id')
      .inTable('proposals')
      .onDelete('CASCADE');
    table.string('user_entity_ref', 512).notNullable();
    table.string('display_name', 512).notNullable();
    table.string('sha', 64).notNullable();
    table.text('comment').nullable();
    table.string('created_at', 32).notNullable();
    table.index(['proposal_id'], 'proposal_approvals_proposal_idx');
    table.unique(['proposal_id', 'user_entity_ref', 'sha'], {
      indexName: 'proposal_approvals_unique_idx',
    });
  });

  await knex.schema.createTable('proposal_events', table => {
    table.string('id', 36).primary();
    table
      .string('proposal_id', 36)
      .notNullable()
      .references('id')
      .inTable('proposals')
      .onDelete('CASCADE');
    table.string('type', 32).notNullable();
    table.string('actor_ref', 512).nullable();
    table.string('actor_name', 512).nullable();
    table.boolean('actor_licensed').nullable();
    table.string('actor_login', 255).nullable();
    table.string('sha', 64).nullable();
    table.text('message').nullable();
    table.string('created_at', 32).notNullable();
    table.index(['proposal_id'], 'proposal_events_proposal_idx');
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTable('proposal_events');
  await knex.schema.dropTable('proposal_approvals');
  await knex.schema.dropTable('proposal_authors');
  await knex.schema.dropTable('proposals');
};
