# LaTeX Edit — deploy no CasaOS / Docker

## Teste correto (resumo)

| Ambiente | URL |
|----------|-----|
| Dev local (Jetty) | http://localhost:8081/ |
| Docker / NAS (use HTTPS) | https://192.168.0.3:8095/ |
| Pasta dos projetos no NAS | `/DATA/Documents/Biblioteca` |

**Importante:** o editor abre pastas **no servidor** (volume Docker), não no PC. Coloque os `.tex` em `/DATA/Documents/Biblioteca/...`.

**PDF:** preview embutido (PDF.js). **Gerar PDF** grava no NAS; **Baixar PDF** baixa para o cliente.
| CasaOS painel | http://192.168.0.3:90/ |

**Importante:** “Abrir pasta” no Chrome só funciona em HTTPS (ou localhost). O container já sobe TLS sozinho — **sem Nginx**.

Na 1ª visita o Chrome avisa o certificado autoassinado → **Avançado → Continuar para 192.168.0.3**.

Não use `http://localhost:8080/LaTEdit/` nem HTTP na porta 8095 para editar pastas.

## Pré-requisitos no NAS (CasaOS)

1. Docker ativo (CasaOS já usa Docker).
2. Acesso SSH ao NAS (`192.168.0.3`, porta 22) **ou** App Store → Custom Install.
3. Espaço em disco: a imagem com TeX Live fica **grande** (~2–4 GB no build).

## Opção A — Custom App no CasaOS (UI)

1. Abra http://192.168.0.3:90/
2. Apps → **+** → **Install a customized app** / Compose
3. Cole o conteúdo de `docker-compose.casaos.yml` (ou `docker-compose.yml`)
4. Se o CasaOS pedir imagem pronta em vez de build:
   - No PC/NAS, faça o build e push para um registry, **ou**
   - Use a Opção B (SSH) para `docker compose build && up`

## Opção B — SSH no NAS (recomendado)

```powershell
cd D:\Scripts\WEB\LaTexedit
.\scripts\deploy-nas.ps1 -User migliorini
```

Depois abra: **https://192.168.0.3:8095/**

## Health check

```bash
# HTTP interno mapeado em 8096
curl http://192.168.0.3:8096/api/health
# ou HTTPS (certificado autoassinado)
curl -k https://192.168.0.3:8095/api/health
```

Resposta esperada: `"success":true`, `"engine":"pdflatex"`.

## Notas

- Front e API na mesma origem (Tomcat ROOT).
- Porta pública **8095 = HTTPS**; **8096 = HTTP** (debug/health).
- Sem Nginx/Proxy Manager.
