# Desenvolvimento

## Setup

```bash
git clone <url-do-repo>
cd LaTexedit
# Instale Java 21 + Maven + TeX (pdflatex)
mvn jetty:run
```

Abra http://localhost:8081/

### TeX local sem apt

Se não tiver sudo para TeX Live completo, TinyTeX em `~/.TinyTeX` costuma bastar. Garanta o binário no `PATH` do processo que sobe o Jetty/Tomcat (`latex.enginePath` ou `setenv.sh`).

## Hot reload

Jetty Maven plugin com `scan=1`: mudanças em classes/recursos disparam restart.  
Estáticos em `src/main/webapp` — atualize com refresh no browser (Ctrl+F5 se cache).

## Convenções (`.cursorrules`)

- Java 21 / JS ES6+ / HTML5 / CSS3  
- Preferir vanilla; não adicionar framework pesado sem necessidade  
- Controller → Service → I/O  
- Sem credenciais no código  
- Comentários só para o “porquê”  

Nomenclatura: `camelCase` funções, `PascalCase` classes, `kebab-case` pastas quando aplicável.

## Onde mexer

| Quero… | Arquivo(s) |
|--------|------------|
| Nova opção de UI | `index.html`, `styles.css`, `settings.js` / `app.js` |
| Comportamento da árvore | `explorer.js`, `workspace-fs.js` |
| Autocomplete | `latex-catalog.js`, `autocomplete.js` |
| Endpoint novo | `controller/*`, talvez `service/*` |
| Regra de compile | `LatexCompileService.java` |
| Config default | `application.properties` |
| Imagem NAS | `Dockerfile`, `docker-compose*.yml` |

## Build WAR

```bash
mvn -DskipTests package
# target/latexedit.war
```

## Testes manuais sugeridos

1. Health retorna engine  
2. Abrir pasta vazia → criar `main.tex`  
3. Compilar documento mínimo  
4. `\input{sub/a}` com arquivo ASCII em subpasta  
5. DnD de `.tex` entre pastas  
6. Falha de TeX → preview não mostra PDF velho  
7. Word wrap on/off nas Configurações  
8. Tema claro/escuro  

## Remotes

O projeto pode ter:

- `origin` — Gitea / forge interna  
- `github` — espelho público  

Não commitar IPs privados, senhas ou `.env`. Use placeholders (`YOUR_NAS_HOST`) no tree público; injete o IP real só no compose do servidor.

## Pasta `docs/`

Ao mudar comportamento relevante, atualize o markdown correspondente nesta pasta e, se for visão geral, o `README.md` da raiz.
