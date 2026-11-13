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
import { useParams } from 'react-router-dom';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import Grid from '@material-ui/core/Grid';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Paper from '@material-ui/core/Paper';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import { makeStyles } from '@material-ui/core/styles';
import {
  Content,
  ErrorPanel,
  Link,
  LinkButton,
  Progress,
} from '@backstage/core-components';
import { parseEntityRef } from '@backstage/catalog-model';
import { alertApiRef, useApi } from '@backstage/frontend-plugin-api';
import type {
  ProposalDetail,
  ProposalFile,
} from '@internal/backstage-plugin-docs-studio-common';
import { docsStudioApiRef } from '../../api';
import { useAsyncValue } from '../../hooks/useAsyncValue';
import { useDocsStudioIdentity } from '../../hooks/useDocsStudioIdentity';
import { useDocsStudioPaths } from '../../hooks/useDocsStudioPaths';
import { strings } from '../../strings';
import { docPathFromFilePath } from '../../utils/paths';
import {
  AuthorChips,
  CheckStateChip,
  formatDateTime,
  StatusChip,
} from '../common/chips';
import { DiffView } from '../common/DiffView';

const useStyles = makeStyles(theme => ({
  header: { marginBottom: theme.spacing(2) },
  meta: { display: 'flex', flexWrap: 'wrap', gap: theme.spacing(1, 2) },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
    margin: theme.spacing(2, 0, 0.5),
  },
  hint: { color: theme.palette.text.secondary },
  section: { padding: theme.spacing(2), marginBottom: theme.spacing(2) },
  file: { marginBottom: theme.spacing(2) },
  fileTitle: { marginBottom: theme.spacing(1) },
}));

type Action = 'approve' | 'requestChanges' | 'merge' | 'discard';

function FileDiff(props: { file: ProposalFile }) {
  const classes = useStyles();
  const { file } = props;
  const statusLabel = {
    added: strings.detail.fileAdded,
    modified: strings.detail.fileModified,
    removed: strings.detail.fileRemoved,
  }[file.status];

  return (
    <div className={classes.file}>
      <Typography variant="subtitle2" className={classes.fileTitle}>
        {file.path} · {statusLabel}
      </Typography>
      {file.binary ? (
        <Typography variant="body2" color="textSecondary">
          {strings.detail.binaryFile}
        </Typography>
      ) : (
        <DiffView
          label={file.path}
          before={file.status === 'added' ? '' : file.baseContent ?? ''}
          after={file.status === 'removed' ? '' : file.headContent ?? ''}
        />
      )}
    </div>
  );
}

function ProposalDetailView(props: { id: string }) {
  const classes = useStyles();
  const api = useApi(docsStudioApiRef);
  const alertApi = useApi(alertApiRef);
  const paths = useDocsStudioPaths();
  const identity = useDocsStudioIdentity();
  const { value, error, loading } = useAsyncValue(
    () => api.getProposal(props.id),
    [api, props.id],
  );
  const [updated, setUpdated] = useState<ProposalDetail>();
  const [busy, setBusy] = useState<Action>();
  const [changesDialogOpen, setChangesDialogOpen] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [comment, setComment] = useState('');

  const proposal = updated ?? value;

  const run = async (
    action: Action,
    call: () => Promise<ProposalDetail & { mergeError?: string }>,
    successMessage: string,
  ) => {
    setBusy(action);
    try {
      const result = await call();
      setUpdated(result);
      if (result.mergeError) {
        alertApi.post({
          message: strings.detail.mergeFailedAfterApproval(result.mergeError),
          severity: 'warning',
        });
      } else {
        alertApi.post({
          message: successMessage,
          severity: 'success',
          display: 'transient',
        });
      }
    } catch (e) {
      alertApi.post({
        message: e instanceof Error ? e.message : strings.unknownError,
        severity: 'error',
      });
    } finally {
      setBusy(undefined);
    }
  };

  if (error) {
    return (
      <Content>
        <ErrorPanel title={strings.detail.loadError} error={error} />
      </Content>
    );
  }
  if (!proposal) {
    return <Content>{loading && <Progress />}</Content>;
  }

  const { permissions } = proposal;
  const isFinished =
    proposal.status === 'merged' || proposal.status === 'closed';
  const blockedReason =
    !permissions.canApprove && permissions.approveBlockedReason
      ? strings.detail.approveBlocked[permissions.approveBlockedReason]
      : undefined;
  const entityName = (() => {
    try {
      return parseEntityRef(proposal.entityRef).name;
    } catch {
      return proposal.entityRef;
    }
  })();
  const anyBusy = busy !== undefined;

  return (
    <Content>
      <div className={classes.header}>
        <Link to={paths.root}>{strings.detail.back}</Link>
      </div>
      <Paper className={classes.section}>
        <Typography variant="h5" component="h2" gutterBottom>
          {proposal.title}
        </Typography>
        <div className={classes.meta}>
          <StatusChip status={proposal.status} />
          <CheckStateChip state={proposal.checkState} />
          <Typography variant="body2">
            {strings.detail.approvals(
              proposal.approvals.length,
              proposal.requiredApprovals,
            )}
          </Typography>
        </div>
        <Grid container spacing={2} style={{ marginTop: 8 }}>
          <Grid item xs={12} md={6}>
            <Typography variant="body2">
              <strong>{strings.detail.page}:</strong> {proposal.path}
            </Typography>
            <Typography variant="body2">
              <strong>{strings.detail.entity}:</strong> {entityName}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {formatDateTime(proposal.updatedAt)}
            </Typography>
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="body2" component="div">
              <strong>{strings.author.authors}:</strong>{' '}
              <AuthorChips authors={proposal.authors} />
            </Typography>
          </Grid>
        </Grid>
        {proposal.description && (
          <Typography variant="body2" style={{ marginTop: 8 }}>
            {proposal.description}
          </Typography>
        )}

        <div className={classes.actions} role="group">
          <Button
            variant="contained"
            color="primary"
            disabled={!permissions.canApprove || anyBusy}
            onClick={() =>
              run(
                'approve',
                () => api.approve(proposal.id),
                strings.detail.approveDone,
              )
            }
          >
            {strings.detail.approve}
          </Button>
          <Button
            variant="outlined"
            disabled={!permissions.canApprove || anyBusy}
            onClick={() => {
              setComment('');
              setChangesDialogOpen(true);
            }}
          >
            {strings.detail.requestChanges}
          </Button>
          {permissions.canMerge && !isFinished && (
            <Button
              variant="contained"
              color="primary"
              disabled={anyBusy}
              onClick={() =>
                run(
                  'merge',
                  () => api.merge(proposal.id),
                  strings.detail.mergeDone,
                )
              }
            >
              {strings.detail.merge}
            </Button>
          )}
          {permissions.canEdit && !isFinished && (
            <LinkButton
              variant="outlined"
              to={paths.edit({
                entityRef: proposal.entityRef,
                docPath: docPathFromFilePath(proposal.path),
                proposalId: proposal.id,
              })}
            >
              {strings.detail.editProposal}
            </LinkButton>
          )}
          <Button
            variant="outlined"
            disabled={!permissions.canDiscard || anyBusy}
            onClick={() => setDiscardDialogOpen(true)}
          >
            {strings.detail.discard}
          </Button>
          {identity.value?.licensed && (
            <Button
              variant="text"
              component="a"
              href={proposal.prUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {strings.detail.viewOnGithub}
            </Button>
          )}
        </div>
        {blockedReason && (
          <Typography variant="caption" className={classes.hint}>
            {blockedReason}
          </Typography>
        )}
      </Paper>

      <Paper className={classes.section}>
        <Typography variant="h6" component="h3" gutterBottom>
          {strings.detail.changesTitle}
        </Typography>
        {proposal.files.length === 0 ? (
          <Typography variant="body2" color="textSecondary">
            {strings.detail.noChanges}
          </Typography>
        ) : (
          proposal.files.map(file => <FileDiff key={file.path} file={file} />)
        )}
      </Paper>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Paper className={classes.section}>
            <Typography variant="h6" component="h3">
              {strings.detail.approvalsTitle}
            </Typography>
            {proposal.approvals.length === 0 ? (
              <Typography variant="body2" color="textSecondary">
                {strings.detail.noApprovals}
              </Typography>
            ) : (
              <List dense>
                {proposal.approvals.map(approval => (
                  <ListItem key={`${approval.userEntityRef}-${approval.sha}`}>
                    <ListItemText
                      primary={strings.detail.approvedBy(approval.displayName)}
                      secondary={[
                        formatDateTime(approval.createdAt),
                        approval.comment,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper className={classes.section}>
            <Typography variant="h6" component="h3">
              {strings.detail.eventsTitle}
            </Typography>
            <List dense>
              {proposal.events.map(event => (
                <ListItem key={event.id}>
                  <ListItemText
                    primary={[
                      strings.detail.eventType[event.type],
                      event.actor?.displayName,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    secondary={[formatDateTime(event.createdAt), event.message]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>
      </Grid>

      <Dialog
        open={changesDialogOpen}
        onClose={() => setChangesDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="request-changes-title"
      >
        <DialogTitle id="request-changes-title">
          {strings.detail.requestChangesDialogTitle}
        </DialogTitle>
        <DialogContent>
          <TextField
            // Moving focus to the comment field is expected when a dialog opens.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            multiline
            minRows={3}
            fullWidth
            variant="outlined"
            label={strings.detail.requestChangesComment}
            helperText={strings.detail.requestChangesHelp}
            value={comment}
            onChange={event => setComment(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChangesDialogOpen(false)}>
            {strings.cancel}
          </Button>
          <Button
            color="primary"
            variant="contained"
            disabled={!comment.trim() || anyBusy}
            onClick={async () => {
              setChangesDialogOpen(false);
              await run(
                'requestChanges',
                () => api.requestChanges(proposal.id, comment.trim()),
                strings.detail.requestChangesDone,
              );
            }}
          >
            {strings.detail.requestChangesSubmit}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={discardDialogOpen}
        onClose={() => setDiscardDialogOpen(false)}
        aria-labelledby="discard-title"
      >
        <DialogTitle id="discard-title">
          {strings.detail.discardDialogTitle}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {strings.detail.discardDialogBody}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiscardDialogOpen(false)}>
            {strings.cancel}
          </Button>
          <Button
            color="secondary"
            variant="contained"
            disabled={anyBusy}
            onClick={async () => {
              setDiscardDialogOpen(false);
              await run(
                'discard',
                () => api.discard(proposal.id),
                strings.detail.discardDone,
              );
            }}
          >
            {strings.detail.discardConfirm}
          </Button>
        </DialogActions>
      </Dialog>
    </Content>
  );
}

/** Review screen for a single proposal: diff, approvals and actions. */
export function ProposalDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return null;
  }
  return <ProposalDetailView key={id} id={id} />;
}

export { ProposalDetailView };
