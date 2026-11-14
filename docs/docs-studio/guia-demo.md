# Docs Studio: guía de la demo completa (de Confluence a TechDocs)

Esta guía explica cómo funciona hoy la demo y cómo reproducirla a mano. Cuenta la historia completa:

1. un espacio de Confluence se migra a Markdown en GitHub;
2. se publica en Backstage con TechDocs y con permisos por sección;
3. personas **sin licencia de GitHub** leen y proponen cambios desde Backstage;
4. una persona aprobadora valida los cambios, y el resultado aparece en TechDocs.

Marcas que se usan en toda la guía:

- ✅ **Verificado:** se ha comprobado en este entorno, con datos reales.
- ⚠️ **No verificado:** es diseño o deducción, no se ha probado.
- 🎬 / ⏸️: segmentos para grabar y esperas que no se graban (ver [Grabación](#7-segmentos-de-grabación)).

El diagrama del flujo de extremo a extremo está en [`flujo-demo.md`](flujo-demo.md).

## Índice

1. [La historia en 6 pasos](#1-la-historia-en-6-pasos)
2. [Las piezas y cómo encajan](#2-las-piezas-y-cómo-encajan)
3. [Identidad, licencias y permisos](#3-identidad-licencias-y-permisos)
4. [Requisitos y arranque](#4-requisitos-y-arranque)
5. [Reproducción manual paso a paso](#5-reproducción-manual-paso-a-paso)
6. [Qué cubre y qué no](#6-qué-cubre-y-qué-no)
7. [Segmentos de grabación](#7-segmentos-de-grabación)
8. [Resolución de problemas y reinicio](#8-resolución-de-problemas-y-reinicio)

---

## 1. La historia en 6 pasos

### 1.1 El espacio de Confluence ✅

- **Dónde está:** un sitio de **Confluence Cloud con plan Free**, así que no hace falta comprar ninguna licencia de Confluence. Es el espacio `POC`, cuya página raíz es «Engineering Handbook».
- **Cómo se llenó:** con el script `scripts/seed_confluence.py` del repositorio [`0GiS0/confluence-to-github-poc`](https://github.com/0GiS0/confluence-to-github-poc), que usa la API de Confluence.
  - Crea o actualiza **21 páginas** con adjuntos.
  - Si se vuelve a ejecutar, no duplica páginas, aunque Confluence puede subir la versión de las páginas que ya existían.
- **Qué pone a prueba el contenido:** tablas, bloques de código, paneles (_callouts_), enlaces entre páginas, adjuntos, una macro `include` y una macro desconocida.

### 1.2 Exportación a Markdown ✅ (⏸️ no se graba)

- **Herramienta:** [`confluence-markdown-exporter`](https://pypi.org/project/confluence-markdown-exporter/) 5.6.0, que se ejecuta con `scripts/run_export.py` en el mismo repositorio. No hay ningún workflow de GitHub Actions: se lanza a mano.
- **Configuración** (`config/cme-settings.json`):
  - **Estructura:** la salida va a `docs/confluence`. Cada página padre se convierte en una carpeta con `README.md`, y cada hoja en `<Título>.md`.
  - **Adjuntos:** todos, en `attachments/<id><extensión>`.
  - **Enlaces:** relativos, tanto entre páginas como a adjuntos.
  - **Macros y comentarios:** las macros salen en línea; los comentarios no se exportan.
  - **Actualización:** la exportación es completa (`skip_unchanged: false`) y borra lo que ya no existe (`cleanup_stale: true`).
- **Variables** (solo los nombres): `CONFLUENCE_URL`, `CONFLUENCE_USER`, `CONFLUENCE_API_TOKEN` y `CONFLUENCE_SPACE_KEY`.
- **Validación:** `scripts/validate_export.py` compara la exportación con el espacio vivo. Comprueba el inventario de páginas, los enlaces relativos, los restos de macros y los adjuntos.
- **Informes** (carpeta `reports/` del repositorio):

  - [`fidelity-matrix.md`](https://github.com/0GiS0/confluence-to-github-poc/blob/main/reports/fidelity-matrix.md) dice qué se conserva, qué se degrada y qué se pierde:

    | Resultado    | Elementos                                                    |
    | ------------ | ------------------------------------------------------------ |
    | Se conservan | tablas, código, _callouts_, enlaces entre páginas y adjuntos |
    | Se degradan  | anclas del índice (TOC) y la macro de ancla                  |
    | Se pierden   | `include` y la macro desconocida                             |

  - [`remediation-report.md`](https://github.com/0GiS0/confluence-to-github-poc/blob/main/reports/remediation-report.md) resume la validación y propone los arreglos, que son manuales:
    - **Resultado:** 21/21 páginas, 2/2 adjuntos, 86 enlaces revisados, 0 archivos rotos y 5 anclas internas sin resolver (avisos).
    - **Arreglos propuestos:** copiar el contenido del `include`, sustituir el marcador de la macro desconocida y corregir los enlaces del índice.

> ⚠️ El exportador escribe `docs/confluence/confluence-lock.json`. No se ha verificado si se usa para exportaciones incrementales.

### 1.3 Del corpus al repositorio de documentación ✅

`scripts/docs-studio/seed-playground.mjs` (en este repositorio) toma el corpus exportado y genera el repositorio privado [`AgenticOrganization/docs-studio-playground`](https://github.com/AgenticOrganization/docs-studio-playground).

```text
docs-studio-playground/
├── catalog-info.yaml        Location -> engineering/ y security/
├── engineering/             TechDocs «Engineering Handbook» (sin «Security & Compliance»)
│   ├── catalog-info.yaml    owner: group:handbook-approvers
│   │                        docs-studio/approvers: group:default/handbook-approvers
│   ├── mkdocs.yml           con nav explícito
│   └── docs/…               páginas y attachments/
└── security/                TechDocs «Security Handbook»
    ├── catalog-info.yaml    owner: group:security-team
    │                        docs-studio/visibility: restricted
    ├── mkdocs.yml
    └── docs/…
```

- **Enlaces entre secciones:**
  - de `engineering` a `security`: pasan a texto plano con la marca «(restricted)»;
  - de `security` a `engineering`: pasan a rutas absolutas de TechDocs;
  - **los demás:** se reescriben para que sigan funcionando.
- **Informe de enlaces:** el script lo imprime al terminar y sale con código 1 si queda alguno roto.
- **GitHub:** por defecto solo genera un directorio local. Con `--push <owner/repo> --apply` además hace el push.
- **Registro en Backstage:** `app-config.yaml` tiene una ubicación de tipo `url` que apunta al `catalog-info.yaml` raíz del playground, así que en el catálogo aparecen las dos entidades `engineering-handbook` y `security-handbook`.

### 1.4 ¿Repositorio de docs dedicado o `docs/` junto al código?

| Opción                      | Qué es                                                                                                                                                                        | ¿Se demuestra?                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Repositorio dedicado**    | Un repositorio solo de documentación, con uno o varios sitios de TechDocs                                                                                                     | ✅ **Sí.** Es lo que hace la demo (`docs-studio-playground`) |
| **`docs/` junto al código** | En el repositorio del servicio: `mkdocs.yml` + `docs/` + `catalog-info.yaml` con `backstage.io/techdocs-ref: dir:.`. La documentación queda en la entidad del propio servicio | ❌ **No.** No se ha probado                                  |

Para que funcione la opción «junto al código» (⚠️ todo sin verificar):

1. Añadir el repositorio a `docsStudio.allowedRepositories` y tener la GitHub App instalada en él.
2. El ruleset con el estado obligatorio `docs-studio/approval` afectaría a **todas** las PR del repositorio, también a las de código: un status check obligatorio no se puede limitar a una ruta. Hay dos salidas:
   - que la App publique `success` en las PR que no tocan `docs/`;
   - no exigir el estado en ese repositorio y aprobar solo en Backstage, lo que quita la garantía de que la App no tiene _bypass_.

Es la decisión de diseño más importante si el cliente quiere la documentación junto a su código.

### 1.5 Permisos en dos capas ✅

| Capa                                  | Qué controla                                    | Comportamiento verificado                                                                                                                                                                                                                                            |
| ------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backstage** (política de permisos)  | Catálogo, TechDocs, búsqueda, chat y propuestas | Las entidades `docs-studio/visibility: restricted` solo las leen sus propietarios:<br>• Sansa (`security-team`) ve el Security Handbook en el catálogo, TechDocs y la búsqueda («vault»).<br>• Arya y Jon reciben **404** y su búsqueda de «vault» no devuelve nada. |
| **GitHub** (permisos del repositorio) | Quién lee los archivos en github.com            | `security/` está en el **mismo repositorio** que `engineering/` y el permiso base de la organización es _read_. Por eso **Jon (con licencia) lee `security/docs/Secrets Management.md` en GitHub** (en 7,4 s).                                                       |

Las implicaciones:

- **Personas sin licencia:** no tienen acceso a GitHub, así que Backstage es su única puerta y la restricción se cumple.
- **Personas con licencia:** la restricción de Backstage solo es tan fuerte como los permisos del repositorio en GitHub.

**Recomendación:** poner el contenido restringido en un **repositorio separado** que solo pueda leer el equipo propietario (o, como mínimo, cambiar el permiso base de la organización). Se registra en el catálogo igual, con la misma anotación.

> ⚠️ El chat recibe un token emitido en nombre de la persona, así que la misma política se aplica a sus herramientas. Con Sansa no se ha probado porque el chat está deshabilitado para ella.

### 1.6 Flujo con licencia y sin licencia ✅

Las personas sin licencia (Arya y Sansa) leen y proponen desde Backstage:

1. **La propuesta es una PR.** La GitHub App crea la rama, el commit y la PR. Arya figura como **autora del commit** y la App como _committer_.
2. **Aprobación.** Una persona aprobadora (Samwell, con licencia) aprueba en Backstage. La App publica el estado `docs-studio/approval` y fusiona la PR.
3. **TechDocs.** TechDocs reconstruye el sitio y el cambio aparece.

Las personas con licencia (Jon) tienen dos caminos:

- **Desde Backstage:** igual que Arya.
- **Directamente en GitHub:** su PR queda **bloqueada** por el ruleset hasta que alguien la apruebe en Backstage.

En los dos casos hay un único proceso de aprobación.

---

## 2. Las piezas y cómo encajan

| Pieza                                                   | Qué hace                                                                                                                                                                                                                                                                                  | Dónde                                                                           |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Backstage** (1.56)                                    | Portal interno: catálogo, TechDocs, búsqueda y chat                                                                                                                                                                                                                                       | `packages/app`, `packages/backend`                                              |
| **TechDocs**                                            | Genera el sitio MkDocs de cada entidad y lo sirve. En local usa `mkdocs` de un _venv_ de Python, sin Docker                                                                                                                                                                               | `techdocs.*` en `app-config.yaml`                                               |
| **Docs Studio (frontend)**                              | Botones «Editar esta página», «Nueva página» y «Ver en GitHub» en TechDocs, editor WYSIWYG (Tiptap), aviso de cambios pendientes, lista y detalle de propuestas                                                                                                                           | [`plugins/docs-studio`](../../plugins/docs-studio/README.md)                    |
| **Docs Studio (backend)**                               | API REST, GitHub App (ramas, commits, PR, estados y merge), regla de una propuesta por página, coautoría, conflictos (409), aprobación y sincronización                                                                                                                                   | [`plugins/docs-studio-backend`](../../plugins/docs-studio-backend/README.md)    |
| **Docs Studio (common)**                                | Permisos (`docs-studio.proposal.create`, `docs-studio.proposal.approve`), anotaciones y tipos                                                                                                                                                                                             | [`plugins/docs-studio-common`](../../plugins/docs-studio-common/README.md)      |
| **Política de permisos**                                | Regla de visibilidad restringida y quién aprueba. Vive en la aplicación, no en el plugin                                                                                                                                                                                                  | [`docsStudioPolicy.ts`](../../packages/backend/src/modules/docsStudioPolicy.ts) |
| **SQLite**                                              | Propuestas, autores y aprobaciones. Sobrevive a los reinicios                                                                                                                                                                                                                             | `.docs-studio-data/docs-studio.sqlite` (ignorado por git)                       |
| **Sincronización**                                      | Cada minuto refresca el estado de las propuestas e **importa las PR abiertas directamente en GitHub**. En local no hay _webhooks_                                                                                                                                                         | backend de Docs Studio (`docsStudio.sync`)                                      |
| **GitHub App** «Docs Studio (local)»                    | Crea las ramas, los commits y las PR, publica el estado `docs-studio/approval` y fusiona (con _merge commit_). Sus credenciales están en `github-app-docs-studio-credentials.yaml` (ignorado por git)                                                                                     | se crea con `scripts/docs-studio/create-github-app.mjs`                         |
| **Repositorio playground**                              | `AgenticOrganization/docs-studio-playground`: privado, rama `main`, con dos sitios de TechDocs                                                                                                                                                                                            | se genera con `seed-playground.mjs`                                             |
| **Ruleset** «Docs Studio approval»                      | Protege `main`: exige PR, exige el estado `docs-studio/approval` publicado **solo por la App** (`integration_id`) y bloquea _force-push_ y borrado. **Sin _bypass_**                                                                                                                      | `scripts/docs-studio/apply-ruleset.mjs`                                         |
| **Lista de repositorios permitidos**                    | `docsStudio.allowedRepositories`. Hoy solo incluye el playground. La App está instalada en **todos** los repositorios de la organización (decisión deliberada para la demo), pero Docs Studio solo actúa en los de esta lista                                                             | `app-config.yaml`                                                               |
| **Aplicación de Entra** «Backstage Docs Studio (local)» | Inicio de sesión de Backstage con Microsoft. Reconoce a cada persona por su id de Entra (`graph.microsoft.com/user-id`) o por su correo; sin entidad `User` en el catálogo no se puede entrar                                                                                             | `auth.providers.microsoft`                                                      |
| **GitHub EMU + OIDC**                                   | Las cuentas de GitHub con licencia (Jon, Samwell) son _managed users_ de la enterprise EMU, que inician sesión en GitHub a través de Entra (OIDC)                                                                                                                                         | configuración de la enterprise                                                  |
| **Copilot Chat + OAuth App** «backstage-demo»           | El chat usa el token de GitHub de la persona (con su licencia de Copilot). La persona conecta GitHub una sola vez (EMU OIDC → «Authorize backstage-demo»). Las herramientas del chat (MCP actions) se llaman con un token emitido en nombre de esa persona, así que respetan los permisos | `plugins/copilot-chat*`, `auth.providers.github`                                |

---

## 3. Identidad, licencias y permisos

### 3.1 Matriz de personas ✅

Las identidades reales (ids de Entra, correos y usuarios de GitHub) están en `examples/docs-studio/org.local.yaml`, que está en `.gitignore`. Nunca se suben al repositorio.

|                                        | Arya Stark        | Sansa Stark                                   | Jon Snow                            | Samwell Tarly                                | guest                                 |
| -------------------------------------- | ----------------- | --------------------------------------------- | ----------------------------------- | -------------------------------------------- | ------------------------------------- |
| Licencia GHEC (EMU)                    | ❌                | ❌                                            | ✅ (+ Copilot)                      | ✅                                           | —                                     |
| Grupo                                  | `engineering`     | `security-team`                               | `engineering`                       | `handbook-approvers`                         | —                                     |
| Inicio de sesión en Backstage          | Microsoft (Entra) | Microsoft (Entra)                             | Microsoft (Entra)                   | Microsoft (Entra)                            | Guest                                 |
| Leer el Engineering Handbook           | ✅                | ✅                                            | ✅                                  | ✅                                           | ✅                                    |
| Leer el Security Handbook en Backstage | ❌ 404            | ✅                                            | ❌ 404                              | ❌ (⚠️ no se ha probado)                     | ❌ (⚠️ no se ha probado)              |
| Leer `security/` en GitHub             | sin cuenta        | sin cuenta                                    | ⚠️ **sí** (permiso base _read_)     | ⚠️ sí, por la misma regla (no se ha probado) | —                                     |
| Editar o crear desde Backstage         | ✅                | ⚠️ en el Security Handbook (no se ha probado) | ✅                                  | ⚠️ (no se ha probado)                        | ❌ (⚠️ los botones se ven igualmente) |
| Editar o crear desde GitHub            | ❌                | ❌                                            | ✅ (la PR se importa a Docs Studio) | ⚠️ (no se ha probado)                        | ❌                                    |
| Aprobar                                | ❌                | ❌                                            | ❌                                  | ✅ (Engineering Handbook)                    | ❌                                    |
| Chat de Copilot                        | ❌ deshabilitado  | ❌ deshabilitado                              | ✅                                  | ⚠️ no ha conectado GitHub                    | ❌                                    |

### 3.2 Cómo se sabe quién tiene licencia

- **Regla:** la entidad `User` del catálogo de una persona con licencia lleva la anotación `github.com/user-login`; las personas sin licencia no la llevan.
- **Para qué se usa:** Docs Studio y el chat deciden con esa anotación si mostrar «Ver en GitHub» y si habilitar el chat.
- ⚠️ Es una declaración del catálogo, **no una comprobación en vivo** contra GitHub ni contra la API de Copilot.
- En la enterprise EMU, «sin licencia» significa en la práctica que la persona **no está asignada a la aplicación empresarial de GitHub en Entra**, así que no tiene cuenta de GitHub. Con Arya y Sansa se cumple: no tienen cuenta.

### 3.3 Cómo queda la autoría sin cuenta de GitHub ✅

Comprobado en las PR #1 y #3 del playground:

- **Autor de la PR en GitHub:** `app/docs-studio-local`, la App.
- **Commits:**
  - `author`: el nombre y el correo de Entra de la persona de Backstage (por ejemplo `Arya Stark <…@….onmicrosoft.com>`). Sin cuenta de GitHub, el commit no enlaza ningún perfil.
  - `committer`: `docs-studio-local[bot]`.
  - Si Jon edita después la misma página, su commit lleva el trailer `Co-authored-by: Arya Stark <…>` y su autor es su usuario EMU.
- **Cuerpo de la PR:** un enlace «Review this proposal in Backstage», la lista de autores y un bloque oculto `<!-- docs-studio:metadata … -->`. Ese bloque guarda los autores, si cada uno tiene licencia o no y las aprobaciones con el SHA aprobado.
- **Firma:** los commits que crea la App con un autor personalizado salen **sin firmar** (`verification.reason = unsigned`). Los commits que Jon hace en el editor web de GitHub sí salen **Verified**.

### 3.4 Aprobación

- **Quién puede aprobar:** quien tenga el permiso `docs-studio.proposal.approve`. Lo tienen los propietarios de la entidad y las personas o grupos de la anotación `docs-studio/approvers`.
- **Cuatro ojos:** nadie aprueba su propia propuesta.
- **El estado de GitHub:** al aprobar, la App publica `docs-studio/approval: success` («Approved by …») sobre el **SHA de cabeza**. Si la rama avanza, la aprobación deja de valer.
- **Merge automático:** con `autoMergeOnApproval: true`, la App fusiona en cuanto llega la aprobación (con _merge commit_), así que no aparece ningún botón «Publicar». Con `false`, la persona aprobadora tendría que publicar a mano.
- ⚠️ **No verificado:** la aprobación por una persona sin licencia. Ninguna persona sin licencia está en `handbook-approvers`; según el diseño, el permiso depende del grupo del catálogo y no de la licencia.

---

## 4. Requisitos y arranque

### 4.1 Requisitos

- **Herramientas:** Node 22 o superior, Yarn 4 (ver `package.json`), `gh`, un _venv_ de Python con `mkdocs` y `mkdocs-techdocs-core` (por defecto `~/.venvs/techdocs`, configurable con `TECHDOCS_VENV`), y Chrome o Edge (Safari no funciona en `http://localhost`, ver la sección 8).
- **Ficheros locales, todos ignorados por git:**

  | Fichero                                   | Contenido                                                                                                                                                               |
  | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `.env`                                    | Variables `GITHUB_TOKEN`, `AUTH_GITHUB_CLIENT_ID`, `AUTH_GITHUB_CLIENT_SECRET`, `AUTH_MICROSOFT_CLIENT_ID`, `AUTH_MICROSOFT_CLIENT_SECRET` y `AUTH_MICROSOFT_TENANT_ID` |
  | `app-config.local.yaml`                   | Copia de `app-config.local.example.yaml`: el bloque `integrations.github` con la App                                                                                    |
  | `github-app-docs-studio-credentials.yaml` | Credenciales de la App                                                                                                                                                  |
  | `examples/docs-studio/org.local.yaml`     | Personas y grupos reales (lo crea `scripts/start.sh` desde `org.example.yaml` si no existe)                                                                             |

- **Montaje desde cero** (GitHub App, repositorio, ruleset y Entra): los pasos están en [`scripts/docs-studio/README.md`](../../scripts/docs-studio/README.md). Los scripts que cambian algo son _dry-run_ por defecto y necesitan `--apply`.

### 4.2 Arrancar

```bash
./scripts/start.sh 2>&1 | tee /tmp/docs-studio-backstage.log
```

- **Qué hace:** carga `.env`, añade el _venv_ de TechDocs al `PATH` y lanza `yarn start`.
- **Puertos:** frontend en `http://localhost:3000` y backend en `:7007`.
- **Búsqueda:** el índice de búsqueda vive en memoria y tarda alrededor de un minuto en llenarse.

### 4.3 Sesiones de las personas

- **A mano:** usa **un perfil de navegador por persona** (perfiles de Chrome o Edge, o ventanas InPrivate distintas). Así no se mezclan las cookies de Entra. En cada perfil, «Sign in with Microsoft» y elige la cuenta correcta en el selector de Entra.
- **Las pruebas automáticas** reutilizan perfiles de Chrome guardados **fuera del repositorio**, en la carpeta de la sesión del agente (`files/persona-profiles/<persona>`). No guardan contraseñas. Las contraseñas las escribió la usuaria a mano y nadie más.

---

## 5. Reproducción manual paso a paso

Antes de empezar, Backstage tiene que estar arrancado, con un perfil de navegador por persona. Para verificar en GitHub hace falta una cuenta con acceso al playground. Los tiempos y clics son los de la prueba automática.

### Arya (sin licencia, `engineering`)

| #   | Paso                                                                                            | Resultado esperado                                                                                                                                                      | Dónde verificarlo                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Abrir `http://localhost:3000` → **Sign in with Microsoft** → cuenta de Arya                     | Entra en Backstage. En el primer inicio de sesión, Entra pidió **cambiar la contraseña**                                                                                | Settings → perfil «Arya Stark»                                                                                                                                                     |
| A2  | **Docs** → «Engineering Handbook» → Platform Operations → Deployment Guide → Rollback Procedure | Lee la página. La barra muestra «Editar esta página» y «Nueva página», pero **no** «Ver en GitHub» (20,5 s, 3 clics)                                                    | —                                                                                                                                                                                  |
| A3  | El índice de **Docs** y la URL directa `/docs/default/component/security-handbook`              | El Security Handbook no aparece en el índice y la URL directa da **ERROR 404**. Buscar «vault» no lo devuelve                                                           | —                                                                                                                                                                                  |
| A4  | Onboarding → Team Glossary → **Editar esta página** → añadir una frase → **Proponer cambios**   | Aparece la propuesta, «Abierta · Pendiente de aprobación», y la página muestra el aviso «Hay cambios pendientes de revisión en esta página» (38,6 s, 7 clics, 2 campos) | En GitHub: PR nueva de `app/docs-studio-local` en una rama `docs-studio/…`; commit con autora Arya y committer `docs-studio-local[bot]`; estado `docs-studio/approval` **pending** |
| A5  | **Nueva página** → título, sección y texto → **Proponer página**                                | Nueva propuesta de creación (39,7 s, 6 clics, 2 campos)                                                                                                                 | En la PR: el `.md` nuevo **y** la entrada nueva en el `nav` de `mkdocs.yml`                                                                                                        |
| A6  | **Docs Studio** → «Mis propuestas»                                                              | Lista con el estado de cada propuesta                                                                                                                                   | —                                                                                                                                                                                  |
| A7  | **Copilot Chat**                                                                                | «Chat requires a GitHub Copilot license. Ask your administrator for access.» (10,8 s)                                                                                   | —                                                                                                                                                                                  |
| A8  | (Opcional) Abrir una propuesta propia → **Descartar**                                           | La App cierra la PR y borra la rama (14,3 s, 2 clics)                                                                                                                   | La PR aparece como _Closed_ (como la #2)                                                                                                                                           |

### Sansa (sin licencia, `security-team`)

| #   | Paso                                       | Resultado esperado                                                 |
| --- | ------------------------------------------ | ------------------------------------------------------------------ |
| S1  | Iniciar sesión con Microsoft con su cuenta | Igual que Arya, incluido el cambio de contraseña del primer inicio |
| S2  | **Docs**                                   | Ve **dos** sitios: Engineering Handbook y **Security Handbook**    |
| S3  | Security Handbook → Secrets Management     | Lee el contenido restringido (25,8 s, 4 clics)                     |
| S4  | Buscar «vault»                             | Aparece la página restringida                                      |
| S5  | Copilot Chat                               | Deshabilitado, con el mismo mensaje que Arya                       |

### Jon (con licencia, `engineering`)

| #   | Paso                                                                                                                                                                    | Resultado esperado                                                                                                      | Dónde verificarlo                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| J1  | Iniciar sesión con Microsoft con su cuenta                                                                                                                              | Entra sin cambio de contraseña                                                                                          | —                                                                                                             |
| J2  | Leer una página                                                                                                                                                         | Igual que Arya, pero con el botón «Ver en GitHub»                                                                       | —                                                                                                             |
| J3  | URL directa del Security Handbook                                                                                                                                       | **404** en Backstage                                                                                                    | En github.com sí puede abrir `security/docs/Secrets Management.md` (ver la sección 1.5)                       |
| J4  | Editar la misma página que tiene abierta Arya → **Proponer cambios**                                                                                                    | Se **une** a la propuesta de Arya como coautor (38 s)                                                                   | Nuevo commit en la misma PR con el trailer `Co-authored-by: Arya Stark` y los dos autores en el cuerpo        |
| J5  | **Ver en GitHub** → lápiz → editar → **Commit changes…** → nueva rama → **Propose changes** → **Create pull request**                                                   | PR nativa (51 s, 9 clics). En GitHub sale **bloqueada** porque falta el estado obligatorio `docs-studio/approval`       | En 10–60 s aparece en Docs Studio como «Importada desde GitHub»; la App publica el estado **pending «(0/1)»** |
| J6  | En GitHub: **Add file → Create new file** → PR                                                                                                                          | PR nativa de página nueva (26,4 s), importada igual                                                                     | ⚠️ **No** añade la entrada al `nav` de `mkdocs.yml`: tras el merge, la página solo se abre con su URL directa |
| J7  | **Copilot Chat** → la primera vez, conectar GitHub (EMU OIDC → selector de Entra → «Authorize backstage-demo», unos 52 s) → preguntar «What is the rollback procedure?» | Respuesta con `kubectl rollout undo` que cita la página Rollback Procedure como fuente (llega en 17 s; 27,2 s en total) | —                                                                                                             |

### Samwell (con licencia, `handbook-approvers`)

| #   | Paso                                                    | Resultado esperado                                                                                                                 | Dónde verificarlo                                                                                                                               |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | Iniciar sesión con Microsoft con su cuenta              | Entra                                                                                                                              | —                                                                                                                                               |
| W2  | **Docs Studio** → «Pendientes de mi aprobación»         | Las propuestas de Arya y Jon, incluidas las PR nativas importadas                                                                  | —                                                                                                                                               |
| W3  | Abrir una propuesta → revisar los cambios → **Aprobar** | La propuesta pasa a **«Publicada»** al momento (unos 29 s, 4 clics). No aparece ningún botón «Publicar» porque la App fusiona sola | En la PR: estado `docs-studio/approval` **success**, «Approved by Samwell Tarly»; _Merged by_ `app/docs-studio-local`; _merge commit_ en `main` |

### Cualquier persona: ver el cambio en TechDocs

| #   | Paso                                      | Resultado esperado                                                                                                                                                |
| --- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Volver a la página cambiada tras el merge | El texto nuevo se ve en la primera visita (unos 24 s, 4 clics, con el generador local). Si no, recargar: TechDocs comprueba si hay cambios y reconstruye el sitio |
| T2  | La página creada desde Docs Studio        | Aparece en el menú de su sección («Useful Links» en Onboarding, PR #3)                                                                                            |
| T3  | La página creada desde GitHub (J6)        | No sale en el menú; solo se abre con su URL (`team-rituals.md`, PR #5)                                                                                            |

---

## 6. Qué cubre y qué no

| Tema                                                                                                                                       | Estado                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Lectura con permisos por entidad en Backstage (catálogo, TechDocs y búsqueda)                                                              | ✅ cubierto y verificado                                                                                                |
| Restricción equivalente en GitHub                                                                                                          | ❌ **no**: mismo repositorio y permiso base _read_. Recomendación: repositorio separado                                 |
| Editor WYSIWYG con ida y vuelta fiel del Markdown de MkDocs (front-matter, admonitions, tablas, imágenes y enlaces)                        | ✅ con pruebas sobre el corpus real                                                                                     |
| Propuesta = rama + PR de la App; autoría de la persona; coautoría; una propuesta por página                                                | ✅                                                                                                                      |
| Conflictos (409)                                                                                                                           | ✅ detectados, con diálogo y diff. ⚠️ Para resolverlos hay que recargar y **se pierde la edición**                      |
| Crear páginas (con entrada en el `nav`)                                                                                                    | ✅                                                                                                                      |
| Aprobación en Backstage + estado obligatorio sin _bypass_ + merge automático                                                               | ✅                                                                                                                      |
| Importar PR nativas de GitHub al mismo flujo de aprobación                                                                                 | ✅                                                                                                                      |
| TechDocs actualizado tras el merge                                                                                                         | ✅                                                                                                                      |
| Chat para personas con licencia, con la página citada                                                                                      | ✅                                                                                                                      |
| Chat para personas sin licencia (**BYOK**)                                                                                                 | ❌ no implementado: el chat aparece deshabilitado                                                                       |
| SharePoint como fuente                                                                                                                     | ❌ fuera de alcance                                                                                                     |
| Coedición en tiempo real y comentarios en línea                                                                                            | ❌ fuera de alcance                                                                                                     |
| `docs/` junto al código en un repositorio de servicio                                                                                      | ❌ no demostrado (ver la sección 1.4)                                                                                   |
| Producción: alta disponibilidad, _webhooks_ en lugar del _polling_ de 1 minuto, base de datos real, secretos gestionados, firma de commits | ❌ no hecho                                                                                                             |
| App instalada en **todos** los repositorios de la organización                                                                             | Decisión deliberada para la demo. Docs Studio solo actúa en `allowedRepositories`                                       |
| Política de la enterprise EMU sobre OAuth Apps                                                                                             | ✅ hoy Jon puede autorizar «backstage-demo». ⚠️ Si la enterprise restringe las OAuth Apps, el chat dejaría de funcionar |

### Limitaciones conocidas

- **Inicio de sesión con GitHub:** tiene activado `dangerouslyAllowSignInWithoutUserInCatalog` (solo para la PoC).
- **Botones sin filtrar por permiso:** «Editar esta página» y «Nueva página» se ven aunque no se tenga permiso; el backend rechaza la acción.
- **Adjuntos:** el límite de 10 adjuntos por propuesta no se aplica todavía.
- **Retraso de estados:** hasta 1 minuto (sincronización por _polling_).
- **Alertas de GFM** (`> [!NOTE]`): se ven como citas en TechDocs.
- **Mensaje por defecto al crear una página:** está en español («docs: añade «…»»), así que el título de la PR #3 salió en español.
- **PR #1:** conserva el título antiguo «docs: docs: …», anterior a la corrección.
- **Contraseñas:** las de Arya y Sansa se cambiaron en su primer inicio de sesión.

---

## 7. Segmentos de grabación

La grabación se divide en **4 vídeos cortos** (MP4 1920×1080, tema `github-dark`, textos en inglés). 🎬 marca lo que se graba y ⏸️ las esperas, que se sustituyen por una tarjeta.

| Demo                       | 🎬 Se graba                                                                                                                                                                                           | ⏸️ No se graba                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **1. Migration**           | El espacio `POC` en Confluence (árbol de páginas, una página con tabla, macros y adjunto). Después, en GitHub, el Markdown exportado en `docs/confluence/…`, los adjuntos y los dos informes          | La ejecución de `run_export.py` y `validate_export.py` (tarjeta «Exporting the space · Not recorded»)   |
| **2. Permissions**         | Sansa ve el Security Handbook y lo encuentra al buscar «vault». Arya recibe 404 y no lo encuentra                                                                                                     | El cambio de perfil entre personas                                                                      |
| **3. Unlicensed proposal** | Arya edita y propone → la PR en GitHub (autor `app/docs-studio-local`, commit con Arya como autora y estado _pending_) → Samwell aprueba en Backstage → la PR queda fusionada → el cambio en TechDocs | La sincronización y la **reconstrucción de TechDocs** (tarjeta «TechDocs is rebuilding · Not recorded») |
| **4. Chat**                | Jon pregunta y recibe la respuesta con la página citada. Arya ve el chat deshabilitado                                                                                                                | La conexión inicial de Jon con GitHub (ya hecha)                                                        |

Cada grabación de la demo 3 crea una PR real y un merge en `main` del playground (ver la sección 8.3).

---

## 8. Resolución de problemas y reinicio

### 8.1 Problemas habituales

| Síntoma                                              | Causa                                                     | Solución                                                                                           |
| ---------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Entra entra con otra persona                         | El selector de cuentas reutiliza la sesión del perfil     | Un perfil de navegador por persona. En el selector, «Use another account» y escribir el UPN exacto |
| «Update your password» en el primer inicio de sesión | Política del inquilino para usuarios nuevos               | La persona elige una contraseña nueva (es el comportamiento esperado)                              |
| No se puede entrar con Microsoft                     | No hay entidad `User` que coincida (id de Entra o correo) | Revisa `examples/docs-studio/org.local.yaml` y reinicia o espera a que el catálogo se refresque    |
| TechDocs se queda cargando en Safari                 | La cookie `Secure` no se acepta en `http://localhost`     | Usa Chrome o Edge                                                                                  |
| No aparece el botón «Publicar» tras aprobar          | Es lo esperado: `autoMergeOnApproval: true`               | Comprueba en GitHub que la PR está _Merged_                                                        |
| La PR nativa no aparece en Docs Studio               | La sincronización corre cada minuto                       | Espera hasta 1 minuto y busca «Imported pull request #N» en el log                                 |
| La página creada en GitHub no sale en el menú        | El `mkdocs.yml` tiene un `nav` explícito                  | Añade la entrada al `nav` (o crea la página desde Docs Studio)                                     |
| «La página ha cambiado» (409) al proponer            | Otra persona cambió el archivo después de que lo abrieras | Revisa las diferencias, recarga y vuelve a aplicar el cambio (la edición sin enviar se pierde)     |
| El chat pide conectar GitHub                         | Es la primera vez o el token ha caducado                  | Conectar → EMU OIDC → «Authorize backstage-demo»                                                   |
| La búsqueda no devuelve nada nada más arrancar       | El índice en memoria aún no está lleno                    | Espera alrededor de un minuto                                                                      |

### 8.2 Reiniciar Backstage y las propuestas

- **Parar y arrancar:** `Ctrl+C` en la terminal de `start.sh` y `./scripts/start.sh` de nuevo. Las propuestas se conservan, porque están en SQLite.
- **Empezar con Docs Studio vacío** (⚠️ no se ha probado): cierra antes las PR abiertas, para Backstage y borra `.docs-studio-data/docs-studio.sqlite`. Las PR que sigan abiertas en GitHub se volverían a importar en la siguiente sincronización.

### 8.3 Volver el playground a su estado inicial

`main` está protegida por el ruleset: necesita PR, no admite _force-push_ y no tiene _bypass_. Por eso no se puede «rebobinar» empujando directamente, y `seed-playground.mjs` no tiene modo de reinicio. Hay dos opciones (⚠️ ninguna se ha probado todavía):

1. **Revertir por PR (recomendado, respeta las reglas).** En cada PR fusionada, una persona con licencia pulsa **Revert** en GitHub. Docs Studio importa la PR de reversión, Samwell la aprueba en Backstage y la App la fusiona.
2. **Regenerar desde la semilla.** Una persona administradora desactiva el ruleset un momento y empuja el resultado de `seed-playground.mjs --out … --force`. Después vuelve a activar el ruleset con `apply-ruleset.mjs --apply`.
   - Cambia la configuración del repositorio, así que necesita una confirmación explícita.
   - Después hay que vaciar la base de datos de Docs Studio (ver la sección 8.2).

PR creadas hasta ahora en el playground (todas reales):

| PR  | Qué                                                   | Estado    |
| --- | ----------------------------------------------------- | --------- |
| #1  | Arya edita Team Glossary; Jon se une como coautor     | Fusionada |
| #2  | Página nueva de Arya, descartada                      | Cerrada   |
| #3  | Arya crea «Useful Links»; Jon la edita                | Fusionada |
| #4  | Jon edita First Week Checklist en GitHub              | Fusionada |
| #5  | Jon crea `team-rituals.md` en GitHub (fuera del menú) | Fusionada |

---

## Veredicto de la comparación

La comparación completa entre personas con y sin licencia, con capturas y métricas, se ha hecho en inglés para el cliente. En resumen:

- **Merece la pena** como camino de **lectura y propuesta** para colaboradores ocasionales sin licencia:
  - Arya hace lo mismo que Jon en Docs Studio con el mismo tiempo y los mismos clics (38,6 s frente a 38 s al editar), sin licencia de GitHub y sin saber Markdown;
  - crear páginas es más seguro que en GitHub, porque Docs Studio añade la entrada al `nav`;
  - todos los cambios, vengan de Backstage o de GitHub, pasan por la misma aprobación.
- **No sustituye** al flujo de las personas desarrolladoras: para ellas, editar en Docs Studio es solo algo más rápido que en el editor web de GitHub (38 s frente a 51 s).
- **Costes que hay que aceptar:**
  - el contenido restringido necesita su propio repositorio;
  - sin BYOK, las personas sin licencia no tienen chat;
  - los commits de la App con la persona como autora salen sin firmar, lo que no encaja si la organización exige commits firmados;
  - falta endurecer el despliegue para producción.
