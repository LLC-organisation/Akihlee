package com.akihlee.finance.analytics;

/** Time-bucket size for a trend query. WEEK buckets start on Monday; QUARTER buckets are calendar quarters. */
public enum Granularity {
    DAY,
    WEEK,
    MONTH,
    QUARTER
}
