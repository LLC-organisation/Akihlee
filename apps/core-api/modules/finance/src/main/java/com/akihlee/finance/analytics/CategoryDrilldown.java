package com.akihlee.finance.analytics;

import com.akihlee.documents.BankTransaction;

import java.util.List;

/**
 * Every approved transaction currently filed under one category, for the
 * "click a category pill to reassign" flow. Bank transactions are returned
 * as the entity directly (same shape bankTransactionsApi.list already
 * returns) since they have a real id and can be PUT back unmodified except
 * for category; line items go through CategorizedLineItem since they don't.
 */
public record CategoryDrilldown(List<CategorizedLineItem> lineItems, List<BankTransaction> bankTransactions) {
}
