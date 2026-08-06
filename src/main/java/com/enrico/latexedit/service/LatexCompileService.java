package com.enrico.latexedit.service;

import com.enrico.latexedit.config.AppConfig;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.stream.Stream;

public class LatexCompileService {

    private static final Logger LOGGER = Logger.getLogger(LatexCompileService.class.getName());
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of(
            ".tex", ".bib", ".sty", ".cls", ".txt", ".md",
            ".png", ".jpg", ".jpeg", ".pdf", ".eps", ".svg"
    );

    public CompileResult compile(String mainRelativePath, Map<String, byte[]> files) {
        String engine = AppConfig.latexEngine();
        if (files == null || files.isEmpty()) {
            return CompileResult.fail("Nenhum arquivo enviado.", "", engine);
        }
        if (files.size() > AppConfig.latexMaxFiles()) {
            return CompileResult.fail("Limite de arquivos excedido.", "", engine);
        }

        String mainPath = normalizeRelativePath(mainRelativePath);
        if (mainPath == null || !mainPath.toLowerCase(Locale.ROOT).endsWith(".tex")) {
            return CompileResult.fail("Arquivo principal .tex inválido.", "", engine);
        }
        if (!files.containsKey(mainPath)) {
            return CompileResult.fail("Arquivo principal não encontrado no envio: " + mainPath, "", engine);
        }

        Path workDir = null;
        try {
            workDir = Files.createTempDirectory("latexedit-");
            writeProjectFiles(workDir, files);

            if (!isEngineAvailable(engine)) {
                return CompileResult.fail(
                        "Compilador '" + engine + "' não encontrado no PATH. Instale TeX Live ou MiKTeX.",
                        "",
                        engine
                );
            }

            StringBuilder log = new StringBuilder();
            int passes = AppConfig.latexPasses();
            int lastExit = -1;

            for (int pass = 1; pass <= passes; pass++) {
                ProcessResult result = runEngine(engine, workDir, mainPath);
                log.append("=== Passo ").append(pass).append(" (").append(engine).append(") ===\n");
                log.append(result.output()).append('\n');
                lastExit = result.exitCode();
                if (lastExit != 0 && pass == passes) {
                    break;
                }
            }

            Path pdfPath = resolvePdfPath(workDir, mainPath);
            if (Files.isRegularFile(pdfPath)) {
                byte[] pdf = Files.readAllBytes(pdfPath);
                return CompileResult.ok(pdf, log.toString(), engine);
            }

            return CompileResult.fail(
                    "PDF não gerado (exit=" + lastExit + "). Veja o log da compilação.",
                    log.toString(),
                    engine
            );
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            LOGGER.log(Level.WARNING, "Compilação interrompida", error);
            return CompileResult.fail("Compilação interrompida.", "", engine);
        } catch (IOException error) {
            LOGGER.log(Level.SEVERE, "Erro I/O na compilação", error);
            return CompileResult.fail("Erro ao preparar/compilar: " + error.getMessage(), "", engine);
        } finally {
            if (workDir != null) {
                deleteRecursively(workDir);
            }
        }
    }

    private void writeProjectFiles(Path workDir, Map<String, byte[]> files) throws IOException {
        int maxBytes = AppConfig.latexMaxFileBytes();
        for (Map.Entry<String, byte[]> entry : files.entrySet()) {
            String relative = normalizeRelativePath(entry.getKey());
            if (relative == null) {
                throw new IOException("Caminho de arquivo inválido: " + entry.getKey());
            }
            if (!hasAllowedExtension(relative)) {
                throw new IOException("Extensão não permitida: " + relative);
            }
            byte[] content = entry.getValue();
            if (content == null) {
                content = new byte[0];
            }
            if (content.length > maxBytes) {
                throw new IOException("Arquivo excede o tamanho máximo: " + relative);
            }

            Path target = workDir.resolve(relative).normalize();
            if (!target.startsWith(workDir)) {
                throw new IOException("Path traversal bloqueado: " + relative);
            }
            Files.createDirectories(target.getParent());
            Files.write(target, content);
        }
    }

    private ProcessResult runEngine(String engine, Path workDir, String mainPath)
            throws IOException, InterruptedException {
        List<String> command = new ArrayList<>();
        if ("latexmk".equalsIgnoreCase(engine)) {
            command.add(resolveExecutable("latexmk"));
            command.add("-pdf");
            command.add("-interaction=nonstopmode");
            command.add("-halt-on-error");
            command.add(mainPath);
        } else {
            command.add(resolveExecutable(engine));
            command.add("-interaction=nonstopmode");
            command.add("-halt-on-error");
            command.add("-file-line-error");
            command.add(mainPath);
        }

        ProcessBuilder builder = new ProcessBuilder(command);
        builder.directory(workDir.toFile());
        builder.redirectErrorStream(true);
        enrichProcessEnvironment(builder);

        Process process = builder.start();
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        try (InputStream in = process.getInputStream()) {
            in.transferTo(buffer);
        }

        long timeout = AppConfig.latexTimeoutSeconds();
        boolean finished = process.waitFor(timeout, TimeUnit.SECONDS);
        if (!finished) {
            process.destroyForcibly();
            return new ProcessResult(124, buffer.toString(StandardCharsets.UTF_8)
                    + "\n[timeout após " + timeout + "s]");
        }
        return new ProcessResult(process.exitValue(), buffer.toString(StandardCharsets.UTF_8));
    }

    private boolean isEngineAvailable(String engine) {
        try {
            String executable = resolveExecutable(
                    "latexmk".equalsIgnoreCase(engine) ? "latexmk" : engine
            );
            ProcessBuilder builder = new ProcessBuilder(executable, "--version");
            builder.redirectErrorStream(true);
            enrichProcessEnvironment(builder);
            Process process = builder.start();
            boolean finished = process.waitFor(5, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                return false;
            }
            return process.exitValue() == 0 || process.exitValue() == 1;
        } catch (IOException | InterruptedException error) {
            if (error instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            LOGGER.log(Level.INFO, "Engine indisponível: " + engine, error);
            return false;
        }
    }

    private void enrichProcessEnvironment(ProcessBuilder builder) {
        Map<String, String> env = builder.environment();
        // Instalação automática de pacotes sem diálogo GUI (quando possível)
        env.put("MIKTEX_AUTO_INSTALL", "1");
        env.put("MIKTEX_ENABLEINSTALLER", "1");
        env.putIfAbsent("MIKTEX_DISABLEINSTALLERGUI", "1");

        Path binDir = findTexBinDirectory();
        if (binDir != null) {
            String currentPath = env.getOrDefault("Path", env.getOrDefault("PATH", ""));
            String bin = binDir.toString();
            if (!currentPath.toLowerCase(Locale.ROOT).contains(bin.toLowerCase(Locale.ROOT))) {
                env.put("Path", bin + ";" + currentPath);
                env.put("PATH", bin + File.pathSeparator + currentPath);
            }
        }
    }

    private String resolveExecutable(String name) {
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        String executableName = os.contains("win") && !name.endsWith(".exe") ? name + ".exe" : name;

        Path configured = Path.of(AppConfig.get("latex.enginePath", "").trim());
        if (!AppConfig.get("latex.enginePath", "").isBlank()) {
            Path candidate = Files.isDirectory(configured)
                    ? configured.resolve(executableName)
                    : configured;
            if (Files.isRegularFile(candidate)) {
                return candidate.toAbsolutePath().toString();
            }
        }

        Path binDir = findTexBinDirectory();
        if (binDir != null) {
            Path candidate = binDir.resolve(executableName);
            if (Files.isRegularFile(candidate)) {
                return candidate.toAbsolutePath().toString();
            }
        }

        return executableName;
    }

    private Path findTexBinDirectory() {
        List<Path> candidates = new ArrayList<>();
        String userHome = System.getProperty("user.home", "");
        String localAppData = System.getenv("LOCALAPPDATA");
        String userProfile = System.getenv("USERPROFILE");
        String programFiles = System.getenv("ProgramFiles");

        // Linux / TinyTeX / TeX Live
        if (!userHome.isBlank()) {
            candidates.add(Path.of(userHome, ".TinyTeX", "bin", "x86_64-linux"));
            candidates.add(Path.of(userHome, ".TinyTeX", "bin", "aarch64-linux"));
            candidates.add(Path.of(userHome, "texlive", "2026", "bin", "x86_64-linux"));
            candidates.add(Path.of(userHome, "texlive", "2025", "bin", "x86_64-linux"));
            candidates.add(Path.of(userHome, ".local", "bin"));
        }
        candidates.add(Path.of("/usr/local/texlive/2026/bin/x86_64-linux"));
        candidates.add(Path.of("/usr/local/texlive/2025/bin/x86_64-linux"));
        candidates.add(Path.of("/usr/bin"));

        // Windows MiKTeX / TeX Live
        if (localAppData != null) {
            candidates.add(Path.of(localAppData, "Programs", "MiKTeX", "miktex", "bin", "x64"));
            candidates.add(Path.of(localAppData, "Programs", "MiKTeX", "miktex", "bin", "win64"));
        }
        if (programFiles != null) {
            candidates.add(Path.of(programFiles, "MiKTeX", "miktex", "bin", "x64"));
            candidates.add(Path.of(programFiles, "MiKTeX", "miktex", "bin", "win64"));
        }
        if (userProfile != null) {
            candidates.add(Path.of(userProfile, "AppData", "Local", "Programs", "MiKTeX", "miktex", "bin", "x64"));
        }
        candidates.add(Path.of("C:\\texlive\\2025\\bin\\windows"));
        candidates.add(Path.of("C:\\texlive\\2024\\bin\\windows"));
        candidates.add(Path.of("C:\\texlive\\2023\\bin\\windows"));

        for (Path candidate : candidates) {
            if (!Files.isDirectory(candidate)) {
                continue;
            }
            // Prefer directories that actually contain a TeX engine
            if (Files.isRegularFile(candidate.resolve("pdflatex"))
                    || Files.isRegularFile(candidate.resolve("pdflatex.exe"))
                    || Files.isRegularFile(candidate.resolve("latexmk"))
                    || Files.isRegularFile(candidate.resolve("latexmk.exe"))) {
                return candidate;
            }
        }
        return null;
    }

    private Path resolvePdfPath(Path workDir, String mainPath) {
        String base = mainPath;
        int slash = Math.max(base.lastIndexOf('/'), base.lastIndexOf('\\'));
        String fileName = slash >= 0 ? base.substring(slash + 1) : base;
        int dot = fileName.lastIndexOf('.');
        String stem = dot > 0 ? fileName.substring(0, dot) : fileName;
        Path parent = slash >= 0 ? workDir.resolve(base.substring(0, slash)) : workDir;
        return parent.resolve(stem + ".pdf");
    }

    static String normalizeRelativePath(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String normalized = raw.replace('\\', '/').trim();
        while (normalized.startsWith("./")) {
            normalized = normalized.substring(2);
        }
        if (normalized.startsWith("/") || normalized.contains("..")) {
            return null;
        }
        if (normalized.isBlank()) {
            return null;
        }
        return normalized;
    }

    private boolean hasAllowedExtension(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        int dot = lower.lastIndexOf('.');
        if (dot < 0) {
            return false;
        }
        return ALLOWED_EXTENSIONS.contains(lower.substring(dot));
    }

    private void deleteRecursively(Path root) {
        try (Stream<Path> walk = Files.walk(root)) {
            walk.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException error) {
                    LOGGER.log(Level.FINE, "Falha ao limpar temp: " + path, error);
                }
            });
        } catch (IOException error) {
            LOGGER.log(Level.WARNING, "Falha ao limpar diretório temporário", error);
        }
    }

    private record ProcessResult(int exitCode, String output) {
    }
}
