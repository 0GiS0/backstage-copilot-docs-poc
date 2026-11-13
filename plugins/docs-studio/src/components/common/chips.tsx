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

import Chip from '@material-ui/core/Chip';
import { makeStyles } from '@material-ui/core/styles';
import type {
  CheckState,
  ProposalAuthor,
  ProposalStatus,
} from '@internal/backstage-plugin-docs-studio-common';
import { strings } from '../../strings';

const useStyles = makeStyles(theme => ({
  success: {
    backgroundColor: theme.palette.success?.main ?? '#2e7d32',
    color: theme.palette.success?.contrastText ?? '#fff',
  },
  warning: {
    backgroundColor: theme.palette.warning?.main ?? '#ed6c02',
    color: theme.palette.warning?.contrastText ?? '#fff',
  },
  error: {
    backgroundColor: theme.palette.error.main,
    color: theme.palette.error.contrastText,
  },
  info: {
    backgroundColor: theme.palette.info?.main ?? '#0288d1',
    color: theme.palette.info?.contrastText ?? '#fff',
  },
  author: { margin: theme.spacing(0, 0.5, 0.5, 0) },
}));

type Tone = 'success' | 'warning' | 'error' | 'info' | 'default';

const STATUS_TONE: Record<ProposalStatus, Tone> = {
  open: 'info',
  changes_requested: 'warning',
  approved: 'success',
  merged: 'success',
  closed: 'default',
};

const CHECK_TONE: Record<CheckState, Tone> = {
  pending: 'warning',
  success: 'success',
  failure: 'error',
  unknown: 'default',
};

function ToneChip(props: { label: string; tone: Tone }) {
  const classes = useStyles();
  return (
    <Chip
      size="small"
      label={props.label}
      className={props.tone === 'default' ? undefined : classes[props.tone]}
    />
  );
}

export function StatusChip(props: { status: ProposalStatus }) {
  return (
    <ToneChip
      label={strings.status[props.status]}
      tone={STATUS_TONE[props.status]}
    />
  );
}

export function CheckStateChip(props: { state: CheckState }) {
  return (
    <ToneChip
      label={strings.checkState[props.state]}
      tone={CHECK_TONE[props.state]}
    />
  );
}

export function AuthorChips(props: { authors: ProposalAuthor[] }) {
  const classes = useStyles();
  return (
    <>
      {props.authors.map(author => (
        <Chip
          key={author.userEntityRef ?? author.displayName}
          size="small"
          variant="outlined"
          className={classes.author}
          label={`${author.displayName} · ${
            author.licensed
              ? strings.author.licensed
              : strings.author.unlicensed
          }`}
        />
      ))}
    </>
  );
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-ES');
}
