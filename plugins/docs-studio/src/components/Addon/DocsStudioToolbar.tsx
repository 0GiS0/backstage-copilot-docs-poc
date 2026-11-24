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

import { useLocation } from 'react-router-dom';
import Box from '@material-ui/core/Box';
import Button from '@material-ui/core/Button';
import { makeStyles } from '@material-ui/core/styles';
import Alert from '@material-ui/lab/Alert';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { LinkButton } from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { useTechDocsReaderPage } from '@backstage/plugin-techdocs-react';
import { docsStudioApiRef } from '../../api';
import { useAsyncValue } from '../../hooks/useAsyncValue';
import { useDocsStudioIdentity } from '../../hooks/useDocsStudioIdentity';
import { useDocsStudioPaths } from '../../hooks/useDocsStudioPaths';
import { strings } from '../../strings';
import { docPathFromLocation } from '../../utils/paths';

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing(1),
    padding: theme.spacing(0.5, 0),
  },
  banner: { flex: '1 1 auto', minWidth: 240 },
}));

/**
 * Subheader addon shown on every TechDocs page: edit/create entry points, a
 * banner when the page has an open proposal and, for licensed users only, a
 * link to the file on GitHub.
 */
export function DocsStudioToolbar() {
  const classes = useStyles();
  const api = useApi(docsStudioApiRef);
  const paths = useDocsStudioPaths();
  const { pathname } = useLocation();
  const { entityRef: compoundRef } = useTechDocsReaderPage();
  const entityRef = compoundRef ? stringifyEntityRef(compoundRef) : undefined;
  const docPath = docPathFromLocation(pathname);

  const identity = useDocsStudioIdentity();
  const page = useAsyncValue(
    async () => (entityRef ? api.getPage({ entityRef, docPath }) : undefined),
    [api, entityRef, docPath],
  );

  if (!entityRef) {
    return null;
  }

  const openProposal = page.value?.openProposal;
  const licensed = identity.value?.licensed === true;
  const editUrl = licensed ? page.value?.editUrl : undefined;

  return (
    <Box
      className={classes.root}
      role="region"
      aria-label={strings.addon.toolbarLabel}
    >
      {openProposal && (
        <Alert
          severity="info"
          className={classes.banner}
          action={
            <LinkButton
              color="inherit"
              size="small"
              to={paths.proposal(openProposal.id)}
            >
              {strings.addon.viewProposal}
            </LinkButton>
          }
        >
          {strings.addon.pendingBanner}
        </Alert>
      )}
      <LinkButton
        variant="outlined"
        color="primary"
        size="small"
        to={paths.edit({
          entityRef,
          docPath,
          proposalId: openProposal?.id,
        })}
      >
        {strings.addon.edit}
      </LinkButton>
      <LinkButton
        variant="outlined"
        color="primary"
        size="small"
        to={paths.create({
          entityRef,
          parentPath: page.value?.path ?? '',
        })}
      >
        {strings.addon.newPage}
      </LinkButton>
      {editUrl && (
        <Button
          variant="text"
          size="small"
          href={editUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {strings.addon.viewOnGithub}
        </Button>
      )}
    </Box>
  );
}
