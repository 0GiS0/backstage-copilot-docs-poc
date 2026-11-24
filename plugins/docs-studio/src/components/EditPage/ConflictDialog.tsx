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
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import Typography from '@material-ui/core/Typography';
import { strings } from '../../strings';
import { DiffView } from '../common/DiffView';

export interface ConflictDialogProps {
  open: boolean;
  /** The user's version of the page. */
  yourMarkdown: string;
  /** The version currently stored in the repository. */
  currentContent?: string;
  /** Discard the edit and load the latest version. */
  onReload: () => void;
  onClose: () => void;
}

/** Shown when the page changed upstream while the user was editing it. */
export function ConflictDialog(props: ConflictDialogProps) {
  const { open, yourMarkdown, currentContent, onReload, onClose } = props;
  const [showDiff, setShowDiff] = useState(false);

  const close = () => {
    setShowDiff(false);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      fullWidth
      maxWidth={showDiff ? 'md' : 'sm'}
      aria-labelledby="conflict-title"
    >
      <DialogTitle id="conflict-title">{strings.conflict.title}</DialogTitle>
      <DialogContent>
        {showDiff ? (
          <>
            <Typography variant="subtitle2" gutterBottom>
              {strings.conflict.diffTitle}
            </Typography>
            <Typography variant="caption" color="textSecondary" paragraph>
              {strings.conflict.diffLegend}
            </Typography>
            <DiffView
              label={strings.conflict.diffTitle}
              before={currentContent ?? ''}
              after={yourMarkdown}
            />
          </>
        ) : (
          <DialogContentText>{strings.conflict.body}</DialogContentText>
        )}
      </DialogContent>
      <DialogActions>
        {showDiff ? (
          <Button onClick={() => setShowDiff(false)}>
            {strings.conflict.backToChoice}
          </Button>
        ) : (
          <Button
            onClick={() => setShowDiff(true)}
            disabled={currentContent === undefined}
          >
            {strings.conflict.showDiff}
          </Button>
        )}
        <Button onClick={close}>{strings.conflict.close}</Button>
        <Button color="primary" variant="contained" onClick={onReload}>
          {strings.conflict.reload}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
