package com.akihlee.finance.analytics;

import java.math.BigDecimal;

/** One slice of a spending-by-category breakdown. */
public record CategoryAmount(String category, BigDecimal total) {
}
