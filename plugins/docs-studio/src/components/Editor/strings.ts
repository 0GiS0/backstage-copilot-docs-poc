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
    ariaLabel: 'Barra de herramientas del editor',
    blockStyle: 'Estilo de bloque',
    headingLevel: (level: string) => `Título ${level}`,
    paragraph: 'Párrafo',
    heading1: 'Título 1',
    heading2: 'Título 2',
    heading3: 'Título 3',
    bold: 'Negrita',
    italic: 'Cursiva',
    code: 'Código',
    link: 'Enlace',
    bulletList: 'Lista',
    orderedList: 'Lista numerada',
    taskList: 'Lista de tareas',
    table: 'Tabla',
    image: 'Imagen',
    imageUnavailable: 'Imagen (subida no disponible)',
    admonition: 'Aviso',
    codeBlock: 'Bloque de código',
    undo: 'Deshacer',
    redo: 'Rehacer',
    addRowAfter: 'Añadir fila',
    addColumnAfter: 'Añadir columna',
    deleteRow: 'Eliminar fila',
    deleteColumn: 'Eliminar columna',
    deleteTable: 'Eliminar tabla',
  },
  mode: {
    ariaLabel: 'Modo de edición',
    visual: 'Visual',
    markdown: 'Markdown',
  },
  markdownTextareaLabel: 'Markdown',
  frontmatter: {
    title: 'Metadatos (front-matter)',
    textareaLabel: 'YAML del front-matter',
    invalid: 'YAML no válido',
  },
  admonition: {
    kindLabel: 'Tipo',
    titleLabel: 'Título (opcional)',
    kinds: {
      NOTE: 'Nota',
      TIP: 'Consejo',
      IMPORTANT: 'Importante',
      WARNING: 'Advertencia',
      CAUTION: 'Precaución',
    } as Record<string, string>,
    mkdocsKinds: {
      note: 'Nota',
      tip: 'Consejo',
      important: 'Importante',
      warning: 'Advertencia',
      danger: 'Peligro',
      info: 'Información',
      example: 'Ejemplo',
      quote: 'Cita',
    } as Record<string, string>,
  },
  rawBlock: {
    chip: 'HTML',
    chipOther: 'Contenido sin editor visual',
    edit: 'Editar contenido en bruto',
    dialogTitle: 'Editar contenido en bruto',
    dialogLabel: 'Contenido',
    save: 'Guardar',
    cancel: 'Cancelar',
  },
  image: {
    notFound: 'No se pudo cargar la imagen',
  },
  linkDialog: {
    title: 'Enlace',
    urlLabel: 'URL',
    save: 'Aplicar',
    remove: 'Quitar enlace',
    cancel: 'Cancelar',
  },
  readOnly: 'Solo lectura',
} as const;
