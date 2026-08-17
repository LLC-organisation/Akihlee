package com.akihlee.finance.analytics;

import java.math.BigDecimal;

/** One slice of a spending-by-merchant breakdown — line items only, no per-row merchant on bank transactions. */
public record MerchantAmount(String merchant, BigDecimal total) {
}
