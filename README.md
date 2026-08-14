# LaTeX IDE

Editor web de LaTeX com workspace no servidor (NAS), compilação real via **pdfLaTeX** e preview de PDF embutido.

Front-end em **JavaScript vanilla** (sem React/Vue). Back-end em **Java 21** (WAR: Jetty em desenvolvimento, Tomcat no Docker).

---

## O que é

O LaTeX IDE permite:

- Abrir pastas de projeto no **NAS / servidor** (não no PC)
- Editar `.tex` (e arquivos relacionados) no browser
- Compilar com TeX Live e gravar o PDF no mesmo projeto
- Ver o PDF no painel de preview (PDF.js)
- Organizar arquivos na árvore (criar, renomear, excluir, arrastar `.tex`)
- Autocomplete de comandos LaTeX
- Preferências locais (tema, word wrap, layout)

Documentação detalhada: pasta [`docs/`](docs/README.md).

---

## Arquitetura (visão rápida)

```text
Browser (index.html + js/* + css)
        │  HTTPS mesma origem
        ▼
Tomcat / Jetty  ──►  Servlets (/api/health, /api/fs/*, /api/compile)
        │
        ├── WorkspaceService  → arquivos em latex.workspaceRoot
        └── LatexCompileService → pdflatex em diretório temporário
```

| Camada | Tecnologia |
|--------|------------|
| UI | HTML5, CSS3, ES modules |
| API | Jakarta Servlet 6, Gson |
| Runtime | Java 21, Maven WAR |
| TeX | TeX Live (`pdflatex`) no container / PATH local |
| Deploy | Docker Compose + CasaOS |

---

## Pré-requisitos

### Desenvolvimento local

- Java 21+
- Maven 3.9+
- TeX Live, TinyTeX ou MiKTeX com `pdflatex` no `PATH`
- Navegador moderno (Chrome, Brave, Edge, Firefox)

### Produção (NAS / CasaOS)

- Docker
- Volume de projetos (ex.: `/DATA/Documents/Biblioteca` → `/data/workspace`)
- Portas: **8095** (HTTPS) e opcionalmente **8096** (HTTP)

---

## Início rápido (dev)

```bash
mvn jetty:run
```

| Recurso | URL |
|---------|-----|
| App | http://localhost:8081/ |
| Health | http://localhost:8081/api/health |
| Compile | `POST http://localhost:8081/api/compile` |

1. Abra o app no browser  
2. **Abrir pasta no NAS** (workspace local do Jetty/Tomcat)  
3. Edite um `.tex` e clique em **Gerar PDF**

---

## Deploy no NAS (resumo)

Guia completo: [`DEPLOY-NAS.md`](DEPLOY-NAS.md) e [`docs/deploy.md`](docs/deploy.md).

```bash
# No NAS (após copiar o projeto)
cd ~/latexedit
# Ajuste TLS_SAN_EXTRA para o IP/DNS do NAS no docker-compose.yml
sudo docker compose build
sudo docker compose up -d
```

- App: `https://YOUR_NAS_HOST:8095/`  
- CasaOS: `http://YOUR_NAS_HOST:90/`  
- Projetos: pasta montada em `/data/workspace` (ex. Biblioteca)

Na primeira visita ao HTTPS, aceite o certificado autoassinado (**Avançado → Continuar**).

---

## Funcionalidades principais

| Área | Recursos |
|------|----------|
| Explorer | Árvore hierárquica, criar pasta/arquivo, renomear, excluir, DnD de `.tex`, ordenação `main ↑/↓` |
| Editor | Source, numeração de linhas, word wrap, tema claro/escuro, autocomplete (`\`, `\begin{`, `\input{`) |
| Preview | PDF.js, zoom / fit width, download do PDF |
| Compilação | Multi-pass pdfLaTeX, validação de `\input`/`\include`, PDF salvo no NAS |
| Layout | Split / só Script / só Preview |
| Configurações | Página na rail (engrenagem): word wrap |

Detalhes: [`docs/funcionalidades.md`](docs/funcionalidades.md).

---

## Estrutura do repositório

```text
LaTexedit/
├── README.md                 ← este arquivo
├── DEPLOY-NAS.md             ← deploy CasaOS/Docker (resumo operacional)
├── docs/                     ← documentação aprofundada
├── Dockerfile
├── docker-compose.yml
├── docker-compose.casaos.yml
├── docker/                   ← server.xml TLS, entrypoint
├── scripts/                  ← deploy-nas.sh / .ps1
├── pom.xml
└── src/main/
    ├── java/com/enrico/latexedit/
    │   ├── controller/       ← Health, Fs, Compile
    │   ├── service/          ← Workspace, LatexCompile
    │   ├── config/
    │   └── ...
    ├── resources/application.properties
    └── webapp/
        ├── index.html
        ├── css/styles.css
        └── js/               ← app, explorer, workspace-fs, autocomplete, ...
```

---

## API (resumo)

| Método | Caminho | Descrição |
|--------|---------|-----------|
| `GET` | `/api/health` | Motor TeX, workspace, versão |
| `GET` | `/api/fs/info` | Raiz do workspace |
| `GET` | `/api/fs/list?path=` | Lista pasta |
| `GET` | `/api/fs/tree?path=` | Árvore do projeto |
| `GET` | `/api/fs/read?path=` | Lê texto |
| `GET` | `/api/fs/file?path=` | Download binário (PDF) |
| `PUT` | `/api/fs/write` | Grava texto |
| `POST` | `/api/fs/mkdir` · `create` · `rename` | Criar pasta/arquivo, renomear/mover |
| `DELETE` | `/api/fs/delete?path=` | Excluir |
| `POST` | `/api/compile` | Compila projeto no servidor (`project` + `main`) |

Especificação completa: [`docs/backend.md`](docs/backend.md).

### Exemplo de compile (workspace)

```json
{
  "project": "meu-projeto",
  "main": "main.tex",
  "overrides": {
    "main.tex": "\\documentclass{article}\\begin{document}Oi\\end{document}"
  }
}
```

Sucesso: `success`, `pdfPath`, opcionalmente `pdfBase64`, `log`.

---

## Configuração

`src/main/resources/application.properties` (overrides por env `LATEX_*`):

| Chave | Função |
|-------|--------|
| `latex.engine` | `pdflatex` (padrão), `xelatex`, `lualatex`, `latexmk` |
| `latex.enginePath` | Pasta/binário TeX (vazio = PATH / descoberta) |
| `latex.timeoutSeconds` | Timeout por passagem |
| `latex.passes` | Passagens do motor (padrão 2) |
| `latex.workspaceRoot` | Raiz dos projetos |
| `LATEX_WORKSPACEROOT` | Em Docker: `/data/workspace` |

---

## Dicas de uso LaTeX

- Arquivos incluídos com `\input{pasta/arquivo}` **não** devem ter `\documentclass` / `\begin{document}` próprios  
- Evite acentos em **nomes de arquivo** (`Explicacao.tex` em vez de `Explicação.tex`) — o pdfLaTeX falha com frequência  
- `\title{...}` no corpo do texto não imprime título; use `\maketitle` ou `\begin{center}{\LARGE ...}`  

Mais: [`docs/compilacao.md`](docs/compilacao.md) e [`docs/troubleshooting.md`](docs/troubleshooting.md).

---

## Documentação

| Documento | Conteúdo |
|-----------|----------|
| [docs/README.md](docs/README.md) | Índice da documentação |
| [docs/arquitetura.md](docs/arquitetura.md) | Arquitetura e fluxo de dados |
| [docs/frontend.md](docs/frontend.md) | UI, módulos JS, estado |
| [docs/backend.md](docs/backend.md) | Servlets, serviços, API |
| [docs/compilacao.md](docs/compilacao.md) | Pipeline pdfLaTeX |
| [docs/workspace-nas.md](docs/workspace-nas.md) | Workspace e volume NAS |
| [docs/funcionalidades.md](docs/funcionalidades.md) | Funcionalidades da IDE |
| [docs/deploy.md](docs/deploy.md) | Docker / CasaOS |
| [docs/desenvolvimento.md](docs/desenvolvimento.md) | Guia de desenvolvimento |
| [docs/troubleshooting.md](docs/troubleshooting.md) | Problemas comuns |

---

## Licença / autoria

Projeto pessoal — LaTeX Edit. Ajuste este trecho conforme a licença que quiser publicar.
