package com.akihlee.documents;

import com.akihlee.identity.AuditAction;
import com.akihlee.identity.AuditLogService;
import com.akihlee.identity.TenantContext;
import com.akihlee.identity.User;
import com.akihlee.identity.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * CRUD for individual bank statement transaction lines. Line items on
 * receipts/invoices stay embedded JSON on ExtractedData (edited wholesale
 * via ExtractedDataController), but a statement's transactions are numerous
 * enough and independently editable enough to warrant their own rows.
 */
@RestController
public class BankTransactionController {

    private final BankTransactionRepository bankTransactionRepository;
    private final ExtractedDataRepository extractedDataRepository;
    private final AuditLogService auditLogService;
    private final UserRepository userRepository;

    public BankTransactionController(
            BankTransactionRepository bankTransactionRepository,
            ExtractedDataRepository extractedDataRepository,
            AuditLogService auditLogService,
            UserRepository userRepository) {
        this.bankTransactionRepository = bankTransactionRepository;
        this.extractedDataRepository = extractedDataRepository;
        this.auditLogService = auditLogService;
        this.userRepository = userRepository;
    }

    @GetMapping("/api/v1/extracted-data/{extractedDataId}/bank-transactions")
    public List<BankTransaction> list(@PathVariable UUID extractedDataId) {
        requireOwnedExtractedData(extractedDataId);
        return bankTransactionRepository.findByExtractedDataIdOrderByTransactionDateAsc(extractedDataId);
    }

    @PostMapping("/api/v1/extracted-data/{extractedDataId}/bank-transactions")
    @ResponseStatus(HttpStatus.CREATED)
    public BankTransaction create(@PathVariable UUID extractedDataId, @RequestBody BankTransactionRequest request) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        requireOwnedExtractedData(extractedDataId);

        // 1.0, not request.categoryConfidence() — a manually-added row was
        // never auto-categorized, so it's inherently as trusted as a human
        // review gets.
        BankTransaction txn = new BankTransaction(
                extractedDataId, tenantId, LocalDate.parse(request.transactionDate()),
                request.description(), request.payeeOrPayer(),
                request.amount() != null ? request.amount() : BigDecimal.ZERO,
                parseType(request.type()), request.category(), 1.0);
        bankTransactionRepository.save(txn);

        auditLogService.log(tenantId, currentUserId(), currentUserEmail(),
                AuditAction.BANK_TRANSACTION_EDITED, "BANK_TRANSACTION", txn.getId().toString(), "created");

        return txn;
    }

    @PutMapping("/api/v1/bank-transactions/{id}")
    public BankTransaction update(@PathVariable UUID id, @RequestBody BankTransactionRequest request) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        BankTransaction txn = bankTransactionRepository.findById(id)
                .filter(t -> t.getTenantId().equals(tenantId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Bank transaction not found"));

        txn.setTransactionDate(LocalDate.parse(request.transactionDate()));
        txn.setDescription(request.description());
        txn.setPayeeOrPayer(request.payeeOrPayer());
        txn.setAmount(request.amount());
        txn.setType(parseType(request.type()));
        txn.setCategory(request.category());
        // Any edit to this row is a human review action on the whole row —
        // same reasoning as create() above, not just for category edits.
        txn.setCategoryConfidence(1.0);
        bankTransactionRepository.save(txn);

        auditLogService.log(tenantId, currentUserId(), currentUserEmail(),
                AuditAction.BANK_TRANSACTION_EDITED, "BANK_TRANSACTION", id.toString(), "updated");

        return txn;
    }

    @DeleteMapping("/api/v1/bank-transactions/{id}")
    public void delete(@PathVariable UUID id) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        BankTransaction txn = bankTransactionRepository.findById(id)
                .filter(t -> t.getTenantId().equals(tenantId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Bank transaction not found"));

        bankTransactionRepository.delete(txn);

        auditLogService.log(tenantId, currentUserId(), currentUserEmail(),
                AuditAction.BANK_TRANSACTION_EDITED, "BANK_TRANSACTION", id.toString(), "deleted");
    }

    private void requireOwnedExtractedData(UUID extractedDataId) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        extractedDataRepository.findById(extractedDataId)
                .filter(d -> d.getTenantId().equals(tenantId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Extracted data not found"));
    }

    private BankTransaction.Type parseType(String value) {
        try {
            return BankTransaction.Type.valueOf(value);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid transaction type: " + value);
        }
    }

    private UUID currentUserId() {
        var authentication = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || authentication.getName() == null) {
            return null;
        }
        try {
            return UUID.fromString(authentication.getName());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private String currentUserEmail() {
        UUID userId = currentUserId();
        return userId != null ? userRepository.findById(userId).map(User::getEmail).orElse(null) : null;
    }
}
