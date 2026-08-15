/**
 * Statistical utilities for the dashboard's volatility widget. Sample
 * (N-1) standard deviation is used throughout since the values fed in are
 * always a sample of periods (weeks/months/quarters) drawn from ongoing
 * activity, never the entire population of a business's lifetime.
 */

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Sample standard deviation. Returns 0 when fewer than 2 values (undefined otherwise). */
export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const sumSquaredDiffs = values.reduce((sum, v) => sum + (v - avg) ** 2, 0);
  return Math.sqrt(sumSquaredDiffs / (values.length - 1));
}

/**
 * Coefficient of variation, as a percentage: sigma / |mu| * 100. Uses the
 * absolute mean so a metric that averages negative (e.g. net cash flow in
 * a burn period) still produces a meaningful, non-negative ratio.
 */
export function coefficientOfVariation(values: number[]): number {
  const avg = mean(values);
  if (avg === 0) return 0;
  return (standardDeviation(values) / Math.abs(avg)) * 100;
}

export type StabilityRating = 'LOW' | 'MODERATE' | 'HIGH';

/** Low < 15% CV (predictable), Moderate 15-35%, High > 35% (large fluctuations). */
export function stabilityRating(cv: number): StabilityRating {
  if (cv < 15) return 'LOW';
  if (cv <= 35) return 'MODERATE';
  return 'HIGH';
}

export type VolatilityStats = {
  mean: number;
  standardDeviation: number;
  coefficientOfVariation: number;
  rating: StabilityRating;
  sampleSize: number;
};

export function volatilityStats(values: number[]): VolatilityStats {
  const cv = coefficientOfVariation(values);
  return {
    mean: mean(values),
    standardDeviation: standardDeviation(values),
    coefficientOfVariation: cv,
    rating: stabilityRating(cv),
    sampleSize: values.length,
  };
}
