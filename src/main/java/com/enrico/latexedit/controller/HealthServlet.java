package com.enrico.latexedit.controller;

import com.enrico.latexedit.config.AppConfig;
import com.enrico.latexedit.util.JsonResponses;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@WebServlet(name = "HealthServlet", urlPatterns = "/api/health")
public class HealthServlet extends HttpServlet {

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("app", AppConfig.appName());
        body.put("version", AppConfig.appVersion());
        body.put("engine", AppConfig.latexEngine());
        body.put("timestamp", Instant.now().toString());
        JsonResponses.write(response, HttpServletResponse.SC_OK, body);
    }
}
