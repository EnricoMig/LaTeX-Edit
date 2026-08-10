# Deploy (Docker / CasaOS)

Complementa o guia operacional [`DEPLOY-NAS.md`](../DEPLOY-NAS.md).

## Imagem

`Dockerfile` multi-stage:

1. **build** — `maven:3.9.9-eclipse-temurin-21` → `mvn package`  
2. **runtime** — `tomcat:10.1-jdk21-temurin-jammy` + pacotes TeX Live  

Artefato: WAR em `/usr/local/tomcat/webapps/ROOT.war`.

TeX na imagem (resumo): `texlive-latex-base`, `recommended`, `extra`, fontes, `lang-portuguese`, `science`, `latexmk`.

Ambiente padrão: `LANG=C.UTF-8`, `LATEX_WORKSPACEROOT=/data/workspace`.

## Portas

| Host | Container | Uso |
|------|-----------|-----|
| 8095 | 8443 | HTTPS (app) |
| 8096 | 8080 | HTTP (health/debug) |

TLS: keystore gerado no `docker/entrypoint.sh` (autoassinado).  
`TLS_SAN_EXTRA` deve listar o IP ou DNS do NAS (ex.: `IP:192.168.x.x`) **no compose do servidor**, sem precisar publicar o IP no Git público.

## Compose

Arquivos:

- `docker-compose.yml` — referência principal  
- `docker-compose.casaos.yml` — variante para install customizado  

Pontos a conferir no NAS:

1. `TLS_SAN_EXTRA`  
2. Bind mount da Biblioteca  
3. Sem `cpus:` conflitante com `deploy.resources` do CasaOS  

## Procedimento recomendado (SSH)

```bash
# No PC: copiar fontes (ou git pull no NAS)
scp -r Dockerfile docker-compose.yml pom.xml src docker user@NAS:~/latexedit/

# No NAS
cd ~/latexedit
# Ajuste TLS_SAN_EXTRA no compose se estiver como YOUR_NAS_HOST
sudo docker compose build
sudo docker compose up -d
curl -k https://127.0.0.1:8095/api/health
```

Scripts auxiliares: `scripts/deploy-nas.sh`, `scripts/deploy-nas.ps1`.

## CasaOS

1. Painel `http://YOUR_NAS_HOST:90/`  
2. App customizado com o compose **ou** container já gerenciado via pasta `~/latexedit`  
3. Botão “Atualizar” da App Store **não** rebuilda este projeto a partir do Git — use `docker compose build`  

## Atualizar após mudanças de código

1. Atualizar fontes em `~/latexedit`  
2. `sudo docker compose build && sudo docker compose up -d`  
3. Ctrl+F5 no browser  

O volume `/data/workspace` permanece.

## Certificado

Browser vai avisar “Não seguro”. É esperado com cert autoassinado.  
Aceite a exceção uma vez por IP/DNS.

Se o IP do NAS mudar, atualize `TLS_SAN_EXTRA` e recrie o container (e apague o keystore antigo no volume do container se o SAN não renovar — ver `entrypoint.sh`).

## Recursos

Compose sugere limite de memória (~2g). Build da imagem TeX é pesado na primeira vez (vários GB de camadas).

## Checklist pós-deploy

- [ ] `GET /api/health` → `engine: pdflatex`  
- [ ] Abrir pasta no modal mostra a Biblioteca  
- [ ] Criar/editar `.tex` e **Gerar PDF**  
- [ ] Preview carrega  
- [ ] HTTPS na 8095 (não usar HTTP na 8095 para a UI)  
