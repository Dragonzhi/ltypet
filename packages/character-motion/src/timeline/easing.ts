/**
 * Easing function implementations.
 * All pure math — no external dependencies.
 */

import type { EasingValue } from "../types";

/**
 * Clamp input to [0, 1] and return the eased value.
 */
export function applyEasing(t: number, easing: EasingValue): number {
  // Guard against non-finite input
  if (!Number.isFinite(t)) {
    return 0;
  }

  const clamped = Math.max(0, Math.min(1, t));

  if (typeof easing === "string") {
    return applyPreset(clamped, easing);
  }

  // Cubic bezier
  const [x1, y1, x2, y2] = easing.cubicBezier;
  return evaluateCubicBezier(clamped, x1, y1, x2, y2);
}

// ─── Presets ────────────────────────────────────────────────────

function applyPreset(t: number, preset: string): number {
  switch (preset) {
    case "linear":
      return t;
    case "easeIn":
      return t * t;
    case "easeOut":
      return 1 - (1 - t) * (1 - t);
    case "easeInOut":
      return smoothstep(t);
    default:
      return t;
  }
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

// ─── Cubic Bezier ───────────────────────────────────────────────

/**
 * Evaluates a cubic Bézier curve at parameter t (0..1 in x-axis).
 * Uses Newton-Raphson iteration with bisection fallback for robust
 * root-finding.
 */
function evaluateCubicBezier(
  t: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  // Find the parametric value 'u' such that X(u) == t
  const u = findTForX(t, x1, x2);

  // Evaluate Y at that u
  return cubicBezierY(u, y1, y2);
}

/**
 * Cubic Bézier X coordinate: X(u) = 3(1-u)²u·x1 + 3(1-u)u²·x2 + u³
 * Since P0=0, P3=1 for both X and Y.
 */
function cubicBezierX(u: number, x1: number, x2: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  const omu = 1 - u;
  return 3 * omu * omu * u * x1 + 3 * omu * u2 * x2 + u3;
}

function cubicBezierY(u: number, y1: number, y2: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  const omu = 1 - u;
  return 3 * omu * omu * u * y1 + 3 * omu * u2 * y2 + u3;
}

/**
 * Derivative of X with respect to u: X'(u) = 3(1-u)²·x1 + 6(1-u)u·(x2-x1) + 3u²·(1-x2)
 */
function dCubicBezierX(u: number, x1: number, x2: number): number {
  const omu = 1 - u;
  return (
    3 * omu * omu * x1 +
    6 * omu * u * (x2 - x1) +
    3 * u * u * (1 - x2)
  );
}

/**
 * Newton-Raphson with bisection fallback to find u for a given x.
 */
function findTForX(x: number, x1: number, x2: number): number {
  // Initial guess: linear interpolation
  let u = x;
  const maxIterations = 10;

  for (let i = 0; i < maxIterations; i++) {
    const xVal = cubicBezierX(u, x1, x2) - x;
    const xDeriv = dCubicBezierX(u, x1, x2);

    if (Math.abs(xVal) < 1e-7) {
      return u;
    }

    if (Math.abs(xDeriv) < 1e-12) {
      break; // Derivative too small, fall back to bisection
    }

    u = u - xVal / xDeriv;
    u = Math.max(0, Math.min(1, u));
  }

  // Bisection fallback
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    u = (lo + hi) / 2;
    const xVal = cubicBezierX(u, x1, x2);
    if (Math.abs(xVal - x) < 1e-7) {
      return u;
    }
    if (xVal < x) {
      lo = u;
    } else {
      hi = u;
    }
  }

  return u;
}
