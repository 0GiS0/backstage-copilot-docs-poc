# Docs Studio: flujo de la demo de extremo a extremo

Este diagrama acompaña a la [guía de la demo](guia-demo.md). Muestra cómo el contenido va de Confluence a TechDocs y cómo viaja una propuesta de una persona sin licencia hasta publicarse.

```mermaid
flowchart TB
    subgraph M["1 · Migración (una vez)"]
        direction LR
        CF["Espacio de Confluence<br/>(Cloud Free, 21 páginas)"] --> EX["Exportación a Markdown<br/>+ informes de fidelidad"] --> SEED["seed-playground.mjs<br/>engineering/ + security/"]
    end
    REPO[("docs-studio-playground<br/>(GitHub)")]
    subgraph L["2 · Lectura en Backstage"]
        direction LR
        CAT["Catálogo + TechDocs"] --> POL{"Política de<br/>permisos"} --> READ["Leer y buscar<br/>(security: solo security-team)"]
    end
    subgraph P["3 · Propuesta y publicación"]
        direction LR
        EDIT["Arya, sin licencia<br/>edita en Docs Studio"] --> APP["GitHub App<br/>rama + commit + PR"] --> PR["PR con autora Arya<br/>estado pendiente"]
        NATIVE["Jon, con licencia<br/>PR directa en GitHub"] -->|importada| PR
        PR --> APPROVE["Samwell aprueba<br/>en Backstage"] --> CHECK["docs-studio/approval<br/>success + merge"]
    end
    BUILD["TechDocs reconstruye"]

    SEED --> REPO --> CAT
    POL --> EDIT
    CHECK --> REPO
    CHECK --> BUILD --> CAT
```

## Cómo leerlo

- **1 · Migración** (`CF → EX → SEED → REPO`): ocurre una sola vez. La exportación no se graba.
- **2 · Lectura** (`CAT → POL → READ`): la política de Backstage oculta las entidades restringidas. En GitHub, la restricción depende de los permisos del repositorio (ver la sección 1.5 de la guía).
- **3 · Propuesta** (`EDIT → APP → PR`): la App hace el trabajo en GitHub en nombre de una persona que no tiene cuenta.
- **PR nativas** (`NATIVE → PR`): entran en el mismo flujo; el ruleset las bloquea hasta la aprobación.
- **Publicación** (`APPROVE → CHECK → REPO → BUILD`): el estado obligatorio solo lo puede publicar la App, y la App no tiene _bypass_.
