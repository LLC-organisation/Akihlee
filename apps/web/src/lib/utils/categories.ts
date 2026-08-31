/**
 * Fixed SME spending taxonomy. Auto-categorization (vision extraction) and
 * manual overrides (category pills, document review edits) both draw from
 * this exact list — nothing outside it should ever be written as a category.
 */
export const SPENDING_CATEGORIES = [
  'Meals & Entertainment',
  'Office Supplies & Equipment',
  'Software & IT Services',
  'Utilities & Rent',
  'Travel & Transportation',
  'Inventory & Raw Materials',
  'Marketing & Advertising',
  'Professional Services',
  'Payroll & Personnel',
  'Uncategorized',
] as const;

export type SpendingCategory = (typeof SPENDING_CATEGORIES)[number];

/**
 * Fixed income taxonomy for bank transactions with type INCOME — deliberately
 * separate from SPENDING_CATEGORIES above, since none of that expense-shaped
 * list ever fits a deposit and everything was defaulting to "Uncategorized".
 * Never applied to line items (receipts/invoices are always spend) or to
 * TRANSFER-type bank transactions (an internal transfer isn't real income).
 */
export const INCOME_CATEGORIES = [
  'Sales Revenue',
  'Payment Processor Payout',
  'Delivery Platform Revenue',
  'Client Invoices & Services',
  'Loans & Financing',
  'Owner Contribution',
  'Interest Income',
  'Refunds & Reimbursements',
  'Other Income',
  'Uncategorized',
] as const;

export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];
