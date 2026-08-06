# LaTeX Edit

Editor/leitor de LaTeX (front) + API de compilação PDF (back-end Java 21).

## Pré-requisitos

- Java 21+
- Maven 3.9+
- TeX Live ou MiKTeX no PATH (`pdflatex`)
- Chrome/Edge (File System Access API para abrir pasta local)

## Subir o back-end

```bash
mvn jetty:run
```

- App: http://localhost:8081/
- Health: http://localhost:8081/api/health
- Compile: `POST http://localhost:8081/api/compile`

### Compilar (JSON)

```json
{
  "main": "main.tex",
  "files": [
    { "path": "main.tex", "content": "\\documentclass{article}\\begin{document}Oi\\end{document}" }
  ]
}
```

Resposta de sucesso inclui `pdfBase64`.

## Front

1. Abra a pasta raiz do projeto
2. Edite os `.tex` e salve no disco
3. **Compilar PDF** envia o projeto ao back-end, gera o PDF e salva ao lado do `.tex`

API base padrão: `http://localhost:8081` (override em `localStorage.latexedit.apiBase`).

## Configuração

`src/main/resources/application.properties`:

- `latex.engine` = pdflatex | xelatex | lualatex | latexmk
- `latex.timeoutSeconds`
- `latex.passes`
