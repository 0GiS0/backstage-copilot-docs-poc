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

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Button from '@material-ui/core/Button';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import { makeStyles } from '@material-ui/core/styles';
import Alert from '@material-ui/lab/Alert';
import {
  Content,
  ErrorPanel,
  Link,
  Progress,
} from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import type { PageContent } from '@internal/backstage-plugin-docs-studio-common';
import { docsStudioApiRef, ProposalConflictError } from '../../api';
import { useAsyncValue } from '../../hooks/useAsyncValue';
import { useDocsStudioPaths } from '../../hooks/useDocsStudioPaths';
import { strings } from '../../strings';
import { DocsStudioEditor } from '../Editor';
import type { DocsStudioEditorChange, DocsStudioEditorHandle } from '../Editor';
import { useStableId } from '../common/useStableId';
import { ConflictDialog } from './ConflictDialog';
import { useEditorAssets } from './useEditorAssets';

const useStyles = makeStyles(theme => ({
  stack: { display: 'flex', flexDirection: 'column', gap: theme.spacing(2) },
  actions: { display: 'flex', flexWrap: 'wrap', gap: theme.spacing(1) },
}));

interface EditViewProps {
  page: PageContent;
  proposalId?: string;
  onReload: () => void;
}

function EditView({ page, proposalId, onReload }: EditViewProps) {
  const classes = useStyles();
  const api = useApi(docsStudioApiRef);
  const paths = useDocsStudioPaths();
  const navigate = useNavigate();
  const editorRef = useRef<DocsStudioEditorHandle>(null);
  const messageId = useStableId('docs-studio-edit-message');
  const [change, setChange] = useState<DocsStudioEditorChange>({
    markdown: page.content,
    dirty: false,
  });
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [conflict, setConflict] = useState<ProposalConflictError>();

  const targetProposalId = proposalId ?? page.openProposal?.id;
  const assets = useEditorAssets({
    api,
    entityRef: page.entityRef,
    pagePath: page.path,
    assetsDir: page.assetsDir,
    proposalId: targetProposalId,
  });

  useEffect(() => {
    if (!change.dirty) {
      return undefined;
    }
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [change.dirty]);

  const hasPendingAssets = assets.pendingCount > 0;
  const canSubmit =
    !submitting &&
    !change.frontmatterError &&
    (change.dirty || hasPendingAssets);

  const submit = async () => {
    const markdown = editorRef.current?.getMarkdown() ?? change.markdown;
    const trimmedMessage = message.trim();
    const uploads = assets.collectAssets(markdown);
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      const result = targetProposalId
        ? await api.commitToProposal(targetProposalId, {
            content: markdown,
            baseSha: page.sha,
            assets: uploads.length ? uploads : undefined,
            message: trimmedMessage || undefined,
          })
        : await api.createProposal({
            entityRef: page.entityRef,
            kind: 'edit',
            path: page.path,
            content: markdown,
            baseSha: page.sha,
            message: trimmedMessage || undefined,
            title: trimmedMessage || undefined,
            assets: uploads.length ? uploads : undefined,
          });
      setChange(previous => ({ ...previous, dirty: false }));
      navigate(paths.proposal(result.id));
    } catch (error) {
      if (error instanceof ProposalConflictError) {
        setConflict(error);
      } else {
        setSubmitError(
          error instanceof Error ? error.message : strings.edit.submitError,
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const showJoinNotice = !proposalId && page.openProposal;

  return (
    <div className={classes.stack}>
      {proposalId && (
        <Alert severity="info">{strings.edit.editingProposal}</Alert>
      )}
      {showJoinNotice && (
        <Alert
          severity="info"
          action={
            <Link to={paths.proposal(page.openProposal!.id)}>
              {strings.edit.viewExistingProposal}
            </Link>
          }
        >
          {strings.edit.existingProposalNotice}
        </Alert>
      )}
      <DocsStudioEditor
        ref={editorRef}
        initialMarkdown={page.content}
        onChange={setChange}
        imageResolver={assets.imageResolver}
        onUploadImage={assets.onUploadImage}
      />
      {hasPendingAssets && (
        <Typography variant="caption" color="textSecondary">
          {strings.edit.pendingImages(assets.pendingCount)}
        </Typography>
      )}
      <TextField
        id={messageId}
        variant="outlined"
        size="small"
        fullWidth
        label={strings.edit.messageLabel}
        helperText={strings.edit.messageHelp}
        placeholder={strings.edit.messagePlaceholder}
        value={message}
        onChange={event => setMessage(event.target.value)}
        inputProps={{ maxLength: 200 }}
      />
      {change.frontmatterError && (
        <Alert severity="warning">{strings.edit.frontmatterInvalid}</Alert>
      )}
      {submitError && <Alert severity="error">{submitError}</Alert>}
      <div className={classes.actions}>
        <Button
          variant="contained"
          color="primary"
          disabled={!canSubmit}
          onClick={submit}
        >
          {submitting ? strings.edit.submitting : strings.edit.submit}
        </Button>
        <Button onClick={() => navigate(-1)} disabled={submitting}>
          {strings.edit.cancel}
        </Button>
      </div>
      <ConflictDialog
        open={Boolean(conflict)}
        yourMarkdown={editorRef.current?.getMarkdown() ?? change.markdown}
        currentContent={conflict?.currentContent}
        onClose={() => setConflict(undefined)}
        onReload={() => {
          setConflict(undefined);
          onReload();
        }}
      />
    </div>
  );
}

/** Loads a page (from the default branch or a proposal branch) and edits it. */
export function EditPage() {
  const api = useApi(docsStudioApiRef);
  const paths = useDocsStudioPaths();
  const [params] = useSearchParams();
  const entityRef = params.get('entityRef');
  const docPath = params.get('docPath') ?? '';
  const proposalId = params.get('proposalId') ?? undefined;
  const [generation, setGeneration] = useState(0);
  const [joinId, setJoinId] = useState<string>();
  const readFrom = proposalId ?? joinId;

  const { value, error, loading, retry } = useAsyncValue(
    () =>
      entityRef
        ? api.getPage({ entityRef, docPath, proposalId: readFrom })
        : Promise.reject(new Error(strings.edit.missingParams)),
    [api, entityRef, docPath, readFrom],
  );

  // When the page already has an open proposal, edit that branch's version so
  // the base SHA matches the branch the commit will land on.
  const openProposalId = value?.openProposal?.id;
  const needsJoin = !readFrom && Boolean(openProposalId);
  useEffect(() => {
    if (needsJoin) {
      setJoinId(openProposalId);
    }
  }, [needsJoin, openProposalId]);

  const reload = useCallback(() => {
    setGeneration(n => n + 1);
    retry();
  }, [retry]);

  if (!entityRef) {
    return (
      <Content>
        <Alert severity="error">{strings.edit.missingParams}</Alert>
        <Link to={paths.root}>{strings.detail.back}</Link>
      </Content>
    );
  }
  if (error) {
    return (
      <Content>
        <ErrorPanel title={strings.edit.loadError} error={error} />
      </Content>
    );
  }
  if (!value || loading || needsJoin) {
    return (
      <Content>
        <Progress />
      </Content>
    );
  }

  return (
    <Content>
      <EditView
        key={`${value.sha}-${generation}`}
        page={value}
        proposalId={proposalId}
        onReload={reload}
      />
    </Content>
  );
}
