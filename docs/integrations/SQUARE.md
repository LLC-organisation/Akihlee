# Square Integration

Square is a primary data source for SME financial data, providing payment processing, point-of-sale, and invoicing.

## Overview

The Square integration automatically syncs:
- **Payments**: Credit card, debit card, and cash transactions
- **Refunds**: Customer refunds and adjustments
- **Fees**: Square processing fees
- **Invoices**: Invoice payments (future)

## Architecture

```
Square API
    ↓ (REST API via Square SDK)
SquareApiClient (SquareApiClientImpl)
    ↓
SquareSyncService
    ↓
SquareTransactionRepository
    ↓
PostgreSQL (square_transactions table)
    ↓
Ledger Posting (future - reconciliation)
```

## Key Features

### 1. Idempotent Import
- Uses Square's transaction ID as `external_id`
- Duplicate imports are automatically skipped
- Safe to re-run sync for the same date range

### 2. Tenant Isolation
- All transactions are scoped to `tenant_id`
- Each business only sees their own Square data
- Tested in `SquareSyncServiceTest.shouldEnforceTenantIsolation()`

### 3. Amount Conversion
- Square stores amounts in smallest currency unit (cents for USD)
- Automatically converted to decimal: `2500 cents → $25.00`
- Uses `BigDecimal` for financial precision

### 4. Reconciliation Status
- Tracks which transactions have been posted to ledger
- `reconciled` flag prevents duplicate ledger entries
- Query unreconciled via `getUnreconciledTransactions()`

## Setup Instructions

### 1. Get Square Access Token

1. Sign up at [Square Developer Portal](https://developer.squareup.com/)
2. Create a new application
3. Copy your **Access Token** from the Credentials page
4. Use **Sandbox** token for testing, **Production** for live data

### 2. Configure Environment

Add to `.env`:

```bash
# Square Integration
SQUARE_ACCESS_TOKEN=your_sandbox_or_production_token_here
SQUARE_ENVIRONMENT=sandbox  # or 'production'
```

⚠️ **Never commit real tokens to version control!**

### 3. Test Connection

```java
@Autowired
private SquareApiClient squareApiClient;

boolean isConnected = squareApiClient.testConnection();
if (isConnected) {
    System.out.println("Square connected successfully!");
}
```

## Usage

### Sync Transactions

```java
@Autowired
private SquareSyncService squareSyncService;

// Sync last 7 days
Instant startDate = Instant.now().minus(7, ChronoUnit.DAYS);
Instant endDate = Instant.now();

int imported = squareSyncService.syncTransactions(startDate, endDate);
System.out.println("Imported " + imported + " new transactions");
```

### Get Unreconciled Transactions

```java
List<SquareTransaction> unreconciled = squareSyncService.getUnreconciledTransactions();

for (SquareTransaction tx : unreconciled) {
    // Post to ledger
    ledgerService.createJournalEntry(tx);
    
    // Mark as reconciled
    tx.markAsReconciled();
    transactionRepository.save(tx);
}
```

### Query Transactions

```java
@Autowired
private SquareTransactionRepository transactionRepository;

// Get all transactions for current tenant
List<SquareTransaction> allTxs = transactionRepository.findByTenantId(tenantId);

// Get transactions in date range
List<SquareTransaction> ranged = transactionRepository
    .findByTenantIdAndTransactionDateBetween(tenantId, start, end);

// Check if transaction exists (idempotency)
boolean exists = transactionRepository.existsByExternalId("sq_payment_123");
```

## Data Model

### SquareTransaction

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Internal primary key |
| `tenantId` | UUID | Business owner (tenant isolation) |
| `externalId` | String | Square's transaction ID (unique) |
| `amount` | BigDecimal | Transaction amount (decimal, not cents) |
| `currency` | String | ISO currency code (USD, KES, etc.) |
| `type` | Enum | PAYMENT, REFUND, ADJUSTMENT, FEE |
| `status` | Enum | COMPLETED, PENDING, FAILED, CANCELED |
| `locationId` | String | Square location (if multi-location business) |
| `description` | String | Customer note or description |
| `transactionDate` | Instant | When transaction occurred in Square |
| `reconciled` | Boolean | Whether posted to ledger |

## Testing

### Run Integration Tests

```bash
cd apps/core-api

# Run Square sync tests
./gradlew :modules:finance:test --tests SquareSyncServiceTest

# All tests should pass (requires Docker for Testcontainers)
```

### Test Cases Covered

1. ✅ Import Square transactions correctly
2. ✅ Skip duplicate transactions (idempotency)
3. ✅ Enforce tenant isolation
4. ✅ Convert amounts from cents to decimal
5. ✅ Query unreconciled transactions

## Sync Schedule (Recommended)

For production:

1. **Initial Sync**: Import last 90 days on first connection
2. **Daily Sync**: Run nightly at 1 AM to catch previous day's transactions
3. **Real-time**: Use Square Webhooks for instant updates (future enhancement)

### Cron Job Example

```bash
# Daily sync via cron
0 1 * * * curl -X POST http://localhost:8080/api/v1/integrations/square/sync
```

## Limitations & Future Enhancements

### Current Limitations
- Only syncs **payments** (not orders, inventory, or customers yet)
- Manual sync (no webhook support yet)
- Single location per tenant (multi-location planned)

### Planned Features
- [ ] Square Webhooks for real-time updates
- [ ] Order import (itemized line items)
- [ ] Customer import and matching
- [ ] Multi-location support
- [ ] Inventory sync
- [ ] Square Invoices integration

## Troubleshooting

### "Square API error: Unauthorized"
- Check `SQUARE_ACCESS_TOKEN` is correct
- Verify token hasn't expired
- Ensure using correct environment (sandbox vs production)

### "No transactions imported"
- Check date range - Square may have no data for that period
- Verify location ID (if filtering by location)
- Check Square Dashboard to confirm transactions exist

### "Duplicate key violation on external_id"
- This shouldn't happen due to idempotency check
- If it does, check database constraints and sync logic

## Security Considerations

1. **Access Token Storage**
   - Store in environment variables, never in code
   - Use secrets manager in production (AWS Secrets Manager, HashiCorp Vault)
   - Rotate tokens periodically

2. **Data Encryption**
   - Square data contains PII (customer payment info)
   - Encrypted at rest in PostgreSQL
   - TLS for API calls to Square

3. **Tenant Isolation**
   - Every query enforces `tenant_id` filter
   - Integration tests verify cross-tenant access is blocked

## References

- [Square API Documentation](https://developer.squareup.com/docs/api)
- [Square SDK for Java](https://github.com/square/square-java-sdk)
- [Square Webhooks Guide](https://developer.squareup.com/docs/webhooks)
- [Akihlee Architecture Document](../../Akihlee_Solutions_Architecture_Document.pdf)

---

**Last Updated**: July 2026  
**Status**: ✅ MVP Complete - Ready for Testing  
**Next**: Add webhook support for real-time sync
