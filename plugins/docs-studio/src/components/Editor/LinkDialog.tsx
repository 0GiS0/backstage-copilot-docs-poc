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

import { useEffect, useState } from 'react';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import TextField from '@material-ui/core/TextField';
import { editorStrings } from './strings';

export interface LinkDialogProps {
  open: boolean;
  initialHref: string;
  hasLink: boolean;
  onClose: () => void;
  onApply: (href: string) => void;
  onRemove: () => void;
}

export function LinkDialog(props: LinkDialogProps) {
  const { open, initialHref, hasLink, onClose, onApply, onRemove } = props;
  const [href, setHref] = useState(initialHref);
  const strings = editorStrings.linkDialog;

  useEffect(() => {
    if (open) {
      setHref(initialHref);
    }
  }, [open, initialHref]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{strings.title}</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          label={strings.urlLabel}
          value={href}
          onChange={event => setHref(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && href.trim()) {
              onApply(href.trim());
            }
          }}
        />
      </DialogContent>
      <DialogActions>
        {hasLink && <Button onClick={onRemove}>{strings.remove}</Button>}
        <Button onClick={onClose}>{strings.cancel}</Button>
        <Button
          color="primary"
          disabled={!href.trim()}
          onClick={() => onApply(href.trim())}
        >
          {strings.save}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
