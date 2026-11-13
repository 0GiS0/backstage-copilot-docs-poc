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

import type {
  CheckState,
  ProposalEvent,
  ProposalStatus,
} from '@internal/backstage-plugin-docs-studio-common';

/** All user-facing copy lives here so it can be translated later. */
export const strings = {
  pluginTitle: 'Docs Studio',
  loading: 'Cargando…',
  cancel: 'Cancelar',
  close: 'Cerrar',
  unknownError: 'Ha ocurrido un error inesperado.',

  list: {
    title: 'Docs Studio',
    subtitle: 'Propuestas de cambio sobre la documentación',
    tabsLabel: 'Filtros de propuestas',
    tabMine: 'Mis propuestas',
    tabToApprove: 'Pendientes de mi aprobación',
    tabAll: 'Todas',
    tableTitle: 'Propuestas',
    empty: 'No hay propuestas en esta vista.',
    columns: {
      title: 'Título',
      page: 'Página',
      entity: 'Documentación',
      status: 'Estado',
      checks: 'Revisión',
      authors: 'Autores',
      updated: 'Actualizada',
    },
    kindCreate: 'Página nueva',
    kindEdit: 'Edición',
    searchPlaceholder: 'Filtrar',
  },

  status: {
    open: 'Abierta',
    changes_requested: 'Cambios solicitados',
    approved: 'Aprobada',
    merged: 'Publicada',
    closed: 'Descartada',
  } satisfies Record<ProposalStatus, string>,

  checkState: {
    pending: 'Pendiente de aprobación',
    success: 'Aprobación completada',
    failure: 'Cambios solicitados',
    unknown: 'Sin información',
  } satisfies Record<CheckState, string>,

  author: {
    licensed: 'con licencia GitHub',
    unlicensed: 'sin licencia',
    authors: 'Autores',
  },

  detail: {
    back: 'Volver a las propuestas',
    loadError: 'No se ha podido cargar la propuesta.',
    page: 'Página',
    entity: 'Documentación',
    branch: 'Rama',
    approvals: (current: number, required: number) =>
      `Aprobaciones: ${current} de ${required}`,
    approvalsTitle: 'Aprobaciones',
    noApprovals: 'Todavía no hay aprobaciones.',
    approvedBy: (name: string) => `Aprobada por ${name}`,
    changesTitle: 'Cambios',
    noChanges: 'Esta propuesta no contiene cambios en archivos.',
    binaryFile: 'Archivo binario: no se puede mostrar la diferencia.',
    fileAdded: 'Nuevo',
    fileModified: 'Modificado',
    fileRemoved: 'Eliminado',
    noDifferences: 'Sin diferencias.',
    eventsTitle: 'Actividad',
    viewOnGithub: 'Ver pull request en GitHub',
    editProposal: 'Editar propuesta',
    approve: 'Aprobar',
    requestChanges: 'Solicitar cambios',
    merge: 'Publicar',
    discard: 'Descartar',
    approveBlocked: {
      author: 'No puedes aprobar una propuesta en la que eres autor/a.',
      'not-approver': 'No tienes permiso para aprobar esta propuesta.',
      'already-approved': 'Ya has aprobado esta versión de la propuesta.',
      'not-open': 'La propuesta ya no está abierta.',
    },
    approveDone: 'Aprobación registrada.',
    mergeFailedAfterApproval: (message: string) =>
      `Aprobada, pero no se ha podido publicar automáticamente: ${message}`,
    requestChangesDone: 'Se han solicitado cambios.',
    mergeDone: 'Cambios publicados.',
    discardDone: 'Propuesta descartada.',
    requestChangesDialogTitle: 'Solicitar cambios',
    requestChangesComment: 'Comentario',
    requestChangesHelp: 'Explica qué hay que cambiar antes de aprobar.',
    requestChangesSubmit: 'Enviar',
    discardDialogTitle: '¿Descartar la propuesta?',
    discardDialogBody:
      'Se cerrará la propuesta y se eliminarán sus cambios pendientes. Esta acción no se puede deshacer.',
    discardConfirm: 'Descartar propuesta',
    eventType: {
      created: 'Propuesta creada',
      commit: 'Nuevos cambios',
      joined: 'Se ha unido como autor/a',
      approved: 'Aprobada',
      changes_requested: 'Cambios solicitados',
      merged: 'Publicada',
      closed: 'Cerrada',
      conflict: 'Conflicto detectado',
      imported: 'Importada desde GitHub',
      head_changed: 'La rama ha cambiado',
    } satisfies Record<ProposalEvent['type'], string>,
  },

  edit: {
    title: 'Editar página',
    pageTitle: 'Editar página',
    missingParams: 'Falta la documentación o la página que se quiere editar.',
    loadError: 'No se ha podido cargar la página.',
    editingProposal: 'Estás editando una propuesta abierta.',
    existingProposalNotice:
      'Esta página ya tiene una propuesta abierta. Tus cambios se añadirán a ella.',
    viewExistingProposal: 'Ver propuesta',
    messageLabel: 'Mensaje del cambio',
    messageHelp: 'Describe brevemente qué has cambiado.',
    messagePlaceholder: 'docs: actualiza la página',
    submit: 'Proponer cambios',
    submitting: 'Enviando…',
    cancel: 'Cancelar',
    frontmatterInvalid:
      'Corrige el YAML del front-matter antes de proponer cambios.',
    nothingChanged: 'Todavía no hay cambios que proponer.',
    submitError: 'No se han podido enviar los cambios.',
    unsavedChanges: 'Hay cambios sin enviar.',
    pendingImages: (count: number) =>
      count === 1
        ? 'Se subirá 1 imagen nueva con la propuesta.'
        : `Se subirán ${count} imágenes nuevas con la propuesta.`,
    imageUploadFailed: 'No se ha podido leer la imagen.',
    imageUploadTooLarge: 'La imagen es demasiado grande.',
  },

  conflict: {
    title: 'La página ha cambiado',
    body: 'Alguien ha modificado esta página mientras la editabas. Puedes recargar la última versión (tus cambios se perderán) o revisar las diferencias.',
    reload: 'Recargar',
    showDiff: 'Ver diferencias',
    backToChoice: 'Volver',
    diffTitle: 'Tus cambios frente a la versión actual',
    diffLegend:
      'Las líneas en rojo son de la versión actual; las verdes, de tu versión.',
    close: 'Cerrar',
  },

  create: {
    title: 'Nueva página',
    missingParams:
      'Falta la documentación en la que se quiere crear la página.',
    titleLabel: 'Título de la página',
    fileNameLabel: 'Ruta del archivo',
    fileNameHelp:
      'Se genera a partir del título. Debe terminar en .md. Puedes incluir carpetas.',
    parentLabel: 'Sección del menú (archivo de una página existente)',
    parentHelp: 'Deja vacío para añadirla al primer nivel del menú.',
    submit: 'Proponer página',
    titleRequired: 'Escribe un título.',
    fileNameInvalid:
      'El nombre debe terminar en .md y no puede contener «..» ni empezar por «/».',
    submitError: 'No se ha podido enviar la página.',
    defaultMessage: (title: string) => `docs: añade «${title}»`,
  },

  addon: {
    pendingBanner: 'Hay cambios pendientes de revisión en esta página',
    viewProposal: 'Ver propuesta',
    edit: 'Editar esta página',
    newPage: 'Nueva página',
    viewOnGithub: 'Ver en GitHub',
    toolbarLabel: 'Acciones de Docs Studio',
  },
};
