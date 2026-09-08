import assert from "node:assert/strict";
import test from "node:test";
import {
  recoverPlatformRole,
  recoverProfileName,
  validateManagePlatformUserInput,
  validateSetPlatformUserStatusInput,
} from "./logic.ts";

test("normalizes a valid platform account request", () => {
  const result = validateManagePlatformUserInput({
    name: "  Ada   Teacher  ",
    email: "  ADA@Example.COM ",
    password: "temporary-password",
    role: "Teacher",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, {
    name: "Ada Teacher",
    email: "ada@example.com",
    password: "temporary-password",
    role: "teacher",
  });
});

test("validates account status changes without accepting malformed targets", () => {
  assert.deepEqual(validateSetPlatformUserStatusInput({
    action: "set_status",
    userId: "6aa5d0d4-2a9f-4483-b6c8-0cf4c6c98ac4",
    isActive: false,
  }), {
    ok: true,
    value: {
      action: "set_status",
      userId: "6aa5d0d4-2a9f-4483-b6c8-0cf4c6c98ac4",
      isActive: false,
    },
  });
  assert.equal(validateSetPlatformUserStatusInput({ action: "set_status", userId: "nope", isActive: false }).ok, false);
  assert.equal(validateSetPlatformUserStatusInput({ action: "set_status", userId: "6aa5d0d4-2a9f-4483-b6c8-0cf4c6c98ac4", isActive: "false" }).ok, false);
});

test("rejects invalid email, password, and role values", () => {
  const invalidEmail = validateManagePlatformUserInput({
    name: "Ada",
    email: "not-an-email",
    password: "temporary-password",
    role: "student",
  });
  assert.equal(invalidEmail.ok, false);

  const shortPassword = validateManagePlatformUserInput({
    name: "Ada",
    email: "ada@example.com",
    password: "short",
    role: "student",
  });
  assert.equal(shortPassword.ok, false);

  const invalidRole = validateManagePlatformUserInput({
    name: "Ada",
    email: "ada@example.com",
    password: "temporary-password",
    role: "owner",
  });
  assert.equal(invalidRole.ok, false);
});

test("never promotes an orphan from user-editable metadata", () => {
  assert.equal(recoverPlatformRole({ role: "superadmin" }), "student");
  assert.equal(recoverPlatformRole({ platform_role: "teacher" }), "teacher");
  assert.equal(recoverPlatformRole({ platform_role: "owner" }), "student");
});

test("recovers the stored display name before request fallbacks", () => {
  assert.equal(
    recoverProfileName({
      userMetadata: { name: " Existing   Student " },
      requestedName: "Replacement Name",
      email: "student@example.com",
    }),
    "Existing Student",
  );
  assert.equal(
    recoverProfileName({
      userMetadata: {},
      requestedName: "Replacement Name",
      email: "student@example.com",
    }),
    "Replacement Name",
  );
});
