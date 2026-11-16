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

/** All user-facing copy of the editor lives here so it can be translated later. */
export const editorStrings = {
  toolbar: {
    ariaLabel: 'Editor toolbar',
    blockStyle: 'Block style',
    headingLevel: (level: string) => `Heading ${level}`,
    paragraph: 'Paragraph',
    heading1: 'Heading 1',
    heading2: 'Heading 2',
    heading3: 'Heading 3',
    bold: 'Bold',
    italic: 'Italic',
    code: 'Code',
    link: 'Link',
    bulletList: 'Bulleted list',
    orderedList: 'Numbered list',
    taskList: 'Task list',
    table: 'Table',
    image: 'Image',
    imageUnavailable: 'Image (upload not available)',
    admonition: 'Callout',
    codeBlock: 'Code block',
    undo: 'Undo',
    redo: 'Redo',
    addRowAfter: 'Add row',
    addColumnAfter: 'Add column',
    deleteRow: 'Delete row',
    deleteColumn: 'Delete column',
    deleteTable: 'Delete table',
  },
  mode: {
    ariaLabel: 'Editing mode',
    visual: 'Visual',
    markdown: 'Markdown',
  },
  markdownTextareaLabel: 'Markdown',
  frontmatter: {
    title: 'Metadata (front matter)',
    textareaLabel: 'Front matter YAML',
    invalid: 'Invalid YAML',
  },
  admonition: {
    kindLabel: 'Type',
    titleLabel: 'Title (optional)',
    kinds: {
      NOTE: 'Note',
      TIP: 'Tip',
      IMPORTANT: 'Important',
      WARNING: 'Warning',
      CAUTION: 'Caution',
    } as Record<string, string>,
    mkdocsKinds: {
      note: 'Note',
      tip: 'Tip',
      important: 'Important',
      warning: 'Warning',
      danger: 'Danger',
      info: 'Info',
      example: 'Example',
      quote: 'Quote',
    } as Record<string, string>,
  },
  rawBlock: {
    chip: 'HTML',
    chipOther: 'Content without visual editor',
    edit: 'Edit raw content',
    dialogTitle: 'Edit raw content',
    dialogLabel: 'Content',
    save: 'Save',
    cancel: 'Cancel',
  },
  image: {
    notFound: 'The image could not be loaded',
  },
  linkDialog: {
    title: 'Link',
    urlLabel: 'URL',
    save: 'Apply',
    remove: 'Remove link',
    cancel: 'Cancel',
  },
  readOnly: 'Read only',
} as const;
