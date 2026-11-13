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

import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { makeStyles } from '@material-ui/core/styles';
import NativeSelect from '@material-ui/core/NativeSelect';
import InputBase from '@material-ui/core/InputBase';
import { GFM_ADMONITION_KINDS } from '../../../markdown';
import { editorStrings } from '../strings';

const useStyles = makeStyles(theme => ({
  root: {
    margin: theme.spacing(1.5, 0),
    border: `1px solid ${theme.palette.divider}`,
    borderLeft: `4px solid ${theme.palette.info.main}`,
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.action.hover,
  },
  warning: { borderLeftColor: theme.palette.warning.main },
  danger: { borderLeftColor: theme.palette.error.main },
  tip: { borderLeftColor: theme.palette.success.main },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(0.5, 1),
    fontSize: theme.typography.caption.fontSize,
    userSelect: 'none',
  },
  title: { flex: 1, fontSize: theme.typography.caption.fontSize },
  body: { padding: theme.spacing(0, 1.5) },
}));

function severityClass(kind: string): 'warning' | 'danger' | 'tip' | undefined {
  switch (kind.toLowerCase()) {
    case 'warning':
    case 'important':
      return 'warning';
    case 'caution':
    case 'danger':
    case 'failure':
    case 'bug':
      return 'danger';
    case 'tip':
    case 'success':
    case 'hint':
      return 'tip';
    default:
      return undefined;
  }
}

export function AdmonitionView(props: NodeViewProps) {
  const { node, updateAttributes, editor } = props;
  const classes = useStyles();
  const { variant, kind, title } = node.attrs as {
    variant: 'gfm' | 'mkdocs';
    kind: string;
    title: string | null;
  };
  const editable = editor.isEditable;
  const strings = editorStrings.admonition;

  const kinds: Array<[string, string]> =
    variant === 'gfm'
      ? GFM_ADMONITION_KINDS.map(k => [k, strings.kinds[k] ?? k])
      : Object.entries(strings.mkdocsKinds);
  if (!kinds.some(([value]) => value === kind)) {
    kinds.push([kind, kind]);
  }
  const severity = severityClass(kind);

  return (
    <NodeViewWrapper
      className={[classes.root, severity ? classes[severity] : '']
        .filter(Boolean)
        .join(' ')}
      data-admonition={kind}
    >
      <div className={classes.header} contentEditable={false}>
        <NativeSelect
          value={kind}
          disabled={!editable}
          inputProps={{ 'aria-label': strings.kindLabel }}
          onChange={event => updateAttributes({ kind: event.target.value })}
        >
          {kinds.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
        {variant === 'mkdocs' && (
          <InputBase
            className={classes.title}
            value={title ?? ''}
            readOnly={!editable}
            placeholder={strings.titleLabel}
            inputProps={{ 'aria-label': strings.titleLabel }}
            onChange={event => updateAttributes({ title: event.target.value })}
          />
        )}
      </div>
      <NodeViewContent className={classes.body} />
    </NodeViewWrapper>
  );
}
