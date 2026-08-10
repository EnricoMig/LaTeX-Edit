# Back-end

Java **21**, packaging **WAR** (`latexedit.war` → ROOT no Tomcat).

Pacote base: `com.enrico.latexedit`.

## Componentes

```text
controller/
  HealthServlet     GET  /api/health
  FsServlet         /api/fs/*
  CompileServlet    POST /api/compile
service/
  WorkspaceService      filesystem sob workspaceRoot
  LatexCompileService   pdflatex / temp dir
  CompileResult         DTO sucesso/falha
config/
  AppConfig             properties + env
filter/
  CorsFilter
util/
  JsonResponses
```

## Configuração

Arquivo: `src/main/resources/application.properties`.

Overrides por ambiente (exemplos):

- `LATEX_ENGINE`
- `LATEX_ENGINEPATH`
- `LATEX_WORKSPACEROOT`
- `LATEX_TIMEOUTSECONDS`
- `LATEX_PASSES`

`AppConfig.workspaceRoot()`:

- Absoluto → usa direto  
- Relativo → resolve sob `catalina.base` ou `~/Documentos/LaTeX/` em dev  

No Docker, `LATEX_WORKSPACEROOT=/data/workspace`.

## API — Health

`GET /api/health`

```json
{
  "success": true,
  "app": "LaTeX Edit",
  "version": "1.0.0",
  "engine": "pdflatex",
  "workspaceRoot": "/data/workspace",
  "timestamp": "..."
}
```

## API — Filesystem (`/api/fs`)

Todos os paths são **relativos à raiz do workspace**, com bloqueio de `..` e absolutos.

### GET

| Ação | Query | Resposta |
|------|-------|----------|
| `info` | — | raiz absoluta efetiva |
| `list` | `path` | itens `{ name, path, type, kind }` |
| `tree` | `path` | lista flatten com profundidade (projeto) |
| `read` | `path` | `{ content }` texto UTF-8 |
| `file` | `path` | bytes (PDF/imagem) |

### PUT

| Ação | Body | Efeito |
|------|------|--------|
| `write` | `{ path, content }` | sobrescreve texto |

### POST

| Ação | Body | Efeito |
|------|------|--------|
| `mkdir` | `{ path }` | cria pasta |
| `create` | `{ path, content? }` | cria arquivo |
| `rename` | `{ from, to }` | renomeia **ou move** |

### DELETE

| Ação | Query | Efeito |
|------|-------|--------|
| `delete` | `path` | remove arquivo/pasta recursivamente |

Respostas de sucesso costumam incluir `"success": true`. Erros: JSON com `message` e status 4xx.

## API — Compile

`POST /api/compile`  
`Content-Type: application/json` (também há suporte multipart legado).

### Modo workspace (usado pelo app)

```json
{
  "project": "treino",
  "main": "main.tex",
  "overrides": {
    "main.tex": "...conteúdo atual do editor..."
  }
}
```

Passos no servidor:

1. `collectProjectFiles(project)` — walk do projeto, texto + binários permitidos  
2. Ignora PDFs que têm `.tex` irmão (evita PDF velho no temp)  
3. Aplica `overrides` (e persiste no disco)  
4. `LatexCompileService.compile(main, files)`  
5. Se OK, escreve PDF em `project/main.pdf` (stem do main)  
6. Responde `pdfPath`, `log`, `pdfBase64`, `success`

### Modo arquivos embutidos

```json
{
  "main": "main.tex",
  "files": [
    { "path": "main.tex", "content": "..." },
    { "path": "fig.png", "content": "<base64>", "encoding": "base64" }
  ]
}
```

### Códigos

| Situação | Status |
|----------|--------|
| Sucesso com PDF | 200 |
| Falha TeX / validação | 422 (body ainda com `log` / `message`) |
| Body inválido | 400 |
| Erro interno | 500 |

## Segurança de path

`WorkspaceService.resolveSafe`:

- Normaliza separadores  
- Rejeita `..` e absolutos fora da raiz  
- Garante que o path final `startsWith(workspaceRoot)`  

O mesmo espírito existe em `LatexCompileService.normalizeRelativePath` para o pacote enviado ao temp.

## Extensões permitidas na compilação

Texto: `.tex` `.bib` `.sty` `.cls` `.txt` `.md`  
Binário: `.png` `.jpg` `.jpeg` `.pdf` `.eps` `.svg`  

Limites: `latex.maxFiles`, `latex.maxFileBytes`.

## Dev vs produção

| | Dev | Produção |
|--|-----|----------|
| Servidor | `mvn jetty:run` :8081 | Tomcat 10 no Docker |
| Context | `/` | ROOT.war |
| TLS | HTTP | HTTPS 8443 → host 8095 |
| TeX | PATH / TinyTeX local | TeX Live na imagem |

## Dependências Maven

- `jakarta.servlet-api` (provided)  
- `gson`  
- Plugin Jetty EE10 para hot reload em dev  
