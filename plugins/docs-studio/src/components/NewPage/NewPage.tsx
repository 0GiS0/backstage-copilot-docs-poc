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
import { useNavigate, useSearchParams } from 'react-router-dom';
import Button from '@material-ui/core/Button';
import Grid from '@material-ui/core/Grid';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import { makeStyles } from '@material-ui/core/styles';
import Alert from '@material-ui/lab/Alert';
import { Content, Link } from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { docsStudioApiRef } from '../../api';
import { useDocsStudioPaths } from '../../hooks/useDocsStudioPaths';
import { strings } from '../../strings';
import { dirname, isValidMarkdownPath, slugify } from '../../utils/paths';
import { DocsStudioEditor } from '../Editor';
import type { DocsStudioEditorChange, DocsStudioEditorHandle } from '../Editor';
import { useEditorAssets } from '../EditPage/useEditorAssets';

const useStyles = makeStyles(theme => ({
  stack: { display: 'flex', flexDirection: 'column', gap: theme.spacing(2) },
  actions: { display: 'flex', flexWrap: 'wrap', gap: theme.spacing(1) },
}));

function joinPath(dir: string, fileName: string): string {
  return dir ? `${dir}/${fileName}` : fileName;
}

function seedFor(title: string): string {
  return `# ${title.trim()}\n`;
}

function NewPageForm(props: { entityRef: string; parentPath: string }) {
  const { entityRef, parentPath } = props;
  const classes = useStyles();
  const api = useApi(docsStudioApiRef);
  const paths = useDocsStudioPaths();
  const navigate = useNavigate();
  const editorRef = useRef<DocsStudioEditorHandle>(null);
  const parentDir = dirname(parentPath);

  const [title, setTitle] = useState('');
  const [seedTitle, setSeedTitle] = useState('');
  const [filePath, setFilePath] = useState('');
  const [fileTouched, setFileTouched] = useState(false);
  const [parent, setParent] = useState(parentPath);
  const [change, setChange] = useState<DocsStudioEditorChange>({
    markdown: '',
    dirty: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const assets = useEditorAssets({
    api,
    entityRef,
    pagePath: filePath || joinPath(parentDir, 'new.md'),
  });

  const trimmedTitle = title.trim();
  const fileError =
    filePath && !isValidMarkdownPath(filePath)
      ? strings.create.fileNameInvalid
      : undefined;
  const canSubmit =
    !submitting &&
    Boolean(trimmedTitle) &&
    Boolean(filePath) &&
    !fileError &&
    !change.frontmatterError;

  const onTitleChange = (value: string) => {
    setTitle(value);
    if (!fileTouched) {
      const slug = slugify(value);
      setFilePath(slug ? joinPath(parentDir, `${slug}.md`) : '');
    }
  };

  // The editor is seeded once per title: re-seed on blur only while untouched.
  const onTitleBlur = () => {
    if (!change.dirty && trimmedTitle !== seedTitle) {
      setSeedTitle(trimmedTitle);
    }
  };

  const submit = async () => {
    const markdown =
      editorRef.current?.getMarkdown() ||
      change.markdown ||
      seedFor(trimmedTitle);
    const uploads = assets.collectAssets(markdown);
    setSubmitting(true);
    setError(undefined);
    try {
      const result = await api.createProposal({
        entityRef,
        kind: 'create',
        path: filePath,
        content: markdown,
        title: trimmedTitle,
        message: strings.create.defaultMessage(trimmedTitle),
        nav: {
          title: trimmedTitle,
          parentPath: parent.trim() || undefined,
        },
        assets: uploads.length ? uploads : undefined,
      });
      navigate(paths.proposal(result.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.create.submitError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={classes.stack}>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <TextField
            required
            fullWidth
            variant="outlined"
            size="small"
            label={strings.create.titleLabel}
            value={title}
            onChange={event => onTitleChange(event.target.value)}
            onBlur={onTitleBlur}
            inputProps={{ maxLength: 200 }}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            required
            fullWidth
            variant="outlined"
            size="small"
            label={strings.create.fileNameLabel}
            helperText={fileError ?? strings.create.fileNameHelp}
            error={Boolean(fileError)}
            value={filePath}
            onChange={event => {
              setFileTouched(true);
              setFilePath(event.target.value);
            }}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            fullWidth
            variant="outlined"
            size="small"
            label={strings.create.parentLabel}
            helperText={strings.create.parentHelp}
            value={parent}
            onChange={event => setParent(event.target.value)}
          />
        </Grid>
      </Grid>
      <DocsStudioEditor
        key={seedTitle}
        ref={editorRef}
        initialMarkdown={seedTitle ? seedFor(seedTitle) : ''}
        onChange={setChange}
        imageResolver={assets.imageResolver}
        onUploadImage={assets.onUploadImage}
      />
      {assets.pendingCount > 0 && (
        <Typography variant="caption" color="textSecondary">
          {strings.edit.pendingImages(assets.pendingCount)}
        </Typography>
      )}
      {change.frontmatterError && (
        <Alert severity="warning">{strings.edit.frontmatterInvalid}</Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      <div className={classes.actions}>
        <Button
          variant="contained"
          color="primary"
          disabled={!canSubmit}
          onClick={submit}
        >
          {submitting ? strings.edit.submitting : strings.create.submit}
        </Button>
        <Button onClick={() => navigate(-1)} disabled={submitting}>
          {strings.edit.cancel}
        </Button>
      </div>
    </div>
  );
}

/** Form to propose a brand new page, optionally placed under a nav section. */
export function NewPage() {
  const paths = useDocsStudioPaths();
  const [params] = useSearchParams();
  const entityRef = params.get('entityRef');
  const parentPath = params.get('parentPath') ?? '';

  if (!entityRef) {
    return (
      <Content>
        <Alert severity="error">{strings.create.missingParams}</Alert>
        <Link to={paths.root}>{strings.detail.back}</Link>
      </Content>
    );
  }
  return (
    <Content>
      <NewPageForm entityRef={entityRef} parentPath={parentPath} />
    </Content>
  );
}
