import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Container entrypoint translating Vercel Postgres URIs and environment secrets into
 * QBank standalone configuration without baking credentials or H2 files into the image.
 */
public final class VercelLauncher {

    private VercelLauncher() {
    }

    public static void main(String[] args) throws Exception {
        LaunchConfig cfg = buildLaunchConfig(System.getenv(), Path.of("").toAbsolutePath().normalize());

        List<String> cmd = new ArrayList<>();
        cmd.add(resolveJavaBinary());
        cmd.add(envOrDefault(System.getenv(), "JAVA_OPTS_HEAP", "-Xmx512m"));
        cmd.add("-XX:+ExitOnOutOfMemoryError");
        cmd.add("-Djava.security.egd=file:/dev/./urandom");
        cmd.add("-jar");
        cmd.add(cfg.jarPath().toString());
        cmd.add("--server.port=" + cfg.port());
        cmd.add("--server.address=0.0.0.0");
        cmd.add("--server.ssl.enabled=false");
        cmd.add("--qbank.base-path=" + cfg.basePath());
        cmd.add("--qbank.storage-dir=" + cfg.storageDir());
        cmd.add("--qbank.backup.enabled=false");
        cmd.add("--qbank.datasource.url=" + cfg.jdbcUrl());
        if (!cfg.dbUsername().isBlank()) {
            cmd.add("--qbank.datasource.username=" + cfg.dbUsername());
        }

        ProcessBuilder pb = new ProcessBuilder(cmd).inheritIO();
        Map<String, String> childEnv = pb.environment();
        childEnv.put("QBANK_DB_PASSWORD", cfg.dbPassword());
        childEnv.put("QBANK_ENCRYPTION_KEY", cfg.encryptionKeyBase64());
        childEnv.put("QBANK_SIGNING_KEY", cfg.signingKeyBase64());
        childEnv.put("QBANK_ENCRYPTION_KEY_FILE", "");
        childEnv.put("QBANK_SIGNING_KEY_FILE", "");
        childEnv.put("QBANK_ENGINE_TOKEN", cfg.engineToken());

        Process child = pb.start();
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            if (child.isAlive()) {
                child.destroy();
            }
        }, "qbank-shutdown-bridge"));

        int exitCode = child.waitFor();
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

        String postgresUri = firstNonBlank(
                env.get("DATABASE_URL"),
                env.get("POSTGRES_URL"),
                env.get("POSTGRES_PRISMA_URL"),
                env.get("POSTGRES_URL_NON_POOLING")
        );
        if (postgresUri != null) {
            return convertPostgresUriToJdbc(postgresUri);
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
        if (rawQuery != null && !rawQuery.isBlank()) {
            jdbc.append('?').append(sanitizeQueryForPgJdbc(rawQuery));
        } else {
            jdbc.append("?sslmode=require");
        }
        return new JdbcTarget(jdbc.toString(), user, password);
    }

    private static String sanitizeQueryForPgJdbc(String rawQuery) {
        Map<String, String> kept = new LinkedHashMap<>();
        boolean hasSslMode = false;
        for (String pair : rawQuery.split("&")) {
            if (pair.isBlank()) {
                continue;
            }
            int eq = pair.indexOf('=');
            String k = eq >= 0 ? pair.substring(0, eq) : pair;
            String v = eq >= 0 ? pair.substring(eq + 1) : "";
            // Strip libpq/Prisma-only hints that are unnecessary or conflicting for PgJDBC
            if ("pgbouncer".equalsIgnoreCase(k) || "schema".equalsIgnoreCase(k) || "supa".equalsIgnoreCase(k)) {
                continue;
            }
            if ("sslmode".equalsIgnoreCase(k)) {
                hasSslMode = true;
            }
            kept.put(k, v);
        }
        if (!hasSslMode) {
            kept.put("sslmode", "require");
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

    private static String firstNonBlank(String... candidates) {
        for (String c : candidates) {
            String t = trimToNull(c);
            if (t != null) return t;
        }
        return null;
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
