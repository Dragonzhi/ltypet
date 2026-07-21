/**
 * JSON Schema structural validation using build-time generated Ajv validators.
 * Runtime code generation is intentionally forbidden so strict CSP remains viable.
 */

import type { CharacterRigV1, MotionLibraryV1, ValidationResult, ValidationIssue } from "../types.js";
import validateRigStandalone from "./generated/validateRig.generated.js";
import validateMotionsStandalone from "./generated/validateMotions.generated.js";

interface StructuralValidationError {
  keyword: string;
  instancePath: string;
  message?: string;
}

interface StandaloneValidator {
  (input: unknown): boolean;
  errors?: StructuralValidationError[] | null;
}

const validateRigJson = validateRigStandalone as StandaloneValidator;
const validateMotionsJson = validateMotionsStandalone as StandaloneValidator;

// ─── Error Conversion ────────────────────────────────────────────

function ajvErrorsToIssues(errors: StructuralValidationError[] | null | undefined): ValidationIssue[] {
  if (!errors) return [];
  return errors.map((err) => ({
    code: err.keyword || "schema",
    path: err.instancePath || "/",
    message: err.message || "Unknown validation error",
    severity: "error" as const,
  }));
}

// ─── validateRigStructure ────────────────────────────────────────

/**
 * Validates an unknown input against the Character Rig V1 JSON Schema.
 */
export function validateRigStructure(
  input: unknown,
): ValidationResult<CharacterRigV1> {
  if (validateRigJson(input)) {
    return {
      ok: true,
      value: input as unknown as CharacterRigV1,
      warnings: [],
    };
  }

  return {
    ok: false,
    issues: ajvErrorsToIssues(validateRigJson.errors),
  };
}

// ─── validateMotionsStructure ────────────────────────────────────

/**
 * Validates an unknown input against the Motion Library V1 JSON Schema.
 */
export function validateMotionsStructure(
  input: unknown,
): ValidationResult<MotionLibraryV1> {
  if (validateMotionsJson(input)) {
    return {
      ok: true,
      value: input as unknown as MotionLibraryV1,
      warnings: [],
    };
  }

  return {
    ok: false,
    issues: ajvErrorsToIssues(validateMotionsJson.errors),
  };
}
