import assert from "node:assert/strict";
import test from "node:test";
import { requireAdmittedRenderer } from "../src/map/renderer-registry";
import { resolveBeautiMapConstructor } from "../src/map/beauti-map-adapter";

class FakeMap {}

test("accepts the documented named export", () => {
  assert.equal(resolveBeautiMapConstructor({ Map3D: FakeMap }), FakeMap);
});

test("accepts a valid default export", () => {
  assert.equal(resolveBeautiMapConstructor({ default: FakeMap }), FakeMap);
});

test("accepts a constructor exported directly", () => {
  assert.equal(resolveBeautiMapConstructor(FakeMap), FakeMap);
});

test("rejects the audited UMD undefined export", () => {
  assert.throws(() => resolveBeautiMapConstructor(undefined), /neither a usable default export nor a named Map3D export/);
});

test("keeps BeautiMap out of the formal renderer registry", () => {
  assert.throws(() => requireAdmittedRenderer("beauti-map"), /excluded from the formal renderer registry/);
});
