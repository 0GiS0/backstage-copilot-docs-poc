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

import Accordion from '@material-ui/core/Accordion';
import AccordionDetails from '@material-ui/core/AccordionDetails';
import AccordionSummary from '@material-ui/core/AccordionSummary';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import { editorStrings } from './strings';

export interface FrontmatterPanelProps {
  id: string;
  value: string;
  error?: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
}

export function FrontmatterPanel(props: FrontmatterPanelProps) {
  const { id, value, error, readOnly, onChange } = props;
  const strings = editorStrings.frontmatter;

  return (
    <Accordion variant="outlined" square>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle2">{strings.title}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <TextField
          id={id}
          multiline
          fullWidth
          variant="outlined"
          minRows={3}
          label={strings.textareaLabel}
          value={value}
          error={Boolean(error)}
          helperText={error ? `${strings.invalid}: ${error}` : undefined}
          onChange={event => onChange(event.target.value)}
          inputProps={{ readOnly, style: { fontFamily: 'monospace' } }}
        />
      </AccordionDetails>
    </Accordion>
  );
}
