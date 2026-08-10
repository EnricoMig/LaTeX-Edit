# Front-end

Stack: **HTML + CSS + ES modules**, sem bundler. Entrada: `src/main/webapp/index.html` → `js/app.js`.

## Layout da interface

```text
┌ topbar: marca · nome do arquivo · status · Baixar/Gerar PDF · tema ┐
├ rail ┬ shell-main ─────────────────────────────────────────────────┤
│ ícones│ explorer │ editor (Source) │ preview (PDF)                  │
│ arquivos│          │                │                               │
│ log     │          │                │                               │
│ layout  │          │                │                               │
│ ⚙ config│          │                │                               │
└─────────┴──────────┴────────────────┴───────────────────────────────┘
└ statusbar: UTF-8 · pdfLaTeX · pasta · hint ─────────────────────────┘
```

Modos de layout (`localStorage.latexedit.layout`):

- `split` — editor + preview  
- `editor` — só Source  
- `pdf` — só Preview (com zoom)

## Módulos JS

| Arquivo | Papel |
|---------|--------|
| `app.js` | Bootstrap, eventos, compile, open/save, atalhos |
| `workspace-fs.js` | Cliente do filesystem remoto + árvore em memória |
| `explorer.js` | Render da árvore, context menu, DnD, rename inline |
| `editor.js` | Linhas, cursor, insert tab/texto, template `main.tex` |
| `autocomplete.js` | Popup de sugestões + caret coordinates |
| `latex-catalog.js` | Catálogo de comandos/ambientes |
| `pdf-viewer.js` | PDF.js: fit width, zoom ±, ResizeObserver |
| `settings.js` | Preferências (`wordWrap`) no `localStorage` |
| `theme.js` | Tema claro/escuro |
| `api.js` | Base URL da API + `compileProject` / `checkHealth` |
| `preview.js` | Legado/auxiliar de preview textual com expand de `\input` |

## Estado no browser

| Chave `localStorage` | Uso |
|----------------------|-----|
| `latexedit.theme` | `light` / `dark` |
| `latexedit.layout` | `split` / `editor` / `pdf` |
| `latexedit.explorerOpen` | Painel arquivos aberto |
| `latexedit.serverProject` | Última pasta de projeto no workspace |
| `latexedit.mainSort` | `above` / `below` (posição do main) |
| `latexedit.settings` | JSON (`wordWrap`, …) |
| `latexedit.apiBase` | Override opcional da API |

Estado volátil fica em memória: `WorkspaceFs.workspace.entries`, conteúdo em `contentCache`, URLs de PDF em `pdfUrls`.

## Explorer

### Árvore

`buildTreeRows({ mainPosition })` monta DFS por pasta:

1. Agrupa filhos por `parentPath`  
2. Ordena irmãos: pastas vs arquivos vs `main.tex`/`main.pdf` conforme `main ↑` / `main ↓`  
3. Só desce em pastas **expandidas**

### Drag and drop

- Só `.tex` são `draggable`  
- Soltar em pasta → `movePath` (API rename com path completo)  
- Soltar na área vazia / arquivo na raiz → move para raiz do projeto  

### Menu de contexto

Botão direito: abrir, renomear, `\input`/`\include`, excluir, nova pasta/arquivo.  
Fecha com clique esquerdo fora (`pointerdown` capture) ou Esc.  
CSS garante `[hidden]` com `display: none !important` (evita conflito com `display: flex`).

## Editor

- `<textarea class="editor">` — sem highlighter (propositalmente simples)  
- Word wrap: classe `is-word-wrap` + `wrap="soft"`  
- Tab insere `\t` (não muda foco)  
- Autocomplete: digitar `\…`, `\begin{`, `\input{` / `\include{`, ou **Ctrl+Espaço**

### Autocomplete

1. Detecta gatilho à esquerda do cursor  
2. Filtra catálogo ou lista `.tex` do projeto  
3. Posiciona popup com mirror DOM do caret  
4. Enter/Tab aceita; snippets usam `$0` como posição final do cursor  

## Preview PDF

`PdfViewer`:

- Carrega blob via `/api/fs/file?path=…`  
- Fit à largura do painel  
- Zoom in/out e label percentual  
- Scroll apenas no host `.pdfjs-host`  

Em falha de compile, a UI **descarta** o preview antigo (mensagem “Falha na geração”) para não parecer que o PDF atual refletiu o source.

## Configurações

Modal `#settings-modal` (ícone engrenagem na rail):

- **Word wrap** — liga/desliga quebra de linha no editor  

Extensível: novos toggles em `settings.js` (`DEFAULTS` + form).

## Atalhos úteis

| Atalho | Ação |
|--------|------|
| Ctrl+S | Salvar |
| Ctrl+Enter | Gerar PDF |
| Ctrl+B | Toggle explorer |
| F2 | Renomear (foco no nome / editor) |
| Ctrl+Espaço | Autocomplete |

## CSS

`styles.css` usa variáveis CSS (`--accent`, `--paper`, `--editor-*`, etc.) e `data-theme` no `<html>`. Preferência por tipografia Instrument Sans / Serif + IBM Plex Mono (Google Fonts).

## Convenções ao alterar o front

1. Manter vanilla (sem framework novo sem necessidade)  
2. Paths sempre normalizados (`/` , sem `..`) via `workspace-fs.js`  
3. Após rename/move, atualizar arquivo ativo e labels do PDF se necessário  
4. Não commitar artefatos de `.tools/` ou screenshots grandes em `assets/` sem critério  
