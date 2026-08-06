package com.enrico.latexedit.service;

import com.enrico.latexedit.config.AppConfig;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Acesso a arquivos sob a raiz do workspace no servidor (NAS).
 */
public class WorkspaceService {

    private static final Set<String> TEXT_EXT = Set.of(
            ".tex", ".bib", ".sty", ".cls", ".txt", ".md", ".csv", ".json", ".xml", ".html", ".css", ".js"
    );
    private static final Set<String> BINARY_EXT = Set.of(
            ".pdf", ".png", ".jpg", ".jpeg", ".eps", ".svg", ".gif", ".webp"
    );

    public Path root() throws IOException {
        Path root = Path.of(AppConfig.workspaceRoot()).toAbsolutePath().normalize();
        if (!Files.exists(root)) {
            Files.createDirectories(root);
        }
        if (!Files.isDirectory(root)) {
            throw new IOException("Workspace não é um diretório: " + root);
        }
        return root;
    }

    public Path resolveSafe(String relative) throws IOException {
        Path root = root();
        String normalized = normalizeRelative(relative);
        Path resolved = root.resolve(normalized).normalize();
        if (!resolved.startsWith(root)) {
            throw new SecurityException("Caminho fora do workspace: " + relative);
        }
        return resolved;
    }

    public static String normalizeRelative(String relative) {
        if (relative == null || relative.isBlank() || ".".equals(relative) || "/".equals(relative)) {
            return "";
        }
        String path = relative.replace('\\', '/').trim();
        while (path.startsWith("./")) {
            path = path.substring(2);
        }
        while (path.startsWith("/")) {
            path = path.substring(1);
        }
        if (path.contains("..")) {
            throw new SecurityException("Path traversal não permitido: " + relative);
        }
        return path;
    }

    public String toRelative(Path absolute) throws IOException {
        Path root = root();
        Path normalized = absolute.toAbsolutePath().normalize();
        if (!normalized.startsWith(root)) {
            throw new SecurityException("Fora do workspace");
        }
        String rel = root.relativize(normalized).toString().replace('\\', '/');
        return rel;
    }

    public List<Map<String, Object>> list(String relative) throws IOException {
        Path dir = resolveSafe(relative);
        if (!Files.exists(dir)) {
            throw new IOException("Pasta não encontrada: " + relative);
        }
        if (!Files.isDirectory(dir)) {
            throw new IOException("Não é uma pasta: " + relative);
        }

        List<Map<String, Object>> items = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir)) {
            for (Path child : stream) {
                String name = child.getFileName().toString();
                if (name.startsWith(".")) {
                    continue;
                }
                boolean isDir = Files.isDirectory(child);
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("name", name);
                row.put("path", toRelative(child));
                row.put("type", isDir ? "dir" : "file");
                if (!isDir) {
                    row.put("kind", kindOf(name));
                    row.put("size", Files.size(child));
                }
                items.add(row);
            }
        }
        items.sort(Comparator
                .comparing((Map<String, Object> m) -> !"dir".equals(m.get("type")))
                .thenComparing(m -> String.valueOf(m.get("name")), String.CASE_INSENSITIVE_ORDER));
        return items;
    }

    /**
     * Árvore recursiva limitada (para o explorer do projeto).
     */
    public List<Map<String, Object>> tree(String relative, int maxDepth, int maxNodes) throws IOException {
        Path base = resolveSafe(relative);
        if (!Files.isDirectory(base)) {
            throw new IOException("Projeto inválido: " + relative);
        }
        List<Map<String, Object>> nodes = new ArrayList<>();
        walkTree(base, relative == null ? "" : normalizeRelative(relative), 0, maxDepth, maxNodes, nodes);
        return nodes;
    }

    private void walkTree(Path dir, String relDir, int depth, int maxDepth, int maxNodes, List<Map<String, Object>> out)
            throws IOException {
        if (out.size() >= maxNodes || depth > maxDepth) {
            return;
        }
        List<Path> children;
        try (Stream<Path> stream = Files.list(dir)) {
            children = stream
                    .filter(p -> !p.getFileName().toString().startsWith("."))
                    .sorted(Comparator
                            .comparing((Path p) -> !Files.isDirectory(p))
                            .thenComparing(p -> p.getFileName().toString(), String.CASE_INSENSITIVE_ORDER))
                    .collect(Collectors.toList());
        }
        for (Path child : children) {
            if (out.size() >= maxNodes) {
                return;
            }
            String name = child.getFileName().toString();
            String path = relDir.isEmpty() ? name : relDir + "/" + name;
            boolean isDir = Files.isDirectory(child);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("name", name);
            row.put("path", path);
            row.put("type", isDir ? "dir" : "file");
            row.put("depth", depth);
            if (!isDir) {
                row.put("kind", kindOf(name));
            }
            out.add(row);
            if (isDir) {
                walkTree(child, path, depth + 1, maxDepth, maxNodes, out);
            }
        }
    }

    public String readText(String relative) throws IOException {
        Path file = resolveSafe(relative);
        if (!Files.isRegularFile(file)) {
            throw new IOException("Arquivo não encontrado: " + relative);
        }
        long size = Files.size(file);
        if (size > AppConfig.latexMaxFileBytes()) {
            throw new IOException("Arquivo grande demais: " + relative);
        }
        return Files.readString(file, StandardCharsets.UTF_8);
    }

    public byte[] readBytes(String relative) throws IOException {
        Path file = resolveSafe(relative);
        if (!Files.isRegularFile(file)) {
            throw new IOException("Arquivo não encontrado: " + relative);
        }
        long size = Files.size(file);
        if (size > AppConfig.latexMaxFileBytes() * 4L) {
            throw new IOException("Arquivo grande demais: " + relative);
        }
        return Files.readAllBytes(file);
    }

    public void writeText(String relative, String content) throws IOException {
        Path file = resolveSafe(relative);
        Path parent = file.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        byte[] bytes = content == null ? new byte[0] : content.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > AppConfig.latexMaxFileBytes()) {
            throw new IOException("Conteúdo excede o limite permitido");
        }
        Files.write(file, bytes, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
    }

    public void writeBytes(String relative, byte[] bytes) throws IOException {
        Path file = resolveSafe(relative);
        Path parent = file.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        if (bytes.length > AppConfig.latexMaxFileBytes() * 4L) {
            throw new IOException("Arquivo excede o limite permitido");
        }
        Files.write(file, bytes, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
    }

    public void mkdir(String relative) throws IOException {
        Path dir = resolveSafe(relative);
        Files.createDirectories(dir);
    }

    public void createFile(String relative, String content) throws IOException {
        Path file = resolveSafe(relative);
        if (Files.exists(file)) {
            throw new IOException("Já existe: " + relative);
        }
        Path parent = file.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        Files.writeString(file, content == null ? "" : content, StandardCharsets.UTF_8,
                StandardOpenOption.CREATE_NEW);
    }

    public void delete(String relative) throws IOException {
        Path target = resolveSafe(relative);
        if (!Files.exists(target)) {
            throw new IOException("Não encontrado: " + relative);
        }
        if (Files.isDirectory(target)) {
            try (Stream<Path> walk = Files.walk(target)) {
                walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                    try {
                        Files.deleteIfExists(p);
                    } catch (IOException ignored) {
                        // best effort
                    }
                });
            }
        } else {
            Files.delete(target);
        }
    }

    public void rename(String from, String to) throws IOException {
        Path source = resolveSafe(from);
        Path dest = resolveSafe(to);
        if (!Files.exists(source)) {
            throw new IOException("Origem não encontrada: " + from);
        }
        if (source.equals(dest)) {
            return;
        }
        if (Files.exists(dest)) {
            throw new IOException("Destino já existe: " + to);
        }
        Path parent = dest.getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
        try {
            Files.move(source, dest);
        } catch (IOException error) {
            String detail = error.getMessage() == null ? "" : error.getMessage();
            // Evita expor paths absolutos crus do NIO (ex.: "a -> b")
            if (detail.contains(" -> ")) {
                throw new IOException("Não foi possível renomear '" + from + "' para '" + to + "'.", error);
            }
            throw error;
        }
    }

    public Map<String, byte[]> collectProjectFiles(String projectRelative) throws IOException {
        Path project = resolveSafe(projectRelative);
        if (!Files.isDirectory(project)) {
            throw new IOException("Projeto inválido: " + projectRelative);
        }
        Map<String, byte[]> files = new LinkedHashMap<>();
        int maxFiles = AppConfig.latexMaxFiles();
        int maxBytes = AppConfig.latexMaxFileBytes();
        try (Stream<Path> walk = Files.walk(project)) {
            List<Path> paths = walk
                    .filter(Files::isRegularFile)
                    .filter(p -> !p.getFileName().toString().startsWith("."))
                    .sorted()
                    .toList();
            for (Path path : paths) {
                if (files.size() >= maxFiles) {
                    break;
                }
                String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
                String ext = name.contains(".") ? name.substring(name.lastIndexOf('.')) : "";
                if (!TEXT_EXT.contains(ext) && !BINARY_EXT.contains(ext)) {
                    continue;
                }
                long size = Files.size(path);
                if (size > maxBytes) {
                    continue;
                }
                String rel = project.relativize(path).toString().replace('\\', '/');
                files.put(rel, Files.readAllBytes(path));
            }
        }
        return files;
    }

    public static String kindOf(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".pdf")) {
            return "pdf";
        }
        if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg")
                || lower.endsWith(".eps") || lower.endsWith(".svg") || lower.endsWith(".gif")) {
            return "asset";
        }
        return "text";
    }

    public boolean isTextKind(String name) {
        return "text".equals(kindOf(name));
    }
}
