/**
 * Each metric owns one categorical hue (tokens in app.css), used for its icon, its sparkline dot
 * and its line in the trend chart. Colour follows the metric, never its position on the page.
 */
import type { MetricKey } from './metrics';

export const METRIC_HUE: Record<MetricKey, string> = {
  training_readiness: 'var(--hue-orange)',
  sleep: 'var(--hue-violet)',
  hrv: 'var(--hue-aqua)',
  body_battery: 'var(--hue-green)',
  resting_heart_rate: 'var(--hue-red)',
  stress: 'var(--hue-magenta)',
  steps: 'var(--hue-blue)',
  spo2: 'var(--hue-blue)',
  respiration: 'var(--hue-aqua)',
  calories: 'var(--hue-yellow)'
};

export const hueOf = (key: string): string => METRIC_HUE[key as MetricKey] ?? 'var(--accent)';
