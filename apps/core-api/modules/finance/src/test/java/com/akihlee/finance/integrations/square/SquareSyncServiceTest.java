package com.akihlee.finance.integrations.square;

import com.akihlee.documents.DocumentService;
import com.akihlee.documents.StorageService;
import com.akihlee.identity.Tenant;
import com.akihlee.identity.TenantContext;
import com.akihlee.identity.TenantRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.squareup.square.models.Money;
import com.squareup.square.models.Payment;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import com.google.cloud.pubsub.v1.PublisherInterface;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;

/**
 * TDD Test for Square transaction sync.
 *
 * Tests verify:
 * 1. Square transactions are imported correctly
 * 2. Idempotency - duplicate transactions are skipped
 * 3. Tenant isolation - transactions are scoped to tenant
 * 4. Amount conversion from Square's cent-based format
 */
@Testcontainers
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({SquareSyncService.class, MockSquareApiClient.class, DocumentService.class, ObjectMapper.class})
class SquareSyncServiceTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private SquareSyncService squareSyncService;

    @Autowired
    private SquareTransactionRepository transactionRepository;

    @Autowired
    private TenantRepository tenantRepository;

    @Autowired
    private MockSquareApiClient mockSquareApiClient;

    // Square-imported documents never touch storage or the OCR queue (see
    // DocumentService.createFromExternalData), so these only need to exist
    // as beans to satisfy DocumentService's constructor — never stubbed.
    @MockBean
    private StorageService storageService;

    @MockBean
    private PublisherInterface documentsReceivedPublisher;

    // Only exercised by SquareSyncService when a tenant has connected via
    // OAuth and their token is near expiry — none of these tests connect a
    // tenant that way, so this only needs to exist to satisfy the
    // constructor. Real construction would also need JwtService, which
    // this narrow @DataJpaTest slice doesn't scan for.
    @MockBean
    private SquareOAuthService squareOAuthService;

    private Tenant tenant;

    @BeforeEach
    void setUp() {
        tenant = tenantRepository.save(new Tenant("Café Mocha"));
        TenantContext.setCurrentTenantId(tenant.getId());
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    @Test
    void shouldImportSquareTransactions() {
        // Given: Mock Square API returns 2 payments
        Payment payment1 = createMockPayment("sq_payment_1", 2500L, "USD", "COMPLETED");
        Payment payment2 = createMockPayment("sq_payment_2", 1750L, "USD", "COMPLETED");
        mockSquareApiClient.setMockPayments(List.of(payment1, payment2));

        Instant startDate = Instant.now().minus(7, ChronoUnit.DAYS);
        Instant endDate = Instant.now();

        // When: Syncing transactions
        int imported = squareSyncService.syncTransactions(startDate, endDate);

        // Then: Both transactions should be imported
        assertThat(imported).isEqualTo(2);

        List<SquareTransaction> transactions = transactionRepository.findByTenantId(tenant.getId());
        assertThat(transactions).hasSize(2);

        // Verify first transaction
        SquareTransaction tx1 = transactions.stream()
            .filter(tx -> tx.getExternalId().equals("sq_payment_1"))
            .findFirst()
            .orElseThrow();

        assertThat(tx1.getAmount()).isEqualByComparingTo(new BigDecimal("25.00"));
        assertThat(tx1.getCurrency()).isEqualTo("USD");
        assertThat(tx1.getType()).isEqualTo(SquareTransaction.TransactionType.PAYMENT);
        assertThat(tx1.getStatus()).isEqualTo(SquareTransaction.TransactionStatus.COMPLETED);
        assertThat(tx1.getTenantId()).isEqualTo(tenant.getId());
        assertThat(tx1.isReconciled()).isFalse();
    }

    @Test
    void shouldSkipDuplicateTransactions_idempotency() {
        // Given: A transaction already exists
        Payment payment = createMockPayment("sq_payment_existing", 5000L, "USD", "COMPLETED");
        mockSquareApiClient.setMockPayments(List.of(payment));

        Instant startDate = Instant.now().minus(1, ChronoUnit.DAYS);
        Instant endDate = Instant.now();

        // When: First sync
        int firstSync = squareSyncService.syncTransactions(startDate, endDate);
        assertThat(firstSync).isEqualTo(1);

        // When: Second sync with same transaction
        int secondSync = squareSyncService.syncTransactions(startDate, endDate);

        // Then: Duplicate should be skipped (idempotency)
        assertThat(secondSync).isEqualTo(0);

        List<SquareTransaction> transactions = transactionRepository.findByTenantId(tenant.getId());
        assertThat(transactions).hasSize(1); // Still only 1 transaction
    }

    @Test
    void shouldEnforceTenantIsolation() {
        // Given: Two tenants
        Tenant tenant2 = tenantRepository.save(new Tenant("Bistro Bella"));

        // Tenant 1 syncs a transaction
        TenantContext.setCurrentTenantId(tenant.getId());
        Payment payment1 = createMockPayment("sq_payment_tenant1", 3000L, "USD", "COMPLETED");
        mockSquareApiClient.setMockPayments(List.of(payment1));
        squareSyncService.syncTransactions(Instant.now().minus(1, ChronoUnit.DAYS), Instant.now());

        // Tenant 2 syncs a different transaction
        TenantContext.setCurrentTenantId(tenant2.getId());
        Payment payment2 = createMockPayment("sq_payment_tenant2", 4000L, "USD", "COMPLETED");
        mockSquareApiClient.setMockPayments(List.of(payment2));
        squareSyncService.syncTransactions(Instant.now().minus(1, ChronoUnit.DAYS), Instant.now());

        // Then: Each tenant should only see their own transactions
        TenantContext.setCurrentTenantId(tenant.getId());
        List<SquareTransaction> tenant1Txs = transactionRepository.findByTenantId(tenant.getId());
        assertThat(tenant1Txs).hasSize(1);
        assertThat(tenant1Txs.get(0).getExternalId()).isEqualTo("sq_payment_tenant1");

        TenantContext.setCurrentTenantId(tenant2.getId());
        List<SquareTransaction> tenant2Txs = transactionRepository.findByTenantId(tenant2.getId());
        assertThat(tenant2Txs).hasSize(1);
        assertThat(tenant2Txs.get(0).getExternalId()).isEqualTo("sq_payment_tenant2");
    }

    @Test
    void shouldGetUnreconciledTransactions() {
        // Given: Import 2 transactions
        Payment payment1 = createMockPayment("sq_payment_1", 2500L, "USD", "COMPLETED");
        Payment payment2 = createMockPayment("sq_payment_2", 1750L, "USD", "COMPLETED");
        mockSquareApiClient.setMockPayments(List.of(payment1, payment2));
        squareSyncService.syncTransactions(Instant.now().minus(1, ChronoUnit.DAYS), Instant.now());

        // When: Mark one as reconciled
        SquareTransaction tx1 = transactionRepository.findByExternalId("sq_payment_1").orElseThrow();
        tx1.markAsReconciled();
        transactionRepository.save(tx1);

        // Then: Only unreconciled transactions should be returned
        List<SquareTransaction> unreconciled = squareSyncService.getUnreconciledTransactions();
        assertThat(unreconciled).hasSize(1);
        assertThat(unreconciled.get(0).getExternalId()).isEqualTo("sq_payment_2");
    }

    // Helper method to create mock Square Payment
    private Payment createMockPayment(String id, Long amountCents, String currency, String status) {
        return new Payment.Builder()
        .id(id)
        .amountMoney(new Money(amountCents, currency))
        .status(status)
        .createdAt(Instant.now().toString())
        .build();
    }
}
