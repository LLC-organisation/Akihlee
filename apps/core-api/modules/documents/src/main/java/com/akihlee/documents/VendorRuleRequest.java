package com.akihlee.documents;

/** Body for creating a vendor rule from the "Always categorize X as Y?" prompt. */
public record VendorRuleRequest(
        String vendorPattern,
        String type, // INCOME | EXPENSE
        String category
) {
}
