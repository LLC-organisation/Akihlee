package com.akihlee.finance.analytics;

import com.akihlee.documents.BankTransactionRepository;
import com.akihlee.documents.Document;
import com.akihlee.documents.DocumentRepository;
import com.akihlee.documents.ExtractedData;
import com.akihlee.documents.ExtractedDataRepository;
import com.akihlee.identity.Tenant;
import com.akihlee.identity.TenantContext;
import com.akihlee.identity.TenantRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({AnalyticsService.class, ObjectMapper.class})
class AnalyticsServiceTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private AnalyticsService analyticsService;

    @Autowired
    private DocumentRepository documentRepository;

    @Autowired
    private ExtractedDataRepository extractedDataRepository;

    @Autowired
    private TenantRepository tenantRepository;

    @Autowired
    private BankTransactionRepository bankTransactionRepository;

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
    void topMerchants_ranksApprovedSpendByVendorDescending() {
        approvedExtractedData("Acme Supplies", new BigDecimal("100.00"));
        approvedExtractedData("Acme Supplies", new BigDecimal("50.00"));
        approvedExtractedData("Best Bakery", new BigDecimal("30.00"));
        // Not APPROVED — must be excluded from the ranking.
        unapprovedExtractedData("Big Spender Vendor", new BigDecimal("9999.00"));

        var result = analyticsService.topMerchants(LocalDate.now().minusMonths(1), LocalDate.now(), 5);

        assertThat(result).extracting(MerchantAmount::merchant).containsExactly("Acme Supplies", "Best Bakery");
        assertThat(result.get(0).total()).isEqualByComparingTo("150.00");
        assertThat(result.get(1).total()).isEqualByComparingTo("30.00");
    }

    @Test
    void topMerchants_respectsLimit() {
        approvedExtractedData("Vendor A", new BigDecimal("10.00"));
        approvedExtractedData("Vendor B", new BigDecimal("9.00"));
        approvedExtractedData("Vendor C", new BigDecimal("8.00"));

        var result = analyticsService.topMerchants(LocalDate.now().minusMonths(1), LocalDate.now(), 2);

        assertThat(result).hasSize(2);
        assertThat(result).extracting(MerchantAmount::merchant).containsExactly("Vendor A", "Vendor B");
    }

    @Test
    void topMerchants_isTenantScoped() {
        approvedExtractedData("My Vendor", new BigDecimal("10.00"));

        Tenant otherTenant = tenantRepository.save(new Tenant("Other Business"));
        TenantContext.setCurrentTenantId(otherTenant.getId());

        var result = analyticsService.topMerchants(LocalDate.now().minusMonths(1), LocalDate.now(), 5);

        assertThat(result).isEmpty();
    }

    private void approvedExtractedData(String merchant, BigDecimal amount) {
        saveExtractedData(merchant, amount, Document.DocumentStatus.APPROVED);
    }

    private void unapprovedExtractedData(String merchant, BigDecimal amount) {
        saveExtractedData(merchant, amount, Document.DocumentStatus.EXTRACTED);
    }

    private void saveExtractedData(String merchant, BigDecimal amount, Document.DocumentStatus status) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        Document document = new Document(tenantId, "receipt.pdf", "storage/key", "application/pdf",
                1024L, "checksum-" + UUID.randomUUID(), Document.DocumentSource.UPLOAD);
        document.updateStatus(status);
        document = documentRepository.save(document);

        ExtractedData data = new ExtractedData(document.getId(), tenantId, "receipt.pdf");
        data.setMerchantName(merchant);
        data.setTotalAmount(amount);
        data.setTransactionDate(LocalDate.now());
        data.setCurrency("USD");
        extractedDataRepository.save(data);
    }
}
