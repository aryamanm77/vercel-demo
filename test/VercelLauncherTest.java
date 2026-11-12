import java.io.IOException;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;

/**
 * Verifies Postgres URI conversion, required secret checks, and real standalone JVM boot under demo configuration.
 */
public final class VercelLauncherTest {

    public static void main(String[] args) throws Exception {
        testPostgresUriConversion();
        testMissingEnvFailsFast();
        testPortalDirResolution();
        testLiveContainerEnvBoot();
        testLivePortalGatewayRouting();
        System.out.println("ALL_VERCEL_LAUNCHER_CHECKS_PASSED");
    }

    private static void testPostgresUriConversion() {
        var target = VercelLauncher.convertPostgresUriToJdbc(
                "postgres://neondb_owner:p%40ss%3Aword%2F1@ep-cool-forest-1234.us-east-1.aws.neon.tech:5432/neondb?pgbouncer=true&sslmode=require");
        assertEq("jdbc:postgresql://ep-cool-forest-1234.us-east-1.aws.neon.tech:5432/neondb?sslmode=require&prepareThreshold=0", target.jdbcUrl());
        assertEq("neondb_owner", target.username());
        assertEq("p@ss:word/1", target.password());

        var noQuery = VercelLauncher.convertPostgresUriToJdbc(
                "postgresql://user1:secret@db.example.internal/qbank");
        assertEq("jdbc:postgresql://db.example.internal/qbank?sslmode=require", noQuery.jdbcUrl());
        assertEq("user1", noQuery.username());
        assertEq("secret", noQuery.password());

        String validB64 = randomB6432();
        var pooledCfg = VercelLauncher.buildLaunchConfig(Map.of(
                "QBANK_ENCRYPTION_KEY", validB64,
                "QBANK_SIGNING_KEY", validB64,
                "DATABASE_URL", "postgres://prisma_migration:directpw@db.prisma.io:5432/postgres?sslmode=require",
                "DATABASE_URL_POOLED", "postgres://pooluser:poolpw@db.prisma.io:5432/postgres?sslmode=require",
                "PRISMA_DATABASE_URL", "prisma+postgres://accelerate.prisma-data.net/?api_key=ignored"
        ), Path.of("").toAbsolutePath().normalize());
        assertEq("jdbc:postgresql://db.prisma.io:5432/postgres?sslmode=require&prepareThreshold=0", pooledCfg.jdbcUrl());
        assertEq("pooluser", pooledCfg.dbUsername());
        assertEq("poolpw", pooledCfg.dbPassword());
    }

    private static void testMissingEnvFailsFast() {
        Path demoRoot = Path.of("").toAbsolutePath().normalize();
        String validB64 = randomB6432();
        try {
            VercelLauncher.buildLaunchConfig(Map.of("QBANK_SIGNING_KEY", validB64, "DATABASE_URL", "postgres://u:p@h/d"), demoRoot);
            throw new AssertionError("Expected missing encryption key failure");
        } catch (IllegalStateException expected) {
            if (!expected.getMessage().contains("QBANK_ENCRYPTION_KEY")) {
                throw new AssertionError("Unexpected message: " + expected.getMessage());
            }
        }
        try {
            VercelLauncher.buildLaunchConfig(Map.of("QBANK_ENCRYPTION_KEY", validB64, "QBANK_SIGNING_KEY", validB64), demoRoot);
            throw new AssertionError("Expected missing PostgreSQL URI failure");
        } catch (IllegalStateException expected) {
            if (!expected.getMessage().contains("PostgreSQL")) {
                throw new AssertionError("Unexpected message: " + expected.getMessage());
            }
        }
    }

    private static void testPortalDirResolution() throws IOException {
        Path tempRoot = Files.createTempDirectory("qbank-portal-resolve");
        try {
            if (VercelLauncher.resolvePortalDir(Map.of(), tempRoot) != null) {
                throw new AssertionError("Expected null portal dir when neither portal-dist nor dist exists");
            }
            Path dist = Files.createDirectories(tempRoot.resolve("dist"));
            Files.writeString(dist.resolve("index.html"), "<html><body>Admin Portal</body></html>");
            Path resolved = VercelLauncher.resolvePortalDir(Map.of(), tempRoot);
            if (!dist.toAbsolutePath().normalize().equals(resolved)) {
                throw new AssertionError("Expected dist resolution, got: " + resolved);
            }
            try {
                VercelLauncher.resolvePortalDir(Map.of("QBANK_PORTAL_DIR", tempRoot.resolve("missing").toString()), tempRoot);
                throw new AssertionError("Expected failure for missing explicit QBANK_PORTAL_DIR");
            } catch (IllegalStateException expected) {
                if (!expected.getMessage().contains("QBANK_PORTAL_DIR")) {
                    throw new AssertionError("Unexpected message: " + expected.getMessage());
                }
            }
        } finally {
            deleteRecursive(tempRoot);
        }
    }

    private static void testLivePortalGatewayRouting() throws Exception {
        Path workDir = Path.of("").toAbsolutePath().normalize();
        Path tempDir = Files.createTempDirectory("qbank-vercel-gateway-smoke");
        Path portalDir = Files.createDirectories(tempDir.resolve("portal"));
        Files.createDirectories(portalDir.resolve("assets"));
        Files.writeString(portalDir.resolve("index.html"), "<!doctype html><html><body><div id=\"root\"></div></body></html>");
        Files.writeString(portalDir.resolve("assets/test-bundle.js"), "console.log('portal-ok');");

        int port = freePort();
        ProcessBuilder pb = new ProcessBuilder(
                Path.of(System.getProperty("java.home"), "bin",
                        System.getProperty("os.name").toLowerCase().contains("win") ? "java.exe" : "java").toString(),
                "-cp", System.getProperty("java.class.path"),
                "VercelLauncher"
        ).directory(workDir.toFile()).redirectErrorStream(true);

        Path logFile = tempDir.resolve("gateway-boot.log");
        pb.redirectOutput(logFile.toFile());
        Map<String, String> env = pb.environment();
        env.put("PORT", String.valueOf(port));
        env.put("QBANK_ENCRYPTION_KEY", randomB6432());
        env.put("QBANK_SIGNING_KEY", randomB6432());
        env.put("QBANK_STORAGE_DIR", tempDir.resolve("storage").toString());
        env.put("QBANK_PORTAL_DIR", portalDir.toString());
        env.put("QBANK_VERCEL_DEMO_EPHEMERAL_H2", "true");

        Process proc = pb.start();
        try {
            HttpClient client = HttpClient.newBuilder()
                    .followRedirects(HttpClient.Redirect.NEVER)
                    .connectTimeout(Duration.ofSeconds(3))
                    .build();
            long deadline = System.currentTimeMillis() + 60_000L;
            boolean ok = false;
            while (System.currentTimeMillis() < deadline) {
                if (!proc.isAlive()) {
                    throw new IllegalStateException("VercelLauncher gateway exited early (" + proc.exitValue() + "):\n" + Files.readString(logFile));
                }
                try {
                    HttpResponse<String> info = client.send(
                            HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/qbank/api/v1/auth/info"))
                                    .timeout(Duration.ofSeconds(2)).GET().build(),
                            HttpResponse.BodyHandlers.ofString());
                    if (info.statusCode() == 200) {
                        if (!info.body().contains("\"setupRequired\":true")) {
                            throw new AssertionError("Unexpected auth/info payload: " + info.body());
                        }
                        HttpResponse<String> qbankRoot = client.send(
                                HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/qbank"))
                                        .timeout(Duration.ofSeconds(2)).GET().build(),
                                HttpResponse.BodyHandlers.ofString());
                        if (qbankRoot.statusCode() != 302) {
                            throw new AssertionError("Expected 302 from /qbank, got " + qbankRoot.statusCode());
                        }
                        HttpResponse<String> rootRedirect = client.send(
                                HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/"))
                                        .timeout(Duration.ofSeconds(2)).GET().build(),
                                HttpResponse.BodyHandlers.ofString());
                        if (rootRedirect.statusCode() != 302 || !"/qbank/index.html".equals(rootRedirect.headers().firstValue("Location").orElse(""))) {
                            throw new AssertionError("Unexpected root redirect: " + rootRedirect.statusCode() + " -> " + rootRedirect.headers().map());
                        }
                        HttpResponse<String> adminSpa = client.send(
                                HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/admin/login"))
                                        .timeout(Duration.ofSeconds(2)).GET().build(),
                                HttpResponse.BodyHandlers.ofString());
                        if (adminSpa.statusCode() != 200 || !adminSpa.body().contains("<div id=\"root\"></div>")) {
                            throw new AssertionError("Unexpected /admin/login response: " + adminSpa.statusCode());
                        }
                        HttpResponse<String> asset = client.send(
                                HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/assets/test-bundle.js"))
                                        .timeout(Duration.ofSeconds(2)).GET().build(),
                            HttpResponse.BodyHandlers.ofString());
                        if (asset.statusCode() != 200 || !asset.body().contains("portal-ok")) {
                            throw new AssertionError("Unexpected asset response: " + asset.statusCode());
                        }
                        HttpResponse<String> traversal = client.send(
                                HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/assets/../../pom.xml"))
                                        .timeout(Duration.ofSeconds(2)).GET().build(),
                                HttpResponse.BodyHandlers.ofString());
                        if (traversal.statusCode() != 404) {
                            throw new AssertionError("Expected 404 on traversal path, got " + traversal.statusCode());
                        }
                        ok = true;
                        break;
                    }
                } catch (IOException ignored) {
                    // booting
                }
                Thread.sleep(400);
            }
            if (!ok) {
                throw new AssertionError("Timed out waiting for VercelLauncher gateway:\n" + Files.readString(logFile));
            }
        } finally {
            proc.descendants().forEach(ProcessHandle::destroyForcibly);
            proc.destroyForcibly();
            proc.waitFor();
            deleteRecursive(tempDir);
        }
    }

    private static void testLiveContainerEnvBoot() throws Exception {
        Path workDir = Path.of("").toAbsolutePath().normalize();
        Path classesDir = Files.createTempDirectory("qbank-vercel-launcher-smoke");
        int port = freePort();
        String aes = randomB6432();
        String hmac = randomB6432();
        Path storageDir = classesDir.resolve("storage");

        ProcessBuilder pb = new ProcessBuilder(
                Path.of(System.getProperty("java.home"), "bin",
                        System.getProperty("os.name").toLowerCase().contains("win") ? "java.exe" : "java").toString(),
                "-cp", System.getProperty("java.class.path"),
                "VercelLauncher"
        ).directory(workDir.toFile()).redirectErrorStream(true);

        Path logFile = classesDir.resolve("launcher-boot.log");
        pb.redirectOutput(logFile.toFile());
        Map<String, String> env = pb.environment();
        env.put("PORT", String.valueOf(port));
        env.put("QBANK_ENCRYPTION_KEY", aes);
        env.put("QBANK_SIGNING_KEY", hmac);
        env.put("QBANK_STORAGE_DIR", storageDir.toString());
        env.put("QBANK_VERCEL_DEMO_EPHEMERAL_H2", "true");

        Process proc = pb.start();
        try {
            HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
            long deadline = System.currentTimeMillis() + 60_000L;
            boolean ok = false;
            while (System.currentTimeMillis() < deadline) {
                if (!proc.isAlive()) {
                    throw new IllegalStateException("VercelLauncher exited early (" + proc.exitValue() + "):\n" + Files.readString(logFile));
                }
                try {
                    HttpResponse<String> r = client.send(
                            HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/qbank/api/v1/auth/info"))
                                    .timeout(Duration.ofSeconds(2)).GET().build(),
                            HttpResponse.BodyHandlers.ofString());
                    if (r.statusCode() == 200) {
                        if (!r.body().contains("\"setupRequired\":true")) {
                            throw new AssertionError("Unexpected auth/info payload: " + r.body());
                        }
                        HttpResponse<String> ui = client.send(
                                HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/qbank/index.html"))
                                        .timeout(Duration.ofSeconds(2)).GET().build(),
                                HttpResponse.BodyHandlers.ofString());
                        if (ui.statusCode() != 200) {
                            throw new AssertionError("UI returned HTTP " + ui.statusCode());
                        }
                        ok = true;
                        break;
                    }
                } catch (IOException ignored) {
                    // booting
                }
                Thread.sleep(400);
            }
            if (!ok) {
                throw new AssertionError("Timed out waiting for VercelLauncher:\n" + Files.readString(logFile));
            }
        } finally {
            proc.descendants().forEach(ProcessHandle::destroyForcibly);
            proc.destroyForcibly();
            proc.waitFor();
            deleteRecursive(classesDir);
        }
    }

    private static String randomB6432() {
        byte[] b = new byte[32];
        new SecureRandom().nextBytes(b);
        return Base64.getEncoder().encodeToString(b);
    }

    private static int freePort() throws IOException {
        try (ServerSocket s = new ServerSocket(0)) {
            return s.getLocalPort();
        }
    }

    private static void assertEq(String expected, String actual) {
        if (!expected.equals(actual)) {
            throw new AssertionError("Expected [" + expected + "] but got [" + actual + "]");
        }
    }

    private static void deleteRecursive(Path root) {
        try (var walk = Files.walk(root)) {
            walk.sorted((a, b) -> b.compareTo(a)).forEach(p -> {
                try { Files.deleteIfExists(p); } catch (IOException ignored) {}
            });
        } catch (IOException ignored) {}
    }
}
