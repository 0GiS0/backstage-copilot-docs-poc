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

import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import { makeStyles } from '@material-ui/core/styles';
import Divider from '@material-ui/core/Divider';
import IconButton from '@material-ui/core/IconButton';
import NativeSelect from '@material-ui/core/NativeSelect';
import Tooltip from '@material-ui/core/Tooltip';
import CodeIcon from '@material-ui/icons/Code';
import CodeSharpIcon from '@material-ui/icons/CodeSharp';
import DeleteIcon from '@material-ui/icons/Delete';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import FormatBoldIcon from '@material-ui/icons/FormatBold';
import FormatItalicIcon from '@material-ui/icons/FormatItalic';
import FormatListBulletedIcon from '@material-ui/icons/FormatListBulleted';
import FormatListNumberedIcon from '@material-ui/icons/FormatListNumbered';
import ImageIcon from '@material-ui/icons/Image';
import LinkIcon from '@material-ui/icons/Link';
import PlaylistAddCheckIcon from '@material-ui/icons/PlaylistAddCheck';
import PlaylistAddIcon from '@material-ui/icons/PlaylistAdd';
import RedoIcon from '@material-ui/icons/Redo';
import TableChartIcon from '@material-ui/icons/TableChart';
import UndoIcon from '@material-ui/icons/Undo';
import ViewColumnIcon from '@material-ui/icons/ViewColumn';
import { editorStrings } from './strings';
import { LinkDialog } from './LinkDialog';

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(0.25),
  },
  divider: { height: 24, margin: theme.spacing(0, 0.5) },
  select: { fontSize: theme.typography.body2.fontSize, minWidth: 96 },
  hiddenInput: { display: 'none' },
}));

export interface EditorToolbarProps {
  editor: Editor;
  onUploadImage?: (file: File) => Promise<{ src: string }>;
}

interface ToolbarState {
  blockStyle: string;
  bold: boolean;
  italic: boolean;
  code: boolean;
  link: boolean;
  linkHref: string;
  bulletList: boolean;
  orderedList: boolean;
  taskList: boolean;
  table: boolean;
  admonition: boolean;
  codeBlock: boolean;
  canUndo: boolean;
  canRedo: boolean;
  editable: boolean;
}

function readState(editor: Editor): ToolbarState {
  const heading = [1, 2, 3, 4, 5, 6].find(level =>
    editor.isActive('heading', { level }),
  );
  return {
    blockStyle: heading ? `h${heading}` : 'p',
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    code: editor.isActive('code'),
    link: editor.isActive('link'),
    linkHref: String(editor.getAttributes('link').href ?? ''),
    bulletList: editor.isActive('bulletList'),
    orderedList: editor.isActive('orderedList'),
    taskList: editor.isActive('taskList'),
    table: editor.isActive('table'),
    admonition: editor.isActive('admonition'),
    codeBlock: editor.isActive('codeBlock'),
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
    editable: editor.isEditable,
  };
}

interface ToolButtonProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function ToolButton(props: ToolButtonProps) {
  const { label, active, disabled, onClick, children } = props;
  return (
    <Tooltip title={label}>
      <span>
        <IconButton
          size="small"
          aria-label={label}
          aria-pressed={active === undefined ? undefined : active}
          color={active ? 'primary' : 'default'}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </IconButton>
      </span>
    </Tooltip>
  );
}

export function EditorToolbar(props: EditorToolbarProps) {
  const { editor, onUploadImage } = props;
  const classes = useStyles();
  const strings = editorStrings.toolbar;
  const state = useEditorState({
    editor,
    selector: ctx => readState(ctx.editor),
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const disabled = !state.editable;
  const chain = () => editor.chain().focus();

  const setBlockStyle = (value: string) => {
    if (value === 'p') {
      chain().setParagraph().run();
    } else {
      const level = Number(value.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6;
      chain().setHeading({ level }).run();
    }
  };

  const blockOptions: Array<[string, string]> = [
    ['p', strings.paragraph],
    ['h1', strings.heading1],
    ['h2', strings.heading2],
    ['h3', strings.heading3],
  ];
  if (!blockOptions.some(([value]) => value === state.blockStyle)) {
    blockOptions.push([
      state.blockStyle,
      strings.headingLevel(state.blockStyle.slice(1)),
    ]);
  }

  const uploadImage = async (file: File) => {
    if (!onUploadImage) {
      return;
    }
    const { src } = await onUploadImage(file);
    const alt = file.name.replace(/\.[^.]+$/, '');
    chain().insertContent({ type: 'image', attrs: { src, alt } }).run();
  };

  return (
    <div className={classes.root} role="toolbar" aria-label={strings.ariaLabel}>
      <NativeSelect
        className={classes.select}
        value={state.blockStyle}
        disabled={disabled}
        inputProps={{ 'aria-label': strings.blockStyle }}
        onChange={event => setBlockStyle(event.target.value)}
      >
        {blockOptions.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </NativeSelect>
      <Divider orientation="vertical" flexItem className={classes.divider} />
      <ToolButton
        label={strings.bold}
        active={state.bold}
        disabled={disabled}
        onClick={() => chain().toggleBold().run()}
      >
        <FormatBoldIcon />
      </ToolButton>
      <ToolButton
        label={strings.italic}
        active={state.italic}
        disabled={disabled}
        onClick={() => chain().toggleItalic().run()}
      >
        <FormatItalicIcon />
      </ToolButton>
      <ToolButton
        label={strings.code}
        active={state.code}
        disabled={disabled}
        onClick={() => chain().toggleCode().run()}
      >
        <CodeIcon />
      </ToolButton>
      <ToolButton
        label={strings.link}
        active={state.link}
        disabled={disabled}
        onClick={() => setLinkOpen(true)}
      >
        <LinkIcon />
      </ToolButton>
      <Divider orientation="vertical" flexItem className={classes.divider} />
      <ToolButton
        label={strings.bulletList}
        active={state.bulletList}
        disabled={disabled}
        onClick={() => chain().toggleBulletList().run()}
      >
        <FormatListBulletedIcon />
      </ToolButton>
      <ToolButton
        label={strings.orderedList}
        active={state.orderedList}
        disabled={disabled}
        onClick={() => chain().toggleOrderedList().run()}
      >
        <FormatListNumberedIcon />
      </ToolButton>
      <ToolButton
        label={strings.taskList}
        active={state.taskList}
        disabled={disabled}
        onClick={() => chain().toggleTaskList().run()}
      >
        <PlaylistAddCheckIcon />
      </ToolButton>
      <Divider orientation="vertical" flexItem className={classes.divider} />
      <ToolButton
        label={strings.table}
        active={state.table}
        disabled={disabled || state.table}
        onClick={() =>
          chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      >
        <TableChartIcon />
      </ToolButton>
      {state.table && !disabled && (
        <>
          <ToolButton
            label={strings.addRowAfter}
            onClick={() => chain().addRowAfter().run()}
          >
            <PlaylistAddIcon />
          </ToolButton>
          <ToolButton
            label={strings.addColumnAfter}
            onClick={() => chain().addColumnAfter().run()}
          >
            <ViewColumnIcon />
          </ToolButton>
          <ToolButton
            label={strings.deleteRow}
            onClick={() => chain().deleteRow().run()}
          >
            <DeleteIcon fontSize="small" />
          </ToolButton>
          <ToolButton
            label={strings.deleteColumn}
            onClick={() => chain().deleteColumn().run()}
          >
            <DeleteIcon />
          </ToolButton>
          <ToolButton
            label={strings.deleteTable}
            onClick={() => chain().deleteTable().run()}
          >
            <TableChartIcon color="error" />
          </ToolButton>
        </>
      )}
      <ToolButton
        label={onUploadImage ? strings.image : strings.imageUnavailable}
        disabled={disabled || !onUploadImage}
        onClick={() => fileInput.current?.click()}
      >
        <ImageIcon />
      </ToolButton>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        data-testid="docs-studio-image-input"
        className={classes.hiddenInput}
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) {
            uploadImage(file);
          }
        }}
      />
      <ToolButton
        label={strings.admonition}
        active={state.admonition}
        disabled={disabled}
        onClick={() =>
          state.admonition
            ? chain().lift('admonition').run()
            : chain()
                .wrapIn('admonition', { variant: 'gfm', kind: 'NOTE' })
                .run()
        }
      >
        <ErrorOutlineIcon />
      </ToolButton>
      <ToolButton
        label={strings.codeBlock}
        active={state.codeBlock}
        disabled={disabled}
        onClick={() => chain().toggleCodeBlock().run()}
      >
        <CodeSharpIcon />
      </ToolButton>
      <Divider orientation="vertical" flexItem className={classes.divider} />
      <ToolButton
        label={strings.undo}
        disabled={disabled || !state.canUndo}
        onClick={() => chain().undo().run()}
      >
        <UndoIcon />
      </ToolButton>
      <ToolButton
        label={strings.redo}
        disabled={disabled || !state.canRedo}
        onClick={() => chain().redo().run()}
      >
        <RedoIcon />
      </ToolButton>
      <LinkDialog
        open={linkOpen}
        initialHref={state.linkHref}
        hasLink={state.link}
        onClose={() => setLinkOpen(false)}
        onApply={href => {
          setLinkOpen(false);
          chain().extendMarkRange('link').setLink({ href }).run();
        }}
        onRemove={() => {
          setLinkOpen(false);
          chain().extendMarkRange('link').unsetLink().run();
        }}
      />
    </div>
  );
}
