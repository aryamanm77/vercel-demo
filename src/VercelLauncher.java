import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.ConnectException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Container entrypoint translating Vercel Postgres URIs and environment secrets into
 * QBank standalone configuration without baking credentials or H2 files into the image.
 */
public final class VercelLauncher {

    private static final Set<String> HOP_BY_HOP_REQUEST_HEADERS = Set.of(
            "host", "connection", "content-length", "transfer-encoding", "keep-alive",
            "proxy-authenticate", "proxy-authorization", "te", "trailer", "upgrade",
            "expect", "http2-settings"
    );

    private static final Set<String> HOP_BY_HOP_RESPONSE_HEADERS = Set.of(
            "connection", "content-length", "transfer-encoding", "keep-alive",
            "proxy-authenticate", "proxy-authorization", "te", "trailer", "upgrade"
    );

    private VercelLauncher() {
    }

    public static void main(String[] args) throws Exception {
        Path workDir = Path.of("").toAbsolutePath().normalize();
        LaunchConfig cfg = buildLaunchConfig(System.getenv(), workDir);
        Path portalDir = resolvePortalDir(System.getenv(), workDir);
        boolean gatewayMode = portalDir != null;
        int publicPort = Integer.parseInt(cfg.port());
        int qbankPort = gatewayMode ? pickFreeLoopbackPort() : publicPort;
        String qbankBindAddress = gatewayMode ? "127.0.0.1" : "0.0.0.0";

        List<String> cmd = new ArrayList<>();
        cmd.add(resolveJavaBinary());
        cmd.add(envOrDefault(System.getenv(), "JAVA_OPTS_HEAP", "-Xmx512m"));
        cmd.add("-XX:+ExitOnOutOfMemoryError");
        cmd.add("-Djava.security.egd=file:/dev/./urandom");
        cmd.add("-jar");
        cmd.add(cfg.jarPath().toString());
        cmd.add("--server.port=" + qbankPort);
        cmd.add("--server.address=" + qbankBindAddress);
        cmd.add("--server.ssl.enabled=false");
        cmd.add("--qbank.base-path=" + cfg.basePath());
        cmd.add("--qbank.storage-dir=" + cfg.storageDir());
        cmd.add("--qbank.backup.enabled=false");
        cmd.add("--qbank.datasource.url=");
        cmd.add("--spring.datasource.url=" + cfg.jdbcUrl());
        if (!cfg.dbUsername().isBlank()) {
            cmd.add("--spring.datasource.username=" + cfg.dbUsername());
        }
        cmd.add("--spring.datasource.hikari.maximum-pool-size=" + envOrDefault(System.getenv(), "QBANK_DB_MAX_POOL_SIZE", "2"));
        cmd.add("--spring.datasource.hikari.minimum-idle=0");
        cmd.add("--spring.datasource.hikari.idle-timeout=30000");
        cmd.add("--spring.datasource.hikari.max-lifetime=300000");

        ProcessBuilder pb = new ProcessBuilder(cmd).inheritIO();
        Map<String, String> childEnv = pb.environment();
        childEnv.put("SPRING_DATASOURCE_PASSWORD", cfg.dbPassword());
        childEnv.put("QBANK_DB_PASSWORD", "");
        childEnv.put("QBANK_ENCRYPTION_KEY", cfg.encryptionKeyBase64());
        childEnv.put("QBANK_SIGNING_KEY", cfg.signingKeyBase64());
        childEnv.put("QBANK_ENCRYPTION_KEY_FILE", "");
        childEnv.put("QBANK_SIGNING_KEY_FILE", "");
        childEnv.put("QBANK_ENGINE_TOKEN", cfg.engineToken());

        Process child = pb.start();
        PortalGateway gateway = gatewayMode
                ? startPortalGateway(publicPort, qbankPort, cfg.basePath(), portalDir)
                : null;

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            if (gateway != null) {
                gateway.close();
            }
            if (child.isAlive()) {
                child.destroy();
            }
        }, "qbank-shutdown-bridge"));

        int exitCode = child.waitFor();
        if (gateway != null) {
            gateway.close();
        }
        System.exit(exitCode);
    }

    public static LaunchConfig buildLaunchConfig(Map<String, String> env, Path workDir) {
        String aesB64 = requireBase64Key(env.get("QBANK_ENCRYPTION_KEY"), "QBANK_ENCRYPTION_KEY");
        String hmacB64 = requireBase64Key(env.get("QBANK_SIGNING_KEY"), "QBANK_SIGNING_KEY");

        JdbcTarget db = resolveJdbcTarget(env, workDir);
        String port = envOrDefault(env, "PORT", "80");
        String basePath = envOrDefault(env, "QBANK_BASE_PATH", "/qbank");
        String storageDir = envOrDefault(env, "QBANK_STORAGE_DIR", Path.of(System.getProperty("java.io.tmpdir"), "qbank-storage").toString());
        String engineToken = env.getOrDefault("QBANK_ENGINE_TOKEN", "");
        Path jarPath = Path.of(envOrDefault(env, "QBANK_JAR_PATH", workDir.resolve("app/qbank-standalone-1.0.0.jar").toString()))
                .toAbsolutePath().normalize();
        if (!Files.isRegularFile(jarPath)) {
            throw new IllegalStateException("QBank runnable JAR not found at: " + jarPath);
        }

        return new LaunchConfig(jarPath, port, basePath, storageDir, db.jdbcUrl(), db.username(), db.password(),
                aesB64, hmacB64, engineToken);
    }

    static JdbcTarget resolveJdbcTarget(Map<String, String> env, Path workDir) {
        String explicitJdbc = trimToNull(env.get("QBANK_DB_URL"));
        if (explicitJdbc != null) {
            return new JdbcTarget(
                    explicitJdbc,
                    trimToEmpty(env.get("QBANK_DB_USER")),
                    trimToEmpty(env.get("QBANK_DB_PASSWORD"))
            );
        }

        String pooledUri = firstPostgresUri(
                env.get("DATABASE_URL_POOLED"),
                env.get("POSTGRES_PRISMA_URL")
        );
        if (pooledUri != null) {
            return convertPostgresUriToJdbc(pooledUri, true);
        }

        String postgresUri = firstPostgresUri(
                env.get("POSTGRES_URL"),
                env.get("DATABASE_URL"),
                env.get("POSTGRES_URL_NON_POOLING")
        );
        if (postgresUri != null) {
            return convertPostgresUriToJdbc(postgresUri, false);
        }

        if ("true".equalsIgnoreCase(trimToEmpty(env.get("QBANK_VERCEL_DEMO_EPHEMERAL_H2")))) {
            String tmpDb = Path.of(System.getProperty("java.io.tmpdir"), "qbank-vercel-demo-h2")
                    .toAbsolutePath().toString().replace('\\', '/');
            return new JdbcTarget("jdbc:h2:file:" + tmpDb + ";DB_CLOSE_ON_EXIT=FALSE;WRITE_DELAY=0", "qbank", "");
        }

        throw new IllegalStateException(
                "No persistent PostgreSQL connection configured. Provision a Vercel Marketplace Postgres database "
                        + "(Neon, Supabase, or Prisma Postgres) providing DATABASE_URL/POSTGRES_URL, or set QBANK_DB_URL.");
    }

    static JdbcTarget convertPostgresUriToJdbc(String rawUri) {
        return convertPostgresUriToJdbc(rawUri, false);
    }

    static JdbcTarget convertPostgresUriToJdbc(String rawUri, boolean pooled) {
        String trimmed = rawUri.trim();
        if (trimmed.startsWith("jdbc:postgresql://")) {
            return new JdbcTarget(trimmed, "", "");
        }
        String normalized = trimmed.startsWith("postgres://")
                ? "postgresql://" + trimmed.substring("postgres://".length())
                : trimmed;
        URI uri = URI.create(normalized);
        if (!"postgresql".equalsIgnoreCase(uri.getScheme())) {
            throw new IllegalArgumentException("Expected postgres:// or postgresql:// URI, got scheme: " + uri.getScheme());
        }
        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            throw new IllegalArgumentException("Missing PostgreSQL hostname in connection URI");
        }
        int port = uri.getPort();
        String path = uri.getRawPath();
        if (path == null || path.isBlank() || "/".equals(path)) {
            throw new IllegalArgumentException("Missing database name in PostgreSQL connection URI");
        }

        String user = "";
        String password = "";
        String rawUserInfo = uri.getRawUserInfo();
        if (rawUserInfo != null && !rawUserInfo.isEmpty()) {
            int colon = rawUserInfo.indexOf(':');
            if (colon >= 0) {
                user = urlDecode(rawUserInfo.substring(0, colon));
                password = urlDecode(rawUserInfo.substring(colon + 1));
            } else {
                user = urlDecode(rawUserInfo);
            }
        }

        StringBuilder jdbc = new StringBuilder("jdbc:postgresql://").append(host);
        if (port > 0) {
            jdbc.append(':').append(port);
        }
        jdbc.append(path);
        String rawQuery = uri.getRawQuery();
        jdbc.append('?').append(sanitizeQueryForPgJdbc(rawQuery == null ? "" : rawQuery, pooled));
        return new JdbcTarget(jdbc.toString(), user, password);
    }

    private static String sanitizeQueryForPgJdbc(String rawQuery, boolean pooled) {
        Map<String, String> kept = new LinkedHashMap<>();
        boolean hasSslMode = false;
        boolean pgbouncerHint = pooled;
        boolean hasPrepareThreshold = false;
        for (String pair : rawQuery.split("&")) {
            if (pair.isBlank()) {
                continue;
            }
            int eq = pair.indexOf('=');
            String k = eq >= 0 ? pair.substring(0, eq) : pair;
            String v = eq >= 0 ? pair.substring(eq + 1) : "";
            if ("pgbouncer".equalsIgnoreCase(k)) {
                pgbouncerHint = pgbouncerHint || !"false".equalsIgnoreCase(v);
                continue;
            }
            // Strip libpq/Prisma-only hints that are unnecessary or conflicting for PgJDBC
            if ("schema".equalsIgnoreCase(k) || "supa".equalsIgnoreCase(k)) {
                continue;
            }
            if ("sslmode".equalsIgnoreCase(k)) {
                hasSslMode = true;
            }
            if ("prepareThreshold".equalsIgnoreCase(k)) {
                hasPrepareThreshold = true;
            }
            kept.put(k, v);
        }
        if (!hasSslMode) {
            kept.put("sslmode", "require");
        }
        if (pgbouncerHint && !hasPrepareThreshold) {
            kept.put("prepareThreshold", "0");
        }
        List<String> parts = new ArrayList<>(kept.size());
        for (var e : kept.entrySet()) {
            parts.add(e.getValue().isEmpty() ? e.getKey() : e.getKey() + "=" + e.getValue());
        }
        return String.join("&", parts);
    }

    private static String requireBase64Key(String value, String envName) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(
                    "Missing environment variable " + envName
                            + ". Generate a 256-bit Base64 key (e.g. openssl rand -base64 32) and set it in Vercel Project Environment Variables.");
        }
        byte[] decoded;
        try {
            decoded = Base64.getDecoder().decode(value.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("Invalid Base64 format in " + envName, e);
        }
        if (decoded.length < 32) {
            throw new IllegalStateException(envName + " decoded length is " + decoded.length + " bytes; requires >= 32 bytes");
        }
        return value.trim();
    }

    private static String resolveJavaBinary() {
        String exe = System.getProperty("os.name", "").toLowerCase().contains("win") ? "java.exe" : "java";
        return Path.of(System.getProperty("java.home"), "bin", exe).toString();
    }

    private static String urlDecode(String s) {
        return URLDecoder.decode(s, StandardCharsets.UTF_8);
    }

    private static String envOrDefault(Map<String, String> env, String key, String fallback) {
        String v = trimToNull(env.get(key));
        return v == null ? fallback : v;
    }

    private static String firstPostgresUri(String... candidates) {
        for (String c : candidates) {
            String t = trimToNull(c);
            if (t == null) {
                continue;
            }
            String lower = t.toLowerCase();
            if (lower.startsWith("postgres://") || lower.startsWith("postgresql://") || lower.startsWith("jdbc:postgresql://")) {
                return t;
            }
        }
        return null;
    }

    static Path resolvePortalDir(Map<String, String> env, Path workDir) {
        String configured = trimToNull(env.get("QBANK_PORTAL_DIR"));
        if (configured != null) {
            Path explicit = Path.of(configured).toAbsolutePath().normalize();
            if (!Files.isRegularFile(explicit.resolve("index.html"))) {
                throw new IllegalStateException("QBANK_PORTAL_DIR does not contain index.html: " + explicit);
            }
            return explicit;
        }
        for (String candidateName : List.of("portal-dist", "dist")) {
            Path candidate = workDir.resolve(candidateName).toAbsolutePath().normalize();
            if (Files.isRegularFile(candidate.resolve("index.html"))) {
                return candidate;
            }
        }
        return null;
    }

    private static int pickFreeLoopbackPort() throws IOException {
        try (ServerSocket socket = new ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))) {
            return socket.getLocalPort();
        }
    }

    private static String normalizeBasePath(String rawBasePath) {
        String trimmed = trimToEmpty(rawBasePath);
        if (trimmed.isEmpty() || "/".equals(trimmed)) {
            return "";
        }
        String withLeading = trimmed.startsWith("/") ? trimmed : "/" + trimmed;
        return withLeading.endsWith("/") ? withLeading.substring(0, withLeading.length() - 1) : withLeading;
    }

    private static PortalGateway startPortalGateway(int publicPort, int qbankPort, String rawBasePath, Path portalDir)
            throws IOException {
        String basePath = normalizeBasePath(rawBasePath);
        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", publicPort), 0);
        AtomicInteger threadCounter = new AtomicInteger(1);
        ExecutorService executor = Executors.newCachedThreadPool(runnable -> {
            Thread t = new Thread(runnable, "vercel-portal-gateway-" + threadCounter.getAndIncrement());
            t.setDaemon(true);
            return t;
        });
        server.setExecutor(executor);

        HttpClient client = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .followRedirects(HttpClient.Redirect.NEVER)
                .connectTimeout(Duration.ofSeconds(5))
                .build();

        server.createContext("/", exchange -> {
            try (exchange) {
                routeExchange(exchange, basePath, qbankPort, portalDir, client);
            } catch (Exception e) {
                try {
                    sendPlainText(exchange, 502, "Gateway error");
                } catch (IOException ignored) {
                }
            }
        });
        server.start();
        return new PortalGateway(server, executor);
    }

    private static void routeExchange(
            HttpExchange exchange,
            String basePath,
            int qbankPort,
            Path portalDir,
            HttpClient client) throws IOException {
        String rawPath = exchange.getRequestURI().getRawPath();
        if (rawPath == null || rawPath.isEmpty()) {
            rawPath = "/";
        }

        boolean isQbankRoute = !basePath.isEmpty()
                && (rawPath.equals(basePath) || rawPath.startsWith(basePath + "/"));
        if (isQbankRoute) {
            proxyToQbank(exchange, qbankPort, client);
            return;
        }

        if ("/".equals(rawPath)) {
            sendRedirect(exchange, "/admin/login");
            return;
        }

        servePortalStaticOrSpa(exchange, rawPath, portalDir);
    }

    private static void proxyToQbank(HttpExchange exchange, int qbankPort, HttpClient client) throws IOException {
        URI reqUri = exchange.getRequestURI();
        String rawPath = reqUri.getRawPath();
        String pathAndQuery = (rawPath == null || rawPath.isEmpty() ? "/" : rawPath)
                + (reqUri.getRawQuery() != null ? "?" + reqUri.getRawQuery() : "");
        URI targetUri = URI.create("http://127.0.0.1:" + qbankPort + pathAndQuery);

        String method = exchange.getRequestMethod().toUpperCase(Locale.ROOT);
        boolean readBody = !("GET".equals(method) || "HEAD".equals(method));
        byte[] reqBytes = readBody ? exchange.getRequestBody().readAllBytes() : new byte[0];
        HttpRequest.BodyPublisher publisher = readBody
                ? HttpRequest.BodyPublishers.ofByteArray(reqBytes)
                : HttpRequest.BodyPublishers.noBody();

        HttpRequest.Builder builder = HttpRequest.newBuilder(targetUri)
                .timeout(Duration.ofSeconds(60))
                .method(method, publisher);

        Headers reqHeaders = exchange.getRequestHeaders();
        String originalHost = null;
        boolean hasForwardedHost = false;
        boolean hasForwardedProto = false;
        boolean hasForwardedFor = false;
        for (var entry : reqHeaders.entrySet()) {
            String key = entry.getKey();
            if (key == null) continue;
            String lower = key.toLowerCase(Locale.ROOT);
            if ("host".equals(lower) && !entry.getValue().isEmpty()) {
                originalHost = entry.getValue().get(0);
            }
            if ("x-forwarded-host".equals(lower)) hasForwardedHost = true;
            if ("x-forwarded-proto".equals(lower)) hasForwardedProto = true;
            if ("x-forwarded-for".equals(lower)) hasForwardedFor = true;
            if (HOP_BY_HOP_REQUEST_HEADERS.contains(lower) || lower.startsWith(":")) {
                continue;
            }
            for (String value : entry.getValue()) {
                builder.header(key, value);
            }
        }
        if (!hasForwardedHost && originalHost != null && !originalHost.isBlank()) {
            builder.header("X-Forwarded-Host", originalHost);
        }
        if (!hasForwardedProto) {
            builder.header("X-Forwarded-Proto", "http");
        }
        if (!hasForwardedFor && exchange.getRemoteAddress() != null && exchange.getRemoteAddress().getAddress() != null) {
            builder.header("X-Forwarded-For", exchange.getRemoteAddress().getAddress().getHostAddress());
        }

        HttpResponse<byte[]> upstream;
        try {
            upstream = client.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray());
        } catch (ConnectException startingUp) {
            exchange.getResponseHeaders().set("Retry-After", "1");
            sendPlainText(exchange, 503, "QBank backend is starting up. Please retry.");
            return;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            sendPlainText(exchange, 502, "Upstream request interrupted");
            return;
        }

        String internalOrigin = "http://127.0.0.1:" + qbankPort;
        Headers respHeaders = exchange.getResponseHeaders();
        for (var entry : upstream.headers().map().entrySet()) {
            String key = entry.getKey();
            if (key == null) continue;
            String lower = key.toLowerCase(Locale.ROOT);
            if (HOP_BY_HOP_RESPONSE_HEADERS.contains(lower) || lower.startsWith(":")) {
                continue;
            }
            List<String> values = entry.getValue();
            if ("location".equals(lower)) {
                List<String> rewritten = new ArrayList<>(values.size());
                for (String v : values) {
                    rewritten.add(v.startsWith(internalOrigin) ? v.substring(internalOrigin.length()) : v);
                }
                respHeaders.put(key, rewritten);
            } else {
                respHeaders.put(key, values);
            }
        }

        int status = upstream.statusCode();
        byte[] respBody = upstream.body();
        boolean suppressBody = "HEAD".equals(method) || status == 204 || status == 304 || respBody == null || respBody.length == 0;
        if (suppressBody) {
            exchange.sendResponseHeaders(status, -1);
        } else {
            exchange.sendResponseHeaders(status, respBody.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(respBody);
            }
        }
    }

    private static void servePortalStaticOrSpa(HttpExchange exchange, String rawPath, Path portalDir) throws IOException {
        String method = exchange.getRequestMethod().toUpperCase(Locale.ROOT);
        if (!"GET".equals(method) && !"HEAD".equals(method)) {
            sendPlainText(exchange, 405, "Method Not Allowed");
            return;
        }

        Path resolved = resolveSafeChild(portalDir, rawPath);
        if (resolved != null && Files.isRegularFile(resolved)) {
            boolean immutableAsset = rawPath.startsWith("/assets/") && !rawPath.endsWith(".html");
            serveFile(exchange, resolved, immutableAsset, "HEAD".equals(method));
            return;
        }

        if ("/admin".equals(rawPath) || rawPath.startsWith("/admin/")) {
            serveFile(exchange, portalDir.resolve("index.html"), false, "HEAD".equals(method));
            return;
        }

        sendPlainText(exchange, 404, "Not Found");
    }

    private static Path resolveSafeChild(Path root, String rawPath) {
        String relative = rawPath.startsWith("/") ? rawPath.substring(1) : rawPath;
        if (relative.isEmpty()) {
            return null;
        }
        String decoded;
        try {
            decoded = URLDecoder.decode(relative, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return null;
        }
        if (decoded.indexOf('\0') >= 0) {
            return null;
        }
        Path candidate = root.resolve(decoded).normalize();
        return candidate.startsWith(root) ? candidate : null;
    }

    private static void serveFile(HttpExchange exchange, Path file, boolean immutableAsset, boolean headOnly)
            throws IOException {
        byte[] bytes = Files.readAllBytes(file);
        Headers headers = exchange.getResponseHeaders();
        headers.set("Content-Type", detectContentType(file.getFileName().toString()));
        headers.set("X-Content-Type-Options", "nosniff");
        headers.set("Cache-Control", immutableAsset ? "public, max-age=31536000, immutable" : "no-cache");
        if (headOnly || bytes.length == 0) {
            exchange.sendResponseHeaders(200, -1);
        } else {
            exchange.sendResponseHeaders(200, bytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(bytes);
            }
        }
    }

    private static void sendRedirect(HttpExchange exchange, String location) throws IOException {
        exchange.getResponseHeaders().set("Location", location);
        exchange.sendResponseHeaders(302, -1);
    }

    private static void sendPlainText(HttpExchange exchange, int status, String message) throws IOException {
        byte[] bytes = message.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private static String detectContentType(String filename) {
        String lower = filename.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".html")) return "text/html; charset=utf-8";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript; charset=utf-8";
        if (lower.endsWith(".css")) return "text/css; charset=utf-8";
        if (lower.endsWith(".json")) return "application/json; charset=utf-8";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".pdf")) return "application/pdf";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        return "application/octet-stream";
    }

    private static final class PortalGateway implements AutoCloseable {
        private final HttpServer server;
        private final ExecutorService executor;

        private PortalGateway(HttpServer server, ExecutorService executor) {
            this.server = server;
            this.executor = executor;
        }

        @Override
        public void close() {
            server.stop(0);
            executor.shutdownNow();
        }
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private static String trimToEmpty(String s) {
        return s == null ? "" : s.trim();
    }

    public record JdbcTarget(String jdbcUrl, String username, String password) {
    }

    public record LaunchConfig(
            Path jarPath,
            String port,
            String basePath,
            String storageDir,
            String jdbcUrl,
            String dbUsername,
            String dbPassword,
            String encryptionKeyBase64,
            String signingKeyBase64,
            String engineToken
    ) {
    }
}
