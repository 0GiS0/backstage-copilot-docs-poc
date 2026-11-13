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

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { makeStyles } from '@material-ui/core/styles';
import Button from '@material-ui/core/Button';
import ButtonGroup from '@material-ui/core/ButtonGroup';
import Paper from '@material-ui/core/Paper';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import { parseMarkdown, serializeMarkdown } from '../../markdown';
import type { ParsedDocument } from '../../markdown';
import { createExtensions } from './extensions';
import {
  FrontmatterParts,
  joinFrontmatter,
  splitFrontmatter,
  yamlError,
} from './frontmatter';
import { FrontmatterPanel } from './FrontmatterPanel';
import { editorStrings } from './strings';
import { EditorToolbar } from './Toolbar';

export interface DocsStudioEditorChange {
  markdown: string;
  dirty: boolean;
  /** Set while the front-matter textarea does not contain valid YAML. */
  frontmatterError?: string;
}

export interface DocsStudioEditorProps {
  initialMarkdown: string;
  onChange?: (state: DocsStudioEditorChange) => void;
  /** Maps a Markdown image path to a URL the browser can load. */
  imageResolver?: (src: string) => Promise<string>;
  /** Uploads an image and returns the relative path to insert in the page. */
  onUploadImage?: (file: File) => Promise<{ src: string }>;
  readOnly?: boolean;
}

export interface DocsStudioEditorHandle {
  getMarkdown(): string;
  isDirty(): boolean;
}

type Mode = 'visual' | 'markdown';

let instanceCounter = 0;

const useStyles = makeStyles(theme => ({
  root: { display: 'flex', flexDirection: 'column', gap: theme.spacing(1) },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(1),
    padding: theme.spacing(0.5, 1),
  },
  surface: { padding: theme.spacing(1, 2), minHeight: 240 },
  textarea: {
    fontFamily: 'monospace',
    fontSize: theme.typography.body2.fontSize,
  },
  content: {
    '& .ProseMirror': {
      outline: 'none',
      minHeight: 200,
      '& > *:first-child': { marginTop: 0 },
    },
    '& .ProseMirror pre': {
      padding: theme.spacing(1),
      borderRadius: theme.shape.borderRadius,
      backgroundColor: theme.palette.action.hover,
      fontFamily: 'monospace',
      overflowX: 'auto',
    },
    '& .ProseMirror code': {
      fontFamily: 'monospace',
      padding: '0 2px',
      borderRadius: 3,
      backgroundColor: theme.palette.action.hover,
    },
    '& .ProseMirror pre code': { padding: 0, backgroundColor: 'transparent' },
    '& .ProseMirror blockquote': {
      margin: theme.spacing(1, 0),
      paddingLeft: theme.spacing(2),
      borderLeft: `3px solid ${theme.palette.divider}`,
      color: theme.palette.text.secondary,
    },
    '& .ProseMirror table': {
      borderCollapse: 'collapse',
      margin: theme.spacing(1, 0),
      width: '100%',
    },
    '& .ProseMirror th, & .ProseMirror td': {
      border: `1px solid ${theme.palette.divider}`,
      padding: theme.spacing(0.5, 1),
      verticalAlign: 'top',
      textAlign: 'left',
      minWidth: 48,
    },
    '& .ProseMirror th': { backgroundColor: theme.palette.action.hover },
    '& .ProseMirror .selectedCell': {
      backgroundColor: theme.palette.action.selected,
    },
    '& .ProseMirror ul[data-type="taskList"]': {
      listStyle: 'none',
      paddingLeft: theme.spacing(0.5),
    },
    '& .ProseMirror ul[data-type="taskList"] li': {
      display: 'flex',
      gap: theme.spacing(1),
      alignItems: 'flex-start',
    },
    '& .ProseMirror ul[data-type="taskList"] li > div': { flex: 1 },
    '& .ProseMirror hr': {
      border: 0,
      borderTop: `1px solid ${theme.palette.divider}`,
    },
  },
}));

interface FrontmatterState {
  raw: string;
  /** Present when the block is a `---` YAML fence that can be edited. */
  parts?: FrontmatterParts;
  /** Editable text: the YAML body, or the raw block when not editable. */
  text: string;
}

function frontmatterOf(parsed: ParsedDocument): FrontmatterState | undefined {
  if (!parsed.frontmatter) {
    return undefined;
  }
  const { raw } = parsed.frontmatter;
  const parts = splitFrontmatter(raw);
  return { raw, parts, text: parts ? parts.inner : raw };
}

export const DocsStudioEditor = forwardRef<
  DocsStudioEditorHandle,
  DocsStudioEditorProps
>(function DocsStudioEditorImpl(props, ref) {
  const { initialMarkdown, readOnly = false } = props;
  const classes = useStyles();
  const idRef = useRef<string>();
  if (!idRef.current) {
    instanceCounter += 1;
    idRef.current = `docs-studio-editor-${instanceCounter}`;
  }
  const idPrefix = idRef.current;

  const propsRef = useRef(props);
  propsRef.current = props;

  const baseline = useRef(initialMarkdown);
  const parsed = useRef<ParsedDocument>();
  if (!parsed.current) {
    parsed.current = parseMarkdown(initialMarkdown);
  }
  const frontmatter = useRef<FrontmatterState | undefined>(
    frontmatterOf(parsed.current),
  );
  const mode = useRef<Mode>('visual');

  const [fmText, setFmText] = useState(frontmatter.current?.text ?? '');
  const [hasFrontmatter, setHasFrontmatter] = useState(
    Boolean(frontmatter.current),
  );
  const [modeState, setModeState] = useState<Mode>('visual');
  const [markdownText, setMarkdownText] = useState(initialMarkdown);
  const markdownTextRef = useRef(initialMarkdown);

  const extensions = useMemo(
    () =>
      createExtensions({
        imageResolver: src =>
          propsRef.current.imageResolver
            ? propsRef.current.imageResolver(src)
            : Promise.resolve(src),
      }),
    [],
  );

  const notifyRef = useRef(() => {});

  const editor = useEditor({
    extensions,
    content: parsed.current.doc,
    editable: !readOnly,
    onUpdate: () => notifyRef.current(),
  });
  const editorRef = useRef(editor);
  editorRef.current = editor;

  const frontmatterErrorOf = (): string | undefined => {
    const fm = frontmatter.current;
    return fm?.parts ? yamlError(fm.text) : undefined;
  };

  const compute = useCallback((): string => {
    if (mode.current === 'markdown') {
      return markdownTextRef.current;
    }
    const current = parsed.current as ParsedDocument;
    const fm = frontmatter.current;
    const currentEditor = editorRef.current;
    if (!currentEditor) {
      return baseline.current;
    }
    let original = current;
    if (fm?.parts && fm.text !== fm.parts.inner) {
      original = {
        ...current,
        frontmatter: { raw: joinFrontmatter(fm.parts, fm.text) },
      };
    }
    return serializeMarkdown(currentEditor.getJSON(), original);
  }, []);

  notifyRef.current = () => {
    const markdown = compute();
    propsRef.current.onChange?.({
      markdown,
      dirty: markdown !== baseline.current,
      frontmatterError: frontmatterErrorOf(),
    });
  };

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: compute,
      isDirty: () => compute() !== baseline.current,
    }),
    [compute],
  );

  const load = useCallback((markdown: string) => {
    const next = parseMarkdown(markdown);
    parsed.current = next;
    frontmatter.current = frontmatterOf(next);
    setFmText(frontmatter.current?.text ?? '');
    setHasFrontmatter(Boolean(frontmatter.current));
    editorRef.current?.commands.setContent(next.doc, { emitUpdate: false });
  }, []);

  // Replace the document when the parent supplies different source text.
  const lastInitial = useRef(initialMarkdown);
  useEffect(() => {
    if (initialMarkdown === lastInitial.current) {
      return;
    }
    lastInitial.current = initialMarkdown;
    baseline.current = initialMarkdown;
    markdownTextRef.current = initialMarkdown;
    setMarkdownText(initialMarkdown);
    load(initialMarkdown);
  }, [initialMarkdown, load]);

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  const switchMode = (next: Mode) => {
    if (next === mode.current || !editor) {
      return;
    }
    if (next === 'markdown') {
      const markdown = compute();
      markdownTextRef.current = markdown;
      setMarkdownText(markdown);
      mode.current = 'markdown';
      setModeState('markdown');
      return;
    }
    // The edited text becomes the new source of truth for preservation.
    load(markdownTextRef.current);
    mode.current = 'visual';
    setModeState('visual');
    notifyRef.current();
  };

  const strings = editorStrings;
  const fm = frontmatter.current;

  return (
    <div className={classes.root}>
      <Paper variant="outlined" className={classes.header}>
        {editor && modeState === 'visual' ? (
          <EditorToolbar editor={editor} onUploadImage={props.onUploadImage} />
        ) : (
          <span />
        )}
        <ButtonGroup size="small" aria-label={strings.mode.ariaLabel}>
          <Button
            color={modeState === 'visual' ? 'primary' : 'default'}
            variant={modeState === 'visual' ? 'contained' : 'outlined'}
            aria-pressed={modeState === 'visual'}
            onClick={() => switchMode('visual')}
          >
            {strings.mode.visual}
          </Button>
          <Button
            color={modeState === 'markdown' ? 'primary' : 'default'}
            variant={modeState === 'markdown' ? 'contained' : 'outlined'}
            aria-pressed={modeState === 'markdown'}
            onClick={() => switchMode('markdown')}
          >
            {strings.mode.markdown}
          </Button>
        </ButtonGroup>
      </Paper>
      {modeState === 'visual' && hasFrontmatter && (
        <FrontmatterPanel
          id={`${idPrefix}-frontmatter`}
          value={fmText}
          error={frontmatterErrorOf()}
          readOnly={readOnly || !fm?.parts}
          onChange={value => {
            if (frontmatter.current) {
              frontmatter.current = { ...frontmatter.current, text: value };
            }
            setFmText(value);
            notifyRef.current();
          }}
        />
      )}
      <Paper variant="outlined" className={classes.surface}>
        {modeState === 'visual' ? (
          <EditorContent editor={editor} className={classes.content} />
        ) : (
          <TextField
            multiline
            fullWidth
            minRows={16}
            id={`${idPrefix}-markdown`}
            label={strings.markdownTextareaLabel}
            value={markdownText}
            InputProps={{ className: classes.textarea, readOnly }}
            onChange={event => {
              markdownTextRef.current = event.target.value;
              setMarkdownText(event.target.value);
              notifyRef.current();
            }}
          />
        )}
        {readOnly && (
          <Typography variant="caption" color="textSecondary">
            {strings.readOnly}
          </Typography>
        )}
      </Paper>
    </div>
  );
});
