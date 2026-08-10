# Deploy LaTeX Edit no NAS via SSH + Docker Compose
# Uso:
#   .\scripts\deploy-nas.ps1 -User casaos -HostIp YOUR_NAS_HOST
#   (vai pedir senha no scp/ssh)

param(
    [Parameter(Mandatory = $true)]
    [string]$User,

    [string]$HostIp = "YOUR_NAS_HOST",

    [string]$RemoteDir = "~/latexedit",

    [string]$AppPort = "8095"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

Write-Host "==> Copiando projeto para ${User}@${HostIp}:${RemoteDir}" -ForegroundColor Cyan
ssh "${User}@${HostIp}" "mkdir -p ${RemoteDir}"
scp -r `
    "$ProjectRoot\Dockerfile" `
    "$ProjectRoot\docker-compose.yml" `
    "$ProjectRoot\docker-compose.casaos.yml" `
    "$ProjectRoot\.dockerignore" `
    "$ProjectRoot\pom.xml" `
    "$ProjectRoot\src" `
    "${User}@${HostIp}:${RemoteDir}/"

Write-Host "==> Build + up no NAS (pode demorar vários minutos na 1ª vez)" -ForegroundColor Cyan
ssh -t "${User}@${HostIp}" "cd ${RemoteDir} && docker compose build && docker compose up -d && docker compose ps"

Write-Host "==> Teste local a partir do PC" -ForegroundColor Cyan
$healthUrl = "http://${HostIp}:${AppPort}/api/health"
try {
    $r = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 15
    Write-Host "Health OK: $($r | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "Ainda não respondeu em $healthUrl — aguarde o start (TeX/Tomcat)." -ForegroundColor Yellow
    Write-Host $_.Exception.Message
}

Write-Host ""
Write-Host "Abra o app: http://${HostIp}:${AppPort}/" -ForegroundColor Green
