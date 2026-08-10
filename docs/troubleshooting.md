# Troubleshooting

## Compilação / PDF

### “Can be used only in preamble”

Um arquivo incluído com `\input` contém `\documentclass` ou pacotes de preâmbulo.

**Correção:** deixe `\documentclass` / `\usepackage` / `\begin{document}` só no `main.tex`. O arquivo incluído fica só com o corpo.

### “There's no line here to end”

Geralmente:

```latex
\title{Algo}\\[50mm]
```

`\title` não cria linha; `\\` quebra.

**Correção:**

```latex
\begin{center}
{\LARGE Algo}\\[50mm]
\end{center}
```

ou `\maketitle` com `\title` no preâmbulo do `main`.

### `\input` de subpasta “não puxa”

1. Confira o log: se aparece `(./conteudo/arquivo.tex`, o input **funcionou** — o erro é outro.  
2. Evite acentos no **nome do arquivo** (`explicacao.tex`, não `Explicação.tex`).  
3. Path relativo ao projeto: `\input{conteudo/explicacao}` (com ou sem `.tex`).  

### PDF antigo parecia “certo” após erro

Versões antigas do app tinham falso sucesso. Atualize o container. Hoje a UI descarta o preview em falha e o backend apaga PDF stale no temp.

### “Compilador não encontrado”

Instale TeX ou configure `latex.enginePath` / `LATEX_ENGINEPATH`. No Docker, a imagem já traz TeX Live — se health não mostra `pdflatex`, a imagem está incompleta/errada.

### Timeout

Aumente `latex.timeoutSeconds` / `LATEX_TIMEOUTSECONDS` para documentos grandes.

---

## Workspace / arquivos

### Pasta vazia no modal

O volume Docker aponta para um diretório host vazio ou errado. Confira o bind mount e se há projetos em `/DATA/Documents/Biblioteca` (ou o path que você montou).

### Permission denied ao salvar

UID do Tomcat no container vs dono dos arquivos no NAS. Ajuste `chown`/`chmod` no host ou rode o container com user compatível.

### Rename / move falha “já existe”

Destino ocupado. Renomeie o conflito ou escolha outro nome.

---

## Rede / HTTPS

### “Não seguro” no browser

Certificado autoassinado. Aceite a exceção. Para LAN, `TLS_SAN_EXTRA` deve incluir o IP/DNS atual do NAS; depois recrie o container.

### CasaOS “Atualizar” não traz código novo

Esperado para app custom com `build:`. Use `docker compose build && up -d`.

### Mudou o IP do NAS

1. Atualize `TLS_SAN_EXTRA`  
2. Rebuild/recreate  
3. Abra a nova URL HTTPS  
4. Atualize bookmarks  

### Porta 8095 em HTTP

8095 é HTTPS. Use `https://…:8095/` ou health em `http://…:8096/api/health`.

---

## Front

### UI antiga após deploy

Ctrl+F5 (cache de JS/CSS). Confirme que o container foi recriado (`docker compose ps` / data de criação).

### Autocomplete não abre

Digite `\` + letras, ou Ctrl+Espaço. Clique fora / Esc fecha. Em rename inline o drag fica desabilitado.

### Word wrap não muda

Abra ⚙ Configurações, alterne o checkbox. Preferência fica no `localStorage` daquele browser.

---

## Dev

### Jetty sobe mas compile falha

`pdflatex` não está no PATH do shell que iniciou o Maven. Teste `which pdflatex` no mesmo terminal.

### Mudanças Java não aparecem

`mvn jetty:run` com scan, ou reinicie o Jetty. Em Docker, precisa **rebuild** da imagem.

---

## Checklist rápido

1. `/api/health` → success + engine  
2. Abrir projeto na Biblioteca  
3. `main.tex` válido + includes sem preâmbulo  
4. Nomes de arquivo ASCII  
5. Gerar PDF → ver log se falhar  
6. Ctrl+F5 após deploy  
