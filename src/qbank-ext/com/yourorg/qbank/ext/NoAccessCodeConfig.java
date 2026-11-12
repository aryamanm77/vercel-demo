package com.yourorg.qbank.ext;

import com.yourorg.qbank.core.exception.BadRequestException;
import com.yourorg.qbank.core.exception.ForbiddenException;
import com.yourorg.qbank.core.exception.NotFoundException;
import com.yourorg.qbank.core.generator.CheckerboardSeatVersionPolicy;
import com.yourorg.qbank.core.generator.PaperSetVersionGenerator;
import com.yourorg.qbank.core.model.ExamSession;
import com.yourorg.qbank.core.model.ExamStudent;
import com.yourorg.qbank.core.model.SessionStatus;
import com.yourorg.qbank.core.model.StudentLoginState;
import com.yourorg.qbank.core.port.AuditPort;
import com.yourorg.qbank.core.port.AuthPort;
import com.yourorg.qbank.core.port.ClockPort;
import com.yourorg.qbank.core.port.CryptoPort;
import com.yourorg.qbank.core.port.ExamRepository;
import com.yourorg.qbank.core.port.ExamStudentRepository;
import com.yourorg.qbank.core.port.FrozenPaperProvider;
import com.yourorg.qbank.core.port.JsonCodecPort;
import com.yourorg.qbank.core.port.PasswordHasherPort;
import com.yourorg.qbank.core.port.RandomPort;
import com.yourorg.qbank.core.port.ResponseSink;
import com.yourorg.qbank.core.port.StudentResponseRepository;
import com.yourorg.qbank.core.port.TransactionPort;
import com.yourorg.qbank.core.service.CoreStudentExamService;
import java.time.Instant;
import java.util.Locale;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Spring configuration loaded via Spring Boot PropertiesLauncher (-Dloader.path)
 * allowing any student to sign in with Exam Session + USN / Roll Number without
 * requiring a one-time access code or prior manual COE roster entry, while preserving
 * open-session checks, time-window checks, single-workstation locking, JWTs, and audit logs.
 */
@Configuration(proxyBeanMethods = false)
public class NoAccessCodeConfig {

    @Bean
    public CoreStudentExamService qbankCoreStudentExamService(
            ExamRepository examRepository,
            ExamStudentRepository studentRepository,
            StudentResponseRepository responseRepository,
            FrozenPaperProvider frozenPaperProvider,
            ResponseSink responseSink,
            PasswordHasherPort passwordHasher,
            CryptoPort cryptoPort,
            RandomPort randomPort,
            ClockPort clockPort,
            TransactionPort transactionPort,
            AuditPort auditPort,
            JsonCodecPort jsonCodec,
            AuthPort authPort) {
        PasswordHasherPort studentNoCodeHasher = new PasswordHasherPort() {
            @Override
            public String hash(String raw) {
                return passwordHasher.hash(raw);
            }

            @Override
            public boolean matches(String raw, String encodedHash) {
                return true;
            }
        };
        CheckerboardSeatVersionPolicy versionPolicy = new CheckerboardSeatVersionPolicy();
        return new CoreStudentExamService(
                examRepository,
                studentRepository,
                responseRepository,
                frozenPaperProvider,
                responseSink,
                studentNoCodeHasher,
                cryptoPort,
                randomPort,
                clockPort,
                transactionPort,
                auditPort,
                jsonCodec,
                authPort) {
            @Override
            public StudentLoginResult authenticateStudent(long sessionId, String rollNumber, String accessCode) {
                if (rollNumber == null || rollNumber.isBlank()) {
                    throw new BadRequestException("USN / Roll number is required");
                }
                String normalizedRoll = rollNumber.trim().toUpperCase(Locale.ROOT);
                if (studentRepository.findBySessionAndRoll(sessionId, normalizedRoll).isEmpty()) {
                    ExamSession session = examRepository.findSessionById(sessionId)
                            .orElseThrow(() -> new NotFoundException("Exam session not found: " + sessionId));
                    if (session.status() != SessionStatus.FROZEN && session.status() != SessionStatus.LIVE) {
                        throw new ForbiddenException("Exam session is not open (status: " + session.status() + ")");
                    }
                    Instant now = clockPort.now();
                    if (now.isBefore(session.scheduledStartAt())) {
                        throw new ForbiddenException("Exam starts at " + session.scheduledStartAt());
                    }
                    if (now.isAfter(session.scheduledEndAt())) {
                        throw new ForbiddenException("Exam ended at " + session.scheduledEndAt());
                    }
                    try {
                        transactionPort.runInTransaction(() -> {
                            if (studentRepository.findBySessionAndRoll(sessionId, normalizedRoll).isPresent()) {
                                return;
                            }
                            String assignedVersion = versionPolicy.assignVersion(
                                    normalizedRoll, null, null, PaperSetVersionGenerator.VERSION_LABELS);
                            studentRepository.save(new ExamStudent(
                                    null,
                                    Long.valueOf(sessionId),
                                    normalizedRoll,
                                    normalizedRoll,
                                    "MAIN",
                                    null,
                                    null,
                                    assignedVersion,
                                    passwordHasher.hash("NO_CODE"),
                                    StudentLoginState.NOT_STARTED,
                                    null,
                                    1.0d,
                                    false,
                                    0,
                                    0,
                                    0,
                                    null,
                                    null,
                                    0));
                            auditPort.append(
                                    "STUDENT_AUTO_REGISTERED",
                                    normalizedRoll,
                                    "STUDENT",
                                    "SESSION",
                                    String.valueOf(sessionId),
                                    "{\"roomCode\":\"MAIN\",\"assignedVersion\":\"" + assignedVersion + "\"}");
                        });
                    } catch (RuntimeException ex) {
                        if (studentRepository.findBySessionAndRoll(sessionId, normalizedRoll).isEmpty()) {
                            throw ex;
                        }
                    }
                }
                String effectiveCode = (accessCode == null || accessCode.isBlank()) ? "NO_CODE" : accessCode;
                return super.authenticateStudent(sessionId, normalizedRoll, effectiveCode);
            }
        };
    }
}
