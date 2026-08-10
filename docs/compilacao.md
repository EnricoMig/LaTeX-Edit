# Compilação LaTeX

## Visão geral

A compilação é **real** (não é MathJax). O servidor:

1. Monta uma cópia do projeto em `/tmp/latexedit-*`  
2. Roda o motor configurado (`pdflatex` por padrão), N vezes (`latex.passes`)  
3. Devolve o PDF (e grava no workspace no modo NAS)

## Pipeline detalhado

```text
overrides + arquivos do disco
        │
        ▼
normalize NFC dos paths
        │
        ▼
pré-checagem de \\input / \\include
   (faltando? → fail com lista de arquivos)
        │
        ▼
writeProjectFiles(temp)
deleteIfExists(main.pdf no temp)   ← evita “sucesso falso”
        │
        ▼
pass 1..N  pdflatex -interaction=nonstopmode -halt-on-error
        │
        ▼
PDF existe? → bytes + log
         senão → fail (mesmo com exit 0 em edge cases sem PDF)
```

## Ambiente do processo

Antes de executar o TeX, o serviço força:

- `LANG=C.UTF-8`  
- `LC_ALL=C.UTF-8`  

Isso é importante para `\input` com pastas/arquivos UTF-8 no Linux.

A imagem Docker também define `LANG`/`LC_ALL` no `Dockerfile`.

## Validação de `\input` / `\include`

O serviço faz uma BFS a partir do `main.tex`:

- Extrai alvos de `\input{…}` e `\include{…}`  
- Resolve com e sem `.tex`, case-insensitive  
- Se faltar arquivo, retorna erro **antes** de confiar num PDF antigo  

Paths com caracteres não ASCII geram aviso sugerindo renomear para ASCII (ex.: `Explicacao.tex`).

## PDF stale (histórico do bug)

Problema antigo: o `main.pdf` do projeto era copiado para o temp; se o pdflatex falhasse, o PDF velho ainda existia e a API reportava sucesso.

Mitigações:

1. Não coletar PDF que tem `.tex` irmão no projeto  
2. Apagar o PDF de saída no temp **antes** dos passes  
3. Na UI, em falha, limpar o preview anterior  

## Estrutura recomendada de projeto

```text
meu-projeto/
├── main.tex              ← único \\documentclass / \\begin{document}
├── Capa.tex              ← só conteúdo
├── conteudo/
│   └── introducao.tex
└── figs/
    └── diagrama.png
```

`main.tex` exemplo:

```latex
\documentclass{article}
\usepackage{graphicx}
\usepackage[utf8]{inputenc} % se necessário no seu setup

\title{Meu documento}
\author{Autor}
\date{\today}

\begin{document}
\maketitle
\input{Capa}
\input{conteudo/introducao}
\end{document}
```

Arquivos incluídos: **sem** `\documentclass`, **sem** `\begin{document}`.

## Erros clássicos do usuário (não do app)

| Sintoma | Causa |
|---------|--------|
| `Can be used only in preamble` | `\documentclass` dentro de um `\input` |
| `There's no line here to end` | `\\` após `\title{…}` no corpo |
| File not found em subpasta com acento | Nome `Explicação.tex` no pdfLaTeX |
| PDF “desatualizado” (antigo) | Já corrigido no app; force Gerar PDF e veja o log |

## Motores

`latex.engine`:

- `pdflatex` (padrão no NAS)  
- `xelatex` / `lualatex` — melhores com Unicode/fontes OpenType  
- `latexmk` — orquestra passes  

Trocar o motor exige o binário na imagem/PATH.

## Logs

A resposta de compile inclui `log` (stdout dos passes). A UI mostra no painel **Logs** (rail). Em falha, a mensagem de preview aponta para esse painel.

## Limites

| Parâmetro | Default | Função |
|-----------|---------|--------|
| `latex.timeoutSeconds` | 120 | Mata o processo se travar |
| `latex.maxFiles` | 200 | Cap de arquivos no pacote |
| `latex.maxFileBytes` | 5 MiB | Cap por arquivo |
| `latex.passes` | 2 | Refs/ToC costumam precisar de 2 |

## Teste manual rápido

```bash
curl -s http://localhost:8081/api/health | jq .
curl -s -X POST http://localhost:8081/api/compile \
  -H 'Content-Type: application/json' \
  -d '{"main":"main.tex","files":[{"path":"main.tex","content":"\\documentclass{article}\\begin{document}Hi\\end{document}"}]}' \
  | jq '{success,message,engine}'
```
