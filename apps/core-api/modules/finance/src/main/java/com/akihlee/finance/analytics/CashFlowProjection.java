package com.akihlee.finance.analytics;

import java.math.BigDecimal;

/**
 * One day of a 30-day cash-flow projection — projectedNet is the CUMULATIVE
 * net change from today through this date, not a bank balance (this system
 * has no reliable running balance across statements, so projecting an
 * absolute figure would overclaim precision). A linear extrapolation of the
 * tenant's own trailing daily average, nothing more sophisticated.
 */
public record CashFlowProjection(String date, BigDecimal projectedNet) {
}
