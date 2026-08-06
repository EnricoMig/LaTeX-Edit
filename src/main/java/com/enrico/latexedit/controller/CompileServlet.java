package com.enrico.latexedit.controller;

import com.enrico.latexedit.service.CompileResult;
import com.enrico.latexedit.service.LatexCompileService;
import com.enrico.latexedit.util.JsonResponses;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.MultipartConfig;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.Part;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

@WebServlet(name = "CompileServlet", urlPatterns = "/api/compile")
@MultipartConfig(
        fileSizeThreshold = 1024 * 1024,
        maxFileSize = 8L * 1024 * 1024,
        maxRequestSize = 40L * 1024 * 1024
)
public class CompileServlet extends HttpServlet {

    private static final Logger LOGGER = Logger.getLogger(CompileServlet.class.getName());
    private final LatexCompileService compileService = new LatexCompileService();

    @Override
    protected void doPost(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {
        try {
            String contentType = request.getContentType();
            if (contentType != null && contentType.toLowerCase().startsWith("multipart/")) {
                handleMultipart(request, response);
                return;
            }
            handleJson(request, response);
        } catch (Exception error) {
            LOGGER.log(Level.SEVERE, "Falha em /api/compile", error);
            JsonResponses.error(response, HttpServletResponse.SC_INTERNAL_SERVER_ERROR,
                    "Erro interno ao compilar: " + error.getMessage());
        }
    }

    private void handleMultipart(HttpServletRequest request, HttpServletResponse response)
            throws IOException, ServletException {
        String main = firstNonBlank(request.getParameter("main"), request.getParameter("mainFile"), "main.tex");
        Map<String, byte[]> files = new LinkedHashMap<>();

        Collection<Part> parts = request.getParts();
        for (Part part : parts) {
            String field = part.getName();
            if ("main".equals(field) || "mainFile".equals(field)) {
                continue;
            }
            String relative = part.getSubmittedFileName();
            if (relative == null || relative.isBlank()) {
                String pathHeader = part.getHeader("X-Relative-Path");
                relative = pathHeader != null ? pathHeader : field;
            }
            if (relative == null || relative.isBlank() || "blob".equals(relative)) {
                continue;
            }
            try (InputStream in = part.getInputStream()) {
                files.put(relative.replace('\\', '/'), in.readAllBytes());
            }
        }

        respond(compileService.compile(main, files), response);
    }

    private void handleJson(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String body = new String(request.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        if (body.isBlank()) {
            JsonResponses.error(response, HttpServletResponse.SC_BAD_REQUEST, "Body JSON vazio.");
            return;
        }

        JsonObject root = JsonParser.parseString(body).getAsJsonObject();
        String main = root.has("main") ? root.get("main").getAsString() : "main.tex";
        Map<String, byte[]> files = new LinkedHashMap<>();

        if (!root.has("files") || !root.get("files").isJsonArray()) {
            JsonResponses.error(response, HttpServletResponse.SC_BAD_REQUEST,
                    "Campo 'files' (array) é obrigatório.");
            return;
        }

        JsonArray array = root.getAsJsonArray("files");
        for (JsonElement element : array) {
            if (!element.isJsonObject()) {
                continue;
            }
            JsonObject item = element.getAsJsonObject();
            if (!item.has("path") || !item.has("content")) {
                continue;
            }
            String path = item.get("path").getAsString();
            String content = item.get("content").getAsString();
            boolean base64 = item.has("encoding")
                    && "base64".equalsIgnoreCase(item.get("encoding").getAsString());
            byte[] bytes = base64
                    ? Base64.getDecoder().decode(content)
                    : content.getBytes(StandardCharsets.UTF_8);
            files.put(path.replace('\\', '/'), bytes);
        }

        respond(compileService.compile(main, files), response);
    }

    private void respond(CompileResult result, HttpServletResponse response) throws IOException {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", result.isSuccess());
        body.put("message", result.getMessage());
        body.put("engine", result.getEngine());
        body.put("log", result.getLog());

        if (result.isSuccess() && result.pdfBytes().isPresent()) {
            body.put("pdfBase64", Base64.getEncoder().encodeToString(result.pdfBytes().get()));
            JsonResponses.write(response, HttpServletResponse.SC_OK, body);
            return;
        }

        JsonResponses.write(response, 422, body);
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }
}
