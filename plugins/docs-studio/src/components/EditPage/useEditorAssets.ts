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

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssetUpload } from '@internal/backstage-plugin-docs-studio-common';
import type { DocsStudioApi } from '../../api';
import { strings } from '../../strings';
import {
  dirname,
  isExternalSrc,
  relativePath,
  resolveAgainst,
} from '../../utils/paths';

const DEFAULT_ASSETS_DIR = 'attachments';

export interface EditorAssetsOptions {
  api: DocsStudioApi;
  entityRef: string;
  /** Path of the page being edited, relative to the docs dir. */
  pagePath: string;
  /** Directory for new images, relative to the docs dir. */
  assetsDir?: string;
  /** Branch to read existing images from, when editing a proposal. */
  proposalId?: string;
}

interface PendingUpload {
  asset: AssetUpload;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(strings.edit.imageUploadFailed));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+/, '');
  return cleaned || 'image';
}

/**
 * Image plumbing for the editor: existing images are fetched through the
 * backend into blob URLs, new images stay in memory as pending uploads until
 * the proposal is submitted.
 */
export function useEditorAssets(options: EditorAssetsOptions) {
  const { api, entityRef, pagePath, proposalId } = options;
  const assetsDir = options.assetsDir || DEFAULT_ASSETS_DIR;
  const pageDir = dirname(pagePath);

  const blobUrls = useRef(new Map<string, Promise<string>>());
  const objectUrls = useRef<string[]>([]);
  const pending = useRef(new Map<string, PendingUpload>());
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      urls.forEach(url => URL.revokeObjectURL(url));
      urls.length = 0;
    };
  }, []);

  const imageResolver = useCallback(
    (src: string): Promise<string> => {
      if (isExternalSrc(src)) {
        return Promise.resolve(src);
      }
      const resolved = resolveAgainst(pageDir, src);
      let cached = blobUrls.current.get(resolved);
      if (!cached) {
        cached = api
          .getAsset({ entityRef, path: resolved, proposalId })
          .then(blob => {
            const url = URL.createObjectURL(blob);
            objectUrls.current.push(url);
            return url;
          });
        cached.catch(() => blobUrls.current.delete(resolved));
        blobUrls.current.set(resolved, cached);
      }
      return cached;
    },
    [api, entityRef, pageDir, proposalId],
  );

  const onUploadImage = useCallback(
    async (file: File): Promise<{ src: string }> => {
      const contentBase64 = await readAsBase64(file);
      const baseName = sanitizeFileName(file.name);
      let fileName = baseName;
      for (let n = 1; pending.current.has(`${assetsDir}/${fileName}`); n++) {
        fileName = `${n}-${baseName}`;
      }
      const target = `${assetsDir}/${fileName}`;
      pending.current.set(target, { asset: { fileName, contentBase64 } });
      const url = URL.createObjectURL(file);
      objectUrls.current.push(url);
      blobUrls.current.set(target, Promise.resolve(url));
      setPendingCount(pending.current.size);
      return { src: relativePath(pageDir, target) };
    },
    [assetsDir, pageDir],
  );

  /** Uploads still referenced by the Markdown that is about to be submitted. */
  const collectAssets = useCallback((markdown: string): AssetUpload[] => {
    return Array.from(pending.current.values())
      .map(entry => entry.asset)
      .filter(asset => markdown.includes(asset.fileName));
  }, []);

  return { imageResolver, onUploadImage, collectAssets, pendingCount };
}
