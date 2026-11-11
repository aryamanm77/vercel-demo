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
        testLiveContainerEnvBoot();
        System.out.println("ALL_VERCEL_LAUNCHER_CHECKS_PASSED");
    }

    private static void testPostgresUriConversion() {
        var target = VercelLauncher.convertPostgresUriToJdbc(
                "postgres://neondb_owner:p%40ss%3Aword%2F1@ep-cool-forest-1234.us-east-1.aws.neon.tech:5432/neondb?pgbouncer=true&sslmode=require");
        assertEq("jdbc:postgresql://ep-cool-forest-1234.us-east-1.aws.neon.tech:5432/neondb?sslmode=require", target.jdbcUrl());
        assertEq("neondb_owner", target.username());
        assertEq("p@ss:word/1", target.password());

        var noQuery = VercelLauncher.convertPostgresUriToJdbc(
                "postgresql://user1:secret@db.example.internal/qbank");
        assertEq("jdbc:postgresql://db.example.internal/qbank?sslmode=require", noQuery.jdbcUrl());
        assertEq("user1", noQuery.username());
        assertEq("secret", noQuery.password());
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
