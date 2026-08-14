# Funcionalidades

Lista do que a IDE oferece hoje, do ponto de vista do usuário.

## Projetos e arquivos

- Abrir pasta de projeto no workspace do servidor  
- Criar pasta e arquivo `.tex`  
- Renomear (duplo clique, F2 ou menu)  
- Excluir com confirmação  
- Arrastar `.tex` para dentro/fora de pastas  
- Ordenar `main.tex` / `main.pdf` acima ou abaixo das subpastas (`main ↑` / `main ↓`)  
- Menu de contexto: abrir, `\input{}`, `\include{}`, etc.  
- Restaurar último projeto ao reabrir o browser  

## Edição

- Editor Source com numeração de linhas  
- Desfazer / refazer (Ctrl+Z, Ctrl+Y ou Ctrl+Shift+Z)  
- Ajustar indentação de `\begin` / `\end` (botão no Source ou Shift+Alt+F)  
- Salvar (botão / Ctrl+S)  
- Word wrap (Configurações ⚙)  
- Tema claro / escuro  
- Autocomplete de comandos, ambientes e arquivos do projeto  
- Inserir `\input` / `\include` pelo menu do explorer  

## Compilação e PDF

- **Gerar PDF** — compila e grava no NAS  
- **Baixar PDF** — download para o PC  
- Preview embutido (PDF.js)  
- Zoom / ajustar à largura (modo Preview)  
- Painel de logs da compilação  
- Auto-compile (quando habilitado no fluxo de dirty/save — ver `app.js`)  
- Em erro, preview antigo é descartado  

## Layout

- Split (Source + Preview)  
- Só Script  
- Só Preview  
- Redimensionar explorer e split editor/preview  
- Colapsar painel de arquivos (Ctrl+B)  

## Configurações

Acesso: ícone de engrenagem na rail esquerda.

| Opção | Efeito |
|-------|--------|
| Word wrap | Quebra linhas longas no editor |

Preferências ficam no `localStorage` do navegador (por máquina/perfil).

## Atalhos

| Atalho | Ação |
|--------|------|
| Ctrl+S | Salvar |
| Ctrl+Z | Desfazer |
| Ctrl+Y / Ctrl+Shift+Z | Refazer |
| Shift+Alt+F | Ajustar indentação |
| Tab / Shift+Tab | Indentar / recuar linhas |
| Ctrl+Enter | Gerar PDF |
| Ctrl+B | Mostrar/ocultar arquivos |
| Ctrl+Espaço | Autocomplete |
| F2 | Renomear arquivo ativo |
| Esc | Fecha menus/modais |

## O que ainda não é (limites atuais)

- Syntax highlight rico tipo Overleaf  
- Colaboração em tempo real  
- Git integrado na UI  
- Contas de usuário / ACL por projeto  
- Compilação com motor escolhido na UI (hoje via config do servidor)  

Esses itens são candidatos naturais a evolução, não bugs.
