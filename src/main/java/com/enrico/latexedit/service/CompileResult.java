package com.enrico.latexedit.service;

import java.util.Optional;

public final class CompileResult {

    private final boolean success;
    private final byte[] pdfBytes;
    private final String log;
    private final String message;
    private final String engine;

    private CompileResult(boolean success, byte[] pdfBytes, String log, String message, String engine) {
        this.success = success;
        this.pdfBytes = pdfBytes;
        this.log = log;
        this.message = message;
        this.engine = engine;
    }

    public static CompileResult ok(byte[] pdfBytes, String log, String engine) {
        return new CompileResult(true, pdfBytes, log, "Compilação concluída", engine);
    }

    public static CompileResult fail(String message, String log, String engine) {
        return new CompileResult(false, null, log, message, engine);
    }

    public boolean isSuccess() {
        return success;
    }

    public Optional<byte[]> pdfBytes() {
        return Optional.ofNullable(pdfBytes);
    }

    public String getLog() {
        return log == null ? "" : log;
    }

    public String getMessage() {
        return message;
    }

    public String getEngine() {
        return engine;
    }
}
