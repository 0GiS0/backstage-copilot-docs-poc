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

import { useState } from 'react';
import Tab from '@material-ui/core/Tab';
import Tabs from '@material-ui/core/Tabs';
import Typography from '@material-ui/core/Typography';
import {
  Content,
  ErrorPanel,
  Link,
  Table,
  TableColumn,
} from '@backstage/core-components';
import { parseEntityRef } from '@backstage/catalog-model';
import { useApi } from '@backstage/frontend-plugin-api';
import type { ProposalSummary } from '@internal/backstage-plugin-docs-studio-common';
import { docsStudioApiRef, ListProposalsQuery } from '../../api';
import { useAsyncValue } from '../../hooks/useAsyncValue';
import { useDocsStudioPaths } from '../../hooks/useDocsStudioPaths';
import { strings } from '../../strings';
import {
  AuthorChips,
  CheckStateChip,
  formatDateTime,
  StatusChip,
} from '../common/chips';

type Scope = NonNullable<ListProposalsQuery['scope']>;

const TABS: Array<{ scope: Scope; label: string }> = [
  { scope: 'mine', label: strings.list.tabMine },
  { scope: 'toApprove', label: strings.list.tabToApprove },
  { scope: 'all', label: strings.list.tabAll },
];

function entityLabel(entityRef: string): string {
  try {
    return parseEntityRef(entityRef).name;
  } catch {
    return entityRef;
  }
}

/** Landing page: proposals grouped by the user's relationship to them. */
export function ProposalListPage() {
  const api = useApi(docsStudioApiRef);
  const paths = useDocsStudioPaths();
  const [scope, setScope] = useState<Scope>('mine');
  const { value, error, loading } = useAsyncValue(
    () => api.listProposals({ scope, status: 'any' }),
    [api, scope],
  );

  const columns: TableColumn<ProposalSummary>[] = [
    {
      title: strings.list.columns.title,
      field: 'title',
      highlight: true,
      render: row => <Link to={paths.proposal(row.id)}>{row.title}</Link>,
    },
    {
      title: strings.list.columns.page,
      field: 'path',
      render: row => (
        <>
          <div>{row.path}</div>
          <Typography variant="caption" color="textSecondary">
            {row.kind === 'create'
              ? strings.list.kindCreate
              : strings.list.kindEdit}
          </Typography>
        </>
      ),
    },
    {
      title: strings.list.columns.entity,
      field: 'entityRef',
      render: row => entityLabel(row.entityRef),
    },
    {
      title: strings.list.columns.status,
      field: 'status',
      render: row => <StatusChip status={row.status} />,
    },
    {
      title: strings.list.columns.checks,
      field: 'checkState',
      render: row => <CheckStateChip state={row.checkState} />,
    },
    {
      title: strings.list.columns.authors,
      sorting: false,
      render: row => <AuthorChips authors={row.authors} />,
    },
    {
      title: strings.list.columns.updated,
      field: 'updatedAt',
      defaultSort: 'desc',
      render: row => formatDateTime(row.updatedAt),
    },
  ];

  return (
    <Content>
      <Tabs
        value={scope}
        onChange={(_event, next: Scope) => setScope(next)}
        indicatorColor="primary"
        textColor="primary"
        aria-label={strings.list.tabsLabel}
      >
        {TABS.map(tab => (
          <Tab key={tab.scope} value={tab.scope} label={tab.label} />
        ))}
      </Tabs>
      {error && <ErrorPanel error={error} />}
      {!error && (
        <Table<ProposalSummary>
          title={strings.list.tableTitle}
          columns={columns}
          data={value ?? []}
          isLoading={loading}
          options={{
            paging: true,
            pageSize: 10,
            search: true,
            padding: 'dense',
          }}
          localization={{
            body: { emptyDataSourceMessage: strings.list.empty },
            toolbar: { searchPlaceholder: strings.list.searchPlaceholder },
          }}
        />
      )}
    </Content>
  );
}
