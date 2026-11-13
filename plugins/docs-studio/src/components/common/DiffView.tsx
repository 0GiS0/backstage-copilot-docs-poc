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

import { useMemo } from 'react';
import { diffLines } from 'diff';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { strings } from '../../strings';

const useStyles = makeStyles(theme => ({
  root: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    overflow: 'auto',
    maxHeight: 520,
  },
  line: {
    display: 'flex',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    padding: theme.spacing(0, 1),
  },
  marker: {
    flex: '0 0 1.5em',
    userSelect: 'none',
    color: theme.palette.text.secondary,
  },
  added: { backgroundColor: 'rgba(46, 160, 67, 0.18)' },
  removed: { backgroundColor: 'rgba(248, 81, 73, 0.18)' },
  empty: { padding: theme.spacing(1, 1.5) },
}));

interface DiffLine {
  kind: 'added' | 'removed' | 'context';
  text: string;
}

/** Splits two texts into per-line unified diff rows. */
export function computeDiffLines(before: string, after: string): DiffLine[] {
  const rows: DiffLine[] = [];
  for (const part of diffLines(before, after)) {
    let kind: DiffLine['kind'] = 'context';
    if (part.added) {
      kind = 'added';
    } else if (part.removed) {
      kind = 'removed';
    }
    const lines = part.value.split('\n');
    if (lines[lines.length - 1] === '') {
      lines.pop();
    }
    for (const text of lines) {
      rows.push({ kind, text });
    }
  }
  return rows;
}

const MARKERS = { added: '+', removed: '-', context: ' ' } as const;

/**
 * Unified line diff. Color is never the only signal: every row has a
 * "+"/"-" marker.
 */
export function DiffView(props: {
  before: string;
  after: string;
  label: string;
}) {
  const classes = useStyles();
  const rows = useMemo(
    () => computeDiffLines(props.before, props.after),
    [props.before, props.after],
  );
  const changed = rows.some(row => row.kind !== 'context');

  if (!changed) {
    return (
      <Typography
        variant="body2"
        color="textSecondary"
        className={classes.empty}
      >
        {strings.detail.noDifferences}
      </Typography>
    );
  }

  return (
    <div className={classes.root} role="group" aria-label={props.label}>
      {rows.map((row, index) => (
        <div
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          className={`${classes.line} ${
            row.kind === 'context' ? '' : classes[row.kind]
          }`}
        >
          <span className={classes.marker}>{MARKERS[row.kind]}</span>
          <span>{row.text || ' '}</span>
        </div>
      ))}
    </div>
  );
}
