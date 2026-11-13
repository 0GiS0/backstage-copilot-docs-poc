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

import { parseEntityRef, stringifyEntityRef } from '@backstage/catalog-model';
import { InputError } from '@backstage/errors';
import {
  AssetUpload,
  CreateProposalRequest,
} from '@internal/backstage-plugin-docs-studio-common';
import {
  isMarkdownPath,
  normalizeRelativePath,
  sanitizeAssetFileName,
} from '../docs/paths';

const MAX_ASSETS = 10;
const MAX_CONTENT_CHARS = 2_000_000;

export interface CommitRequest {
  content: string;
  baseSha: string;
  assets?: AssetUpload[];
  message?: string;
}

export interface PreparedAsset {
  /** Sanitized file name. */
  fileName: string;
  bytes: Buffer;
}

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new InputError('The request body must be a JSON object');
  }
  return body as Record<string, unknown>;
}

function optionalString(
  value: unknown,
  name: string,
  maxLength: number,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new InputError(`${name} must be a string`);
  }
  if (value.length > maxLength) {
    throw new InputError(`${name} is too long`);
  }
  return value;
}

function requiredString(
  value: unknown,
  name: string,
  maxLength: number,
): string {
  const result = optionalString(value, name, maxLength);
  if (result === undefined || result.trim() === '') {
    throw new InputError(`${name} is required`);
  }
  return result;
}

export function parseEntityRefParam(value: unknown): string {
  const ref = requiredString(value, 'entityRef', 512);
  try {
    return stringifyEntityRef(parseEntityRef(ref));
  } catch {
    throw new InputError('entityRef must be a full entity reference');
  }
}

/** Path of a Markdown page, relative to the docs dir. */
export function parsePagePath(value: unknown): string {
  const path = normalizeRelativePath(value, 'path');
  if (!isMarkdownPath(path)) {
    throw new InputError('path must point to a Markdown (.md) file');
  }
  return path;
}

function parseAssets(value: unknown): AssetUpload[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new InputError('assets must be an array');
  }
  if (value.length > MAX_ASSETS) {
    throw new InputError(`At most ${MAX_ASSETS} assets per request`);
  }
  return value.map(item => {
    const asset = asObject(item);
    return {
      fileName: requiredString(asset.fileName, 'asset fileName', 255),
      contentBase64: requiredString(
        asset.contentBase64,
        'asset contentBase64',
        // Generous: the real limit is applied on the decoded bytes.
        100_000_000,
      ),
    };
  });
}

export function parseCreateRequest(body: unknown): CreateProposalRequest {
  const input = asObject(body);
  const kind = input.kind;
  if (kind !== 'edit' && kind !== 'create') {
    throw new InputError("kind must be 'edit' or 'create'");
  }
  const baseSha = optionalString(input.baseSha, 'baseSha', 64);
  if (kind === 'edit' && !baseSha) {
    throw new InputError('baseSha is required for edits');
  }
  let nav: CreateProposalRequest['nav'];
  if (input.nav !== undefined && input.nav !== null) {
    const rawNav = asObject(input.nav);
    nav = {
      title: requiredString(rawNav.title, 'nav.title', 200),
      parentPath: optionalString(rawNav.parentPath, 'nav.parentPath', 1024),
    };
  }
  return {
    entityRef: parseEntityRefParam(input.entityRef),
    kind,
    path: parsePagePath(input.path),
    content: requiredContent(input.content),
    baseSha,
    title: optionalString(input.title, 'title', 200)?.trim() || undefined,
    description: optionalString(input.description, 'description', 10_000),
    message: optionalString(input.message, 'message', 1000),
    nav: kind === 'create' ? nav : undefined,
    assets: parseAssets(input.assets),
  };
}

function requiredContent(value: unknown): string {
  if (typeof value !== 'string') {
    throw new InputError('content must be a string');
  }
  if (value.length > MAX_CONTENT_CHARS) {
    throw new InputError('content is too large');
  }
  return value;
}

export function parseCommitRequest(body: unknown): CommitRequest {
  const input = asObject(body);
  return {
    content: requiredContent(input.content),
    baseSha: requiredString(input.baseSha, 'baseSha', 64),
    assets: parseAssets(input.assets),
    message: optionalString(input.message, 'message', 1000),
  };
}

export function parseApproveRequest(body: unknown): {
  comment?: string;
  sha?: string;
} {
  const input = body === undefined ? {} : asObject(body);
  return {
    comment:
      optionalString(input.comment, 'comment', 4000)?.trim() || undefined,
    sha: optionalString(input.sha, 'sha', 64),
  };
}

export function parseRequestChangesRequest(body: unknown): {
  comment: string;
} {
  const input = asObject(body);
  return { comment: requiredString(input.comment, 'comment', 4000).trim() };
}

/**
 * Decodes and validates uploads: allowed image types, size limit, no inline
 * scripts in SVG, unique sanitized names.
 */
export function prepareAssets(
  assets: AssetUpload[] | undefined,
  maxSizeMb: number,
): PreparedAsset[] {
  const maxBytes = Math.floor(maxSizeMb * 1024 * 1024);
  const names = new Set<string>();
  return (assets ?? []).map(asset => {
    const fileName = sanitizeAssetFileName(asset.fileName);
    if (names.has(fileName)) {
      throw new InputError(`Duplicate asset ${fileName}`);
    }
    names.add(fileName);
    const encoded = asset.contentBase64.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
      throw new InputError(`Asset ${fileName} is not valid base64`);
    }
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length === 0) {
      throw new InputError(`Asset ${fileName} is empty`);
    }
    if (bytes.length > maxBytes) {
      throw new InputError(
        `Asset ${fileName} is larger than the ${maxSizeMb} MB limit`,
      );
    }
    if (
      fileName.endsWith('.svg') &&
      /<script|\son[a-z]+\s*=|javascript:/i.test(bytes.toString('utf8'))
    ) {
      throw new InputError(`Asset ${fileName} contains active content`);
    }
    return { fileName, bytes };
  });
}
