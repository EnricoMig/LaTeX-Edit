# Arquitetura

## Objetivo

LaTeX Edit é uma **IDE web de LaTeX** cujo estado autoritativo dos arquivos fica no **servidor** (workspace Docker/NAS ou pasta local do Tomcat/Jetty). O browser é cliente fino: edita, lista, dispara compilação e renderiza PDF.

## Diagrama de alto nível

```text
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                    │
│  index.html · styles.css · ES modules                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐ │
│  │ explorer │ │  editor  │ │ preview  │ │ autocomplete  │ │
│  │ + DnD    │ │ textarea │ │ PDF.js   │ │ + settings    │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └───────────────┘ │
│       └────────────┴────────────┘                           │
│                      │ fetch JSON / PDF                     │
└──────────────────────┼──────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Contêiner Tomcat (ou Jetty em dev)                         │
│  WAR ROOT                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │HealthServlet│  │  FsServlet   │  │ CompileServlet    │ │
│  └─────────────┘  └──────┬───────┘  └─────────┬─────────┘ │
│                          │                    │             │
│                 WorkspaceService     LatexCompileService    │
│                          │                    │             │
│                          ▼                    ▼             │
│                 /data/workspace          /tmp/latexedit-*   │
│                 (volume NAS)             + pdflatex         │
└─────────────────────────────────────────────────────────────┘
```

## Separação de responsabilidades

| Peça | Responsabilidade |
|------|------------------|
| `app.js` | Orquestra UI, salva, compila, layout, atalhos |
| `workspace-fs.js` | Modelo do projeto aberto + chamadas `/api/fs` |
| `explorer.js` | Árvore, menu de contexto, DnD, ordenação main |
| `LatexCompileService` | Isola o TeX: copia arquivos, roda motor, limpa temp |
| `WorkspaceService` | I/O seguro sob a raiz do workspace (anti path-traversal) |
| `CompileServlet` | Une overrides do editor + arquivos do disco + grava PDF |

## Fluxo: abrir projeto

1. Usuário escolhe pasta no modal (lista via `GET /api/fs/list`)  
2. `WorkspaceFs.openServerFolder(path)` chama `GET /api/fs/tree`  
3. Entradas vão para `workspace.entries` (paths relativos ao projeto)  
4. `main.tex` (ou primeiro `.tex`) vira arquivo ativo  
5. Preferência `latexedit.serverProject` no `localStorage` restaura a pasta na próxima visita  

## Fluxo: gerar PDF

1. Salva o arquivo ativo no NAS (`PUT /api/fs/write`)  
2. `POST /api/compile` com `{ project, main, overrides }`  
3. Servidor coleta todos os arquivos do projeto (`collectProjectFiles`)  
4. Aplica overrides (conteúdo ainda não persistido / buffer do editor)  
5. Valida `\input` / `\include` (faltando → erro claro, sem PDF fantasma)  
6. Escreve em diretório temporário, apaga PDF antigo do temp, roda N passes  
7. Se OK, grava `main.pdf` (ou stem do main) no projeto no NAS  
8. UI revoga blob URL antigo e renderiza o PDF novo  

## Decisões de desenho

### Workspace no servidor (não File System Access)

O foco atual é edição **no NAS**. Isso permite:

- Compilar onde o TeX está instalado (Docker)
- Persistir entre máquinas da LAN
- Evitar limitações do File System Access API fora de HTTPS/localhost

### Front vanilla

Sem framework: menos dependências, WAR simples, fácil de servir como estáticos no Tomcat.

### Compilação em temp, não in-place

Isola artefatos auxiliares (`.aux`, `.log`) e evita poluir o volume. Só o PDF de saída é copiado de volta (além do que o usuário já tinha no projeto).

### Mesma origem

Front e API no mesmo host/porta → sem CORS complicado em produção. `CorsFilter` existe para cenários de API base customizada.

## Camadas Java (padrão do projeto)

```text
controller  → HTTP, parsing JSON, códigos de status
service     → regras de negócio e I/O
config      → application.properties + env
util        → JSON helpers
filter      → CORS
```

## Variáveis de ambiente relevantes

| Env | Efeito |
|-----|--------|
| `LATEX_ENGINE` | Motor (`pdflatex`, …) |
| `LATEX_ENGINEPATH` | Caminho do binário/pasta TeX |
| `LATEX_WORKSPACEROOT` | Raiz absoluta dos projetos |
| `LATEX_TIMEOUTSECONDS` | Timeout |
| `LATEX_PASSES` | Número de passes |
| `TLS_SAN_EXTRA` | SAN do certificado autoassinado (IP/DNS do NAS) |

## Próximos documentos

- Detalhe da UI: [frontend.md](frontend.md)  
- Detalhe da API: [backend.md](backend.md)  
- Pipeline TeX: [compilacao.md](compilacao.md)  
