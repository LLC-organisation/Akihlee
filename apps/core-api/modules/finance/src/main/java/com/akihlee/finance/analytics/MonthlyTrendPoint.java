package com.akihlee.finance.analytics;

import java.math.BigDecimal;

/** One month of the combined income-vs-expense trend, keyed "yyyy-MM". */
public record MonthlyTrendPoint(String month, BigDecimal income, BigDecimal expense) {
}
