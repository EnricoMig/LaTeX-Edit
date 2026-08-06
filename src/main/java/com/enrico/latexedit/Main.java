package com.enrico.latexedit;

import com.enrico.latexedit.config.AppConfig;

/**
 * Entrada utilitária para checagem rápida no IDE.
 * O servidor HTTP sobe via: mvn jetty:run
 */
public final class Main {

    private Main() {
    }

    public static void main(String[] args) {
        System.out.println(AppConfig.appName() + " v" + AppConfig.appVersion());
        System.out.println("Engine: " + AppConfig.latexEngine());
        System.out.println("Suba o backend com: mvn jetty:run");
        System.out.println("Health: http://localhost:8081/api/health");
    }
}
