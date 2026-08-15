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
  'Uncategorized',
] as const;

export type SpendingCategory = (typeof SPENDING_CATEGORIES)[number];
