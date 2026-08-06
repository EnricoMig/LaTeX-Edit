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
        return get("app.name", "LaTeX Edit");
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
}
