# ---- Build ----
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml .
COPY src ./src
RUN mvn -B -DskipTests package

# ---- Runtime: Tomcat + TeX Live (pt-BR + pacotes comuns de CV) ----
FROM tomcat:10.1-jdk21-temurin-jammy

ENV DEBIAN_FRONTEND=noninteractive \
    CATALINA_OPTS="-Xms256m -Xmx1024m" \
    LATEX_ENGINE=pdflatex \
    LATEX_TIMEOUTSECONDS=120 \
    LATEX_PASSES=2 \
    TLS_SAN_EXTRA=IP:192.168.0.3

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        texlive-latex-base \
        texlive-latex-recommended \
        texlive-latex-extra \
        texlive-fonts-recommended \
        texlive-fonts-extra \
        texlive-lang-portuguese \
        texlive-science \
        latexmk \
        ghostscript \
        fonts-liberation \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/local/tomcat/webapps/*

COPY --from=build /src/target/latexedit.war /usr/local/tomcat/webapps/ROOT.war
COPY docker/server.xml /usr/local/tomcat/conf/server.xml
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080 8443
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD curl -fsS http://127.0.0.1:8080/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
