package com.enrico.latexedit.config;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;
import java.util.logging.Level;
import java.util.logging.Logger;

public final class AppConfig {

    private static final Logger LOGGER = Logger.getLogger(AppConfig.class.getName());
    private static final Properties PROPS = new Properties();

    static {
        try (InputStream in = AppConfig.class.getClassLoader().getResourceAsStream("application.properties")) {
            if (in != null) {
                PROPS.load(in);
            } else {
                LOGGER.warning("application.properties não encontrado; usando defaults.");
            }
        } catch (IOException error) {
            LOGGER.log(Level.SEVERE, "Falha ao carregar application.properties", error);
        }
    }

    private AppConfig() {
    }

    public static String get(String key, String defaultValue) {
        String envKey = key.toUpperCase().replace('.', '_');
        String fromEnv = System.getenv(envKey);
        if (fromEnv != null && !fromEnv.isBlank()) {
            return fromEnv.trim();
        }
        return PROPS.getProperty(key, defaultValue);
    }

    public static int getInt(String key, int defaultValue) {
        try {
            return Integer.parseInt(get(key, String.valueOf(defaultValue)));
        } catch (NumberFormatException error) {
            LOGGER.warning("Valor inválido para " + key + "; usando " + defaultValue);
            return defaultValue;
        }
    }

    public static String appName() {
        return get("app.name", "LaTeX IDE");
    }

    public static String appVersion() {
        return get("app.version", "1.0.0");
    }

    public static String latexEngine() {
        return get("latex.engine", "pdflatex");
    }

    public static int latexTimeoutSeconds() {
        return getInt("latex.timeoutSeconds", 60);
    }

    public static int latexMaxFiles() {
        return getInt("latex.maxFiles", 200);
    }

    public static int latexMaxFileBytes() {
        return getInt("latex.maxFileBytes", 5 * 1024 * 1024);
    }

    public static int latexPasses() {
        return Math.max(1, getInt("latex.passes", 2));
    }

    /**
     * Raiz dos projetos no servidor (NAS/Tomcat). Override: LATEX_WORKSPACEROOT.
     * Caminhos relativos resolvem contra catalina.base (Tomcat) ou user.home.
     */
    public static String workspaceRoot() {
        String configured = get("latex.workspaceRoot", "latex-workspace");
        java.nio.file.Path path = java.nio.file.Path.of(configured);
        if (path.isAbsolute()) {
            return path.normalize().toString();
        }
        String catalinaBase = System.getProperty("catalina.base");
        if (catalinaBase != null && !catalinaBase.isBlank()) {
            return java.nio.file.Path.of(catalinaBase, configured).normalize().toString();
        }
        String home = System.getProperty("user.home", ".");
        return java.nio.file.Path.of(home, "Documentos", "LaTeX", configured).normalize().toString();
    }
}
