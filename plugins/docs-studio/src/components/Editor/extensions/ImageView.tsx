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
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { makeStyles } from '@material-ui/core/styles';
import { editorStrings } from '../strings';

const useStyles = makeStyles(theme => ({
  wrapper: { display: 'inline-block', maxWidth: '100%' },
  image: { maxWidth: '100%', height: 'auto', verticalAlign: 'middle' },
  selected: { outline: `2px solid ${theme.palette.primary.main}` },
  missing: {
    display: 'inline-block',
    padding: theme.spacing(0.5, 1),
    border: `1px dashed ${theme.palette.divider}`,
    color: theme.palette.text.secondary,
    fontSize: theme.typography.caption.fontSize,
  },
}));

export interface ImageNodeOptions {
  imageResolver?: (src: string) => Promise<string>;
}

/** Resolves a Markdown image path to something an <img> can load. */
function useResolvedSrc(
  src: string,
  resolver: ImageNodeOptions['imageResolver'],
): { url?: string; failed: boolean } {
  const [state, setState] = useState<{ url?: string; failed: boolean }>({
    url: resolver ? undefined : src,
    failed: false,
  });

  useEffect(() => {
    if (!resolver) {
      setState({ url: src, failed: false });
      return undefined;
    }
    let cancelled = false;
    setState({ url: undefined, failed: false });
    resolver(src).then(
      url => {
        if (!cancelled) {
          setState({ url, failed: false });
        }
      },
      () => {
        if (!cancelled) {
          setState({ url: undefined, failed: true });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [src, resolver]);

  return state;
}

export function ImageView(props: NodeViewProps) {
  const { node, selected, extension } = props;
  const classes = useStyles();
  const src = String(node.attrs.src ?? '');
  const alt = String(node.attrs.alt ?? '');
  const title = node.attrs.title ? String(node.attrs.title) : undefined;
  const resolver = (extension.options as ImageNodeOptions).imageResolver;
  const { url, failed } = useResolvedSrc(src, resolver);
  const [broken, setBroken] = useState(false);

  useEffect(() => setBroken(false), [url]);

  return (
    <NodeViewWrapper as="span" className={classes.wrapper} data-drag-handle>
      {url && !failed && !broken ? (
        <img
          src={url}
          alt={alt}
          title={title}
          className={`${classes.image} ${selected ? classes.selected : ''}`}
          onError={() => setBroken(true)}
        />
      ) : (
        <span className={classes.missing} title={src}>
          {failed || broken ? `${editorStrings.image.notFound}: ` : ''}
          {alt || src}
        </span>
      )}
    </NodeViewWrapper>
  );
}
