import { escapeHtml } from "@agents-in-the-cloud/shared";

/** Two 0–100 values on one clockwise perimeter. */
export interface Comparison { referencePercent: number; valuePercent: number }

export interface ComparisonRingOptions extends Comparison {
  /** Up to three characters inside the ring, such as a limit's "5h" or "7d". */
  caption: string;
  /** Accessible name; include both values and their meaning. */
  label: string;
}

/** Start at the top center and trace clockwise along the square's edges.
 * Normalized path length makes percentages measure the whole perimeter. */
function clockwisePerimeter(percent: number, className: string): string {
  return `<path class="${className}" d="M14 1 H27 V27 H1 V1 H14" pathLength="100" stroke-dasharray="${percent} 100"/>`;
}

/** The shared perimeter drawing. Overlap is neutral; reference beyond value is green; value beyond reference is red. */
export function comparisonRingSvgHtml(comparison: Comparison, className: string): string {
  if ([comparison.referencePercent, comparison.valuePercent].some((value) => !Number.isFinite(value) || value < 0 || value > 100)) throw new RangeError("Comparison percentages must be between 0 and 100");
  return `<svg class="${escapeHtml(className)}" viewBox="0 0 28 28" preserveAspectRatio="none" aria-hidden="true">${clockwisePerimeter(100, "comparison-ring__track")}${clockwisePerimeter(comparison.referencePercent, "comparison-ring__reference")}${clockwisePerimeter(comparison.valuePercent, "comparison-ring__value")}${clockwisePerimeter(Math.min(comparison.referencePercent, comparison.valuePercent), "comparison-ring__shared")}</svg>`;
}

/** A compact, non-interactive gauge with a short caption inside. */
export function comparisonRingHtml(options: ComparisonRingOptions): string {
  if (options.caption.length > 3) throw new RangeError("Comparison ring captions fit at most three characters");
  return `<span class="comparison-ring" role="img" aria-label="${escapeHtml(options.label)}" title="${escapeHtml(options.label)}">${comparisonRingSvgHtml(options, "comparison-ring__perimeter")}<span class="comparison-ring__caption" aria-hidden="true">${escapeHtml(options.caption)}</span></span>`;
}
