# Workspace e NAS

## Conceito

O **workspace** é a raiz no servidor onde vivem os projetos LaTeX.

| Ambiente | Raiz típica |
|----------|-------------|
| Docker / CasaOS | `/data/workspace` (volume host → container) |
| Host exemplo | `/DATA/Documents/Biblioteca` |
| Dev Jetty/Tomcat | `latex-workspace` relativo ou sob `catalina.base` |

Dentro do workspace, cada **pasta de primeiro nível** (ou subpasta escolhida) é um “projeto” aberto no explorer (`projectRoot` no front).

## Volume Docker

`docker-compose.yml`:

```yaml
volumes:
  - /DATA/Documents/Biblioteca:/data/workspace
environment:
  LATEX_WORKSPACEROOT: /data/workspace
```

O app **não** lê pastas do seu PC. Copie/sincronize `.tex` para a Biblioteca (ou altere o bind mount).

## Paths

- API e disco usam paths **relativos ao workspace**  
- O front, com um projeto aberto (`treino`), usa paths **relativos ao projeto** (`main.tex`, `conteudo/a.tex`)  
- `WorkspaceFs.fullPath()` junta `projectRoot + relativo` para chamar a API  

Exemplo:

```text
workspace:     /data/workspace
projeto:       Homelab
arquivo API:   Homelab/conteudo/explicacao.tex
arquivo UI:    conteudo/explicacao.tex
```

## Operações suportadas

- Listar / árvore  
- Ler / escrever texto  
- Criar arquivo (seed de `main.tex` em pasta raiz de projeto, via UI)  
- Criar pasta  
- Renomear e **mover** (mesmo endpoint `rename`)  
- Excluir  
- Servir PDF/binário  

## Persistência da sessão

`localStorage.latexedit.serverProject` guarda o último projeto. No load, `tryRestoreFolder()` reabre a árvore.

## Boas práticas no NAS

1. Um projeto = uma pasta (`Homelab`, `TCC`, …)  
2. Nomes de arquivo em ASCII quando possível  
3. Figuras em subpasta (`figs/`) referenciadas por caminho relativo  
4. Não versionar PDFs enormes no Git do usuário (opcional `.gitignore` local)  
5. Backup da Biblioteca no próprio NAS  

## Permissões

O processo Tomcat no container precisa **ler/escrever** o volume. Se criar pastas pelo CasaOS Files como outro UID, ajuste dono/permissão se aparecer “Permission denied”.

## Relação com CasaOS

- Painel: `http://YOUR_NAS_HOST:90/`  
- App: `https://YOUR_NAS_HOST:8095/`  
- Rebuild do app **não** apaga a Biblioteca (volume externo)  
- Só apaga dados se remover o volume/bind errado  

Ver também: [deploy.md](deploy.md) e `DEPLOY-NAS.md` na raiz.
