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
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { makeStyles } from '@material-ui/core/styles';
import Button from '@material-ui/core/Button';
import Chip from '@material-ui/core/Chip';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import IconButton from '@material-ui/core/IconButton';
import TextField from '@material-ui/core/TextField';
import Tooltip from '@material-ui/core/Tooltip';
import EditIcon from '@material-ui/icons/Edit';
import { editorStrings } from '../strings';

const useStyles = makeStyles(theme => ({
  block: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(1),
    margin: theme.spacing(1, 0),
    padding: theme.spacing(0.75, 1),
    border: `1px dashed ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.action.hover,
  },
  inline: {
    display: 'inline-flex',
    alignItems: 'center',
    verticalAlign: 'baseline',
  },
  code: {
    flex: 1,
    margin: 0,
    fontFamily: 'monospace',
    fontSize: theme.typography.caption.fontSize,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    color: theme.palette.text.secondary,
  },
  inlineCode: {
    marginLeft: theme.spacing(0.5),
    fontFamily: 'monospace',
    fontSize: theme.typography.caption.fontSize,
    color: theme.palette.text.secondary,
  },
}));

function chipLabel(kind: string): string {
  return kind === 'html'
    ? editorStrings.rawBlock.chip
    : editorStrings.rawBlock.chipOther;
}

/** Shared by the block and inline raw nodes: read-only chip + edit dialog. */
export function RawNodeView(props: NodeViewProps & { inline: boolean }) {
  const { node, updateAttributes, editor, inline } = props;
  const classes = useStyles();
  const raw = String(node.attrs.raw ?? '');
  const kind = String(node.attrs.kind ?? 'html');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(raw);
  const strings = editorStrings.rawBlock;

  const edit = editor.isEditable ? (
    <Tooltip title={strings.edit}>
      <IconButton
        size="small"
        aria-label={strings.edit}
        onClick={() => {
          setDraft(raw);
          setOpen(true);
        }}
      >
        <EditIcon fontSize="inherit" />
      </IconButton>
    </Tooltip>
  ) : null;

  return (
    <NodeViewWrapper
      as={inline ? 'span' : 'div'}
      className={inline ? classes.inline : classes.block}
      contentEditable={false}
      data-raw-kind={kind}
    >
      <Chip size="small" variant="outlined" label={chipLabel(kind)} />
      {inline ? (
        <code className={classes.inlineCode}>{raw}</code>
      ) : (
        <pre className={classes.code}>{raw}</pre>
      )}
      {edit}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>{strings.dialogTitle}</DialogTitle>
        <DialogContent>
          <TextField
            multiline
            fullWidth
            variant="outlined"
            minRows={4}
            label={strings.dialogLabel}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            inputProps={{ style: { fontFamily: 'monospace' } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{strings.cancel}</Button>
          <Button
            color="primary"
            onClick={() => {
              updateAttributes({ raw: draft });
              setOpen(false);
            }}
          >
            {strings.save}
          </Button>
        </DialogActions>
      </Dialog>
    </NodeViewWrapper>
  );
}

export function RawBlockView(props: NodeViewProps) {
  return <RawNodeView {...props} inline={false} />;
}

export function RawInlineView(props: NodeViewProps) {
  return <RawNodeView {...props} inline />;
}
