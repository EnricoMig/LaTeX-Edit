#!/usr/bin/env bash
set -euo pipefail

KEYSTORE="${CATALINA_HOME}/conf/keystore.p12"
STOREPASS="${TLS_STOREPASS:-changeit}"
# IPs/DNS extras no certificado (LAN). Separe por vírgula.
TLS_SAN_EXTRA="${TLS_SAN_EXTRA:-DNS:YOUR_NAS_HOST}"

if [[ ! -f "${KEYSTORE}" ]]; then
  echo "[latexedit] Gerando certificado TLS autoassinado..."
  keytool -genkeypair \
    -alias tomcat \
    -keyalg RSA \
    -keysize 2048 \
    -validity 3650 \
    -keystore "${KEYSTORE}" \
    -storetype PKCS12 \
    -storepass "${STOREPASS}" \
    -keypass "${STOREPASS}" \
    -dname "CN=LaTeX Edit,OU=Local,O=LaTeX Edit,L=LAN,ST=NA,C=BR" \
    -ext "SAN=DNS:localhost,IP:127.0.0.1,${TLS_SAN_EXTRA}"
fi

exec catalina.sh run
