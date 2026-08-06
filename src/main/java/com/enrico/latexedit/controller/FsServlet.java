package com.enrico.latexedit.controller;

import com.enrico.latexedit.config.AppConfig;
import com.enrico.latexedit.service.WorkspaceService;
import com.enrico.latexedit.util.JsonResponses;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

@WebServlet(name = "FsServlet", urlPatterns = "/api/fs/*")
public class FsServlet extends HttpServlet {

    private static final Logger LOGGER = Logger.getLogger(FsServlet.class.getName());
    private final WorkspaceService workspace = new WorkspaceService();

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String action = actionOf(request);
        try {
            switch (action) {
                case "info" -> writeInfo(response);
                case "list" -> writeList(request, response);
                case "tree" -> writeTree(request, response);
                case "read" -> writeRead(request, response);
                case "file" -> writeFileDownload(request, response);
                default -> JsonResponses.error(response, HttpServletResponse.SC_NOT_FOUND, "Ação FS desconhecida: " + action);
            }
        } catch (SecurityException error) {
            JsonResponses.error(response, HttpServletResponse.SC_FORBIDDEN, error.getMessage());
        } catch (Exception error) {
            LOGGER.log(Level.WARNING, "GET /api/fs/" + action, error);
            JsonResponses.error(response, HttpServletResponse.SC_BAD_REQUEST, error.getMessage());
        }
    }

    @Override
    protected void doPut(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String action = actionOf(request);
        try {
            if (!"write".equals(action)) {
                JsonResponses.error(response, HttpServletResponse.SC_NOT_FOUND, "Ação FS desconhecida: " + action);
                return;
            }
            JsonObject body = readJson(request);
            String path = text(body, "path");
            String content = body.has("content") ? body.get("content").getAsString() : "";
            workspace.writeText(path, content);
            Map<String, Object> ok = new LinkedHashMap<>();
            ok.put("success", true);
            ok.put("path", WorkspaceService.normalizeRelative(path));
            JsonResponses.write(response, HttpServletResponse.SC_OK, ok);
        } catch (SecurityException error) {
            JsonResponses.error(response, HttpServletResponse.SC_FORBIDDEN, error.getMessage());
        } catch (Exception error) {
            LOGGER.log(Level.WARNING, "PUT /api/fs/write", error);
            JsonResponses.error(response, HttpServletResponse.SC_BAD_REQUEST, error.getMessage());
        }
    }

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String action = actionOf(request);
        try {
            JsonObject body = readJson(request);
            switch (action) {
                case "mkdir" -> {
                    String path = text(body, "path");
                    workspace.mkdir(path);
                    okPath(response, path);
                }
                case "create" -> {
                    String path = text(body, "path");
                    String content = body.has("content") ? body.get("content").getAsString() : "";
                    workspace.createFile(path, content);
                    okPath(response, path);
                }
                case "rename" -> {
                    String from = text(body, "from");
                    String to = text(body, "to");
                    workspace.rename(from, to);
                    Map<String, Object> ok = new LinkedHashMap<>();
                    ok.put("success", true);
                    ok.put("from", WorkspaceService.normalizeRelative(from));
                    ok.put("to", WorkspaceService.normalizeRelative(to));
                    JsonResponses.write(response, HttpServletResponse.SC_OK, ok);
                }
                default -> JsonResponses.error(response, HttpServletResponse.SC_NOT_FOUND, "Ação FS desconhecida: " + action);
            }
        } catch (SecurityException error) {
            JsonResponses.error(response, HttpServletResponse.SC_FORBIDDEN, error.getMessage());
        } catch (Exception error) {
            LOGGER.log(Level.WARNING, "POST /api/fs/" + action, error);
            JsonResponses.error(response, HttpServletResponse.SC_BAD_REQUEST, error.getMessage());
        }
    }

    @Override
    protected void doDelete(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String action = actionOf(request);
        try {
            if (!"delete".equals(action)) {
                JsonResponses.error(response, HttpServletResponse.SC_NOT_FOUND, "Ação FS desconhecida: " + action);
                return;
            }
            String path = request.getParameter("path");
            if (path == null || path.isBlank()) {
                JsonResponses.error(response, HttpServletResponse.SC_BAD_REQUEST, "Parâmetro path obrigatório");
                return;
            }
            workspace.delete(path);
            okPath(response, path);
        } catch (SecurityException error) {
            JsonResponses.error(response, HttpServletResponse.SC_FORBIDDEN, error.getMessage());
        } catch (Exception error) {
            LOGGER.log(Level.WARNING, "DELETE /api/fs/delete", error);
            JsonResponses.error(response, HttpServletResponse.SC_BAD_REQUEST, error.getMessage());
        }
    }

    private void writeInfo(HttpServletResponse response) throws IOException {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("workspaceRoot", AppConfig.workspaceRoot());
        body.put("absoluteRoot", workspace.root().toString());
        JsonResponses.write(response, HttpServletResponse.SC_OK, body);
    }

    private void writeList(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String path = request.getParameter("path");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("path", WorkspaceService.normalizeRelative(path));
        body.put("items", workspace.list(path));
        JsonResponses.write(response, HttpServletResponse.SC_OK, body);
    }

    private void writeTree(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String path = request.getParameter("path");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("path", WorkspaceService.normalizeRelative(path));
        body.put("items", workspace.tree(path, 12, 2000));
        JsonResponses.write(response, HttpServletResponse.SC_OK, body);
    }

    private void writeRead(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String path = request.getParameter("path");
        if (path == null || path.isBlank()) {
            JsonResponses.error(response, HttpServletResponse.SC_BAD_REQUEST, "Parâmetro path obrigatório");
            return;
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("path", WorkspaceService.normalizeRelative(path));
        body.put("content", workspace.readText(path));
        JsonResponses.write(response, HttpServletResponse.SC_OK, body);
    }

    private void writeFileDownload(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String path = request.getParameter("path");
        if (path == null || path.isBlank()) {
            JsonResponses.error(response, HttpServletResponse.SC_BAD_REQUEST, "Parâmetro path obrigatório");
            return;
        }
        byte[] bytes = workspace.readBytes(path);
        String name = path.replace('\\', '/');
        int slash = name.lastIndexOf('/');
        String fileName = slash >= 0 ? name.substring(slash + 1) : name;
        String lower = fileName.toLowerCase();
        String contentType = "application/octet-stream";
        if (lower.endsWith(".pdf")) {
            contentType = "application/pdf";
        } else if (lower.endsWith(".png")) {
            contentType = "image/png";
        } else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
            contentType = "image/jpeg";
        }

        response.setStatus(HttpServletResponse.SC_OK);
        response.setContentType(contentType);
        response.setHeader(
                "Content-Disposition",
                "inline; filename*=UTF-8''" + URLEncoder.encode(fileName, StandardCharsets.UTF_8).replace("+", "%20")
        );
        response.setContentLength(bytes.length);
        response.getOutputStream().write(bytes);
    }

    private static void okPath(HttpServletResponse response, String path) throws IOException {
        Map<String, Object> ok = new LinkedHashMap<>();
        ok.put("success", true);
        ok.put("path", WorkspaceService.normalizeRelative(path));
        JsonResponses.write(response, HttpServletResponse.SC_OK, ok);
    }

    private static String actionOf(HttpServletRequest request) {
        String pathInfo = request.getPathInfo();
        if (pathInfo == null || pathInfo.isBlank() || "/".equals(pathInfo)) {
            return "";
        }
        String trimmed = pathInfo.startsWith("/") ? pathInfo.substring(1) : pathInfo;
        int slash = trimmed.indexOf('/');
        return slash >= 0 ? trimmed.substring(0, slash) : trimmed;
    }

    private static JsonObject readJson(HttpServletRequest request) throws IOException {
        String raw = new String(request.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        if (raw.isBlank()) {
            return new JsonObject();
        }
        return JsonParser.parseString(raw).getAsJsonObject();
    }

    private static String text(JsonObject body, String key) {
        if (body == null || !body.has(key) || body.get(key).isJsonNull()) {
            throw new IllegalArgumentException("Campo '" + key + "' obrigatório");
        }
        String value = body.get(key).getAsString();
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Campo '" + key + "' obrigatório");
        }
        return value;
    }
}
