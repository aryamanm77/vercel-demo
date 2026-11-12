package com.yourorg.qbank.ext;

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
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Spring configuration loaded via Spring Boot PropertiesLauncher (-Dloader.path)
 * to allow student sign-in using Exam Session + Roll Number without a one-time access code,
 * while preserving all session window, roster membership, single-workstation, JWT, and audit checks.
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
                String effectiveCode = (accessCode == null || accessCode.isBlank()) ? "NO_CODE" : accessCode;
                return super.authenticateStudent(sessionId, rollNumber, effectiveCode);
            }
        };
    }
}
