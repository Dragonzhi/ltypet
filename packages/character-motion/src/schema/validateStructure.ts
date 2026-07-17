/**
 * JSON Schema structural validation using Ajv.
 * Validates raw input against the JSON Schema, then returns typed results.
 */

import type { CharacterRigV1, MotionLibraryV1, ValidationResult, ValidationIssue } from "../types";
import Ajv, { type ErrorObject } from "ajv";
import rigSchema from "./rig.schema.json";
import motionsSchema from "./motions.schema.json";

// ─── Pre-compiled Validators ─────────────────────────────────────

const ajv = new Ajv({
  strict: false,
  allErrors: true,
  // Skip schema meta-validation since we author our schemas
  validateSchema: false,
});

const validateRigJson = ajv.compile(rigSchema);
const validateMotionsJson = ajv.compile(motionsSchema);

// ─── Error Conversion ────────────────────────────────────────────

function ajvErrorsToIssues(errors: ErrorObject[] | null | undefined): ValidationIssue[] {
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
