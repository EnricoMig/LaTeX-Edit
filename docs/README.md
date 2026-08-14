# Documentação — LaTeX IDE

Documentação aprofundada do projeto. O [README principal](../README.md) cobre visão geral e início rápido; aqui está o detalhe.

## Índice

1. [Arquitetura](arquitetura.md) — componentes, fluxos, decisões  
2. [Front-end](frontend.md) — módulos JS, UI, estado no browser  
3. [Back-end](backend.md) — Java, servlets, API REST  
4. [Compilação LaTeX](compilacao.md) — como o PDF é gerado  
5. [Workspace e NAS](workspace-nas.md) — arquivos no servidor  
6. [Funcionalidades](funcionalidades.md) — o que a IDE oferece  
7. [Deploy](deploy.md) — Docker, CasaOS, TLS  
8. [Desenvolvimento](desenvolvimento.md) — ambiente local, convenções  
9. [Troubleshooting](troubleshooting.md) — erros frequentes  

## Mapa mental

```text
docs/
├── arquitetura.md      ← “como as peças se encaixam”
├── frontend.md         ← “o que roda no browser”
├── backend.md          ← “o que roda no servidor”
├── compilacao.md       ← “como nasce o PDF”
├── workspace-nas.md    ← “onde ficam os .tex”
├── funcionalidades.md  ← “o que o usuário pode fazer”
├── deploy.md           ← “como colocar no ar”
├── desenvolvimento.md  ← “como contribuir / rodar em dev”
└── troubleshooting.md  ← “quando algo quebra”
```

## Público-alvo

| Perfil | Comece por |
|--------|------------|
| Usuário final | README + funcionalidades + troubleshooting |
| Quem vai instalar no NAS | deploy + workspace-nas |
| Desenvolvedor | arquitetura → frontend/backend → desenvolvimento |
| Debug de PDF | compilacao + troubleshooting |
