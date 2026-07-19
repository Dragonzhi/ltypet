/**
 * Combined schema validation entry points.
 * Chains structural validation → semantic validation.
 */

import type { CharacterRigV1, MotionLibraryV1, ValidationResult } from "../types.js";
import { validateRigStructure, validateMotionsStructure } from "./validateStructure.js";
import { validateRigSemantics, validateMotionSemantics } from "./validateSemantics.js";

/**
 * Validates an unknown input as a CharacterRigV1.
 * First runs JSON Schema validation, then semantic checks.
 *
 * @param input - Unknown input (typically parsed JSON)
 * @returns ValidationResult with the validated rig or errors
 */
export function validateRig(
  input: unknown,
): ValidationResult<CharacterRigV1> {
  // Structure check
  const structureResult = validateRigStructure(input);
  if (!structureResult.ok) {
    return structureResult;
  }

  // Semantic check
  const semanticIssues = validateRigSemantics(structureResult.value);
  const errors = semanticIssues.filter((i) => i.severity === "error");
  const warnings = semanticIssues.filter((i) => i.severity === "warn");

  if (errors.length > 0) {
    return { ok: false, issues: errors };
  }

  return {
    ok: true,
    value: structureResult.value,
    warnings: [
      ...structureResult.warnings,
      ...warnings,
    ],
  };
}

/**
 * Validates an unknown input as a MotionLibraryV1 against a character rig.
 * First runs JSON Schema validation, then semantic checks.
 *
 * @param input - Unknown input (typically parsed JSON)
 * @param rig - The validated character rig to check against
 * @returns ValidationResult with the validated motion library or errors
 */
export function validateMotionLibrary(
  input: unknown,
  rig: CharacterRigV1,
): ValidationResult<MotionLibraryV1> {
  // Structure check
  const structureResult = validateMotionsStructure(input);
  if (!structureResult.ok) {
    return structureResult;
  }

  // Semantic check
  const semanticIssues = validateMotionSemantics(structureResult.value, rig);
  const errors = semanticIssues.filter((i) => i.severity === "error");
  const warnings = semanticIssues.filter((i) => i.severity === "warn");

  if (errors.length > 0) {
    return { ok: false, issues: errors };
  }

  return {
    ok: true,
    value: structureResult.value,
    warnings: [
      ...structureResult.warnings,
      ...warnings,
    ],
  };
}

// Re-export for convenience
export { validateRigStructure, validateMotionsStructure } from "./validateStructure.js";
export { validateRigSemantics, validateMotionSemantics } from "./validateSemantics.js";
