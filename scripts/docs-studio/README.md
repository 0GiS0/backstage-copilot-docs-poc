# Docs Studio: scripts de preparación

Scripts para montar el entorno de Docs Studio. Los que **cambian algo** (GitHub o
local) son _dry-run_ por defecto y necesitan `--apply`. Ninguno imprime secretos.
Todos aceptan `--help`.

| Script                      | ¿Cambia algo?                                                                | Confirmación explícita |
| --------------------------- | ---------------------------------------------------------------------------- | ---------------------- |
| `list-entra-unlicensed.mjs` | No (solo lectura, `az` + Graph)                                              | No                     |
| `seed-playground.mjs`       | Solo local (genera un directorio). Con `--push … --apply` hace push a GitHub | Para `--push --apply`  |
| `create-github-app.mjs`     | Crea una GitHub App en la organización (con `--apply`)                       | **Sí**                 |
| `apply-ruleset.mjs`         | Crea/actualiza un ruleset del repo (con `--apply`)                           | **Sí**                 |

## Orden recomendado

1. **Identificar usuarios sin licencia** (opcional, solo lectura): `az login --tenant <tenant> --allow-no-subscriptions`
   y `node scripts/docs-studio/list-entra-unlicensed.mjs`. Sirve para rellenar
   `examples/docs-studio/org.local.yaml` (`id` → `graph.microsoft.com/user-id`,
   `mail` o, si está vacío, `userPrincipalName` → `spec.profile.email`).
2. **Generar el contenido del repo de docs**:
   `node scripts/docs-studio/seed-playground.mjs --out ./playground-seed`
   (revisa el informe de enlaces; sale con código 1 si hay enlaces rotos).
3. **Crear el repo** privado `AgenticOrganization/docs-studio-playground` (manual,
   en GitHub) y subir el contenido: `seed-playground.mjs --out … --push AgenticOrganization/docs-studio-playground --apply`
   (o `git push` a mano desde el directorio generado).
4. **Crear la GitHub App**: `node scripts/docs-studio/create-github-app.mjs --org AgenticOrganization --apply`.
   Escribe `github-app-docs-studio-credentials.yaml` (ignorado por git, modo 0600).
   Después instálala **solo** en el repo del playground (URL que imprime el script).
5. **Aplicar el ruleset** con el id de la App:
   `node scripts/docs-studio/apply-ruleset.mjs --repo AgenticOrganization/docs-studio-playground --app-id <id> --apply`
   (haz primero un dry-run sin `--apply` para revisar el JSON).
6. **Configurar Backstage**: copia `app-config.local.example.yaml` a
   `app-config.local.yaml`, rellena `.env` (`GITHUB_TOKEN`, `AUTH_MICROSOFT_*`) y
   edita `examples/docs-studio/org.local.yaml`; arranca con `scripts/start.sh`.

## Notas

- `apply-ruleset.mjs` usa tu sesión de `gh` (o `GH_TOKEN`) y requiere permisos de
  administrador sobre el repo.
- El estado `docs-studio/approval` solo lo publica la App, por eso el ruleset lo
  exige con su `integration_id`.
- Los scripts no necesitan dependencias nuevas (Node ≥ 20, `gh`, `az` y el paquete
  `yaml` ya instalado en el repo).
