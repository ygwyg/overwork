import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSplitPlans } from "./dist/plan.js";

const fakeDeps = [
  { name: "sql-formatter", bytes: 600_000, percentage: 50, files: [] },
  { name: "@faker-js/faker", bytes: 4_000_000, percentage: 40, files: [] },
  { name: "tiny-lib", bytes: 1_000, percentage: 1, files: [] },
];

describe("createSplitPlans", () => {
  describe("auto mode", () => {
    it("filters deps above threshold", () => {
      const plans = createSplitPlans("auto", fakeDeps, 500_000);
      assert.equal(plans.length, 2);
      assert.equal(plans[0].packageName, "sql-formatter");
      assert.equal(plans[1].packageName, "@faker-js/faker");
    });

    it("returns empty when nothing exceeds threshold", () => {
      const plans = createSplitPlans("auto", fakeDeps, 10_000_000);
      assert.equal(plans.length, 0);
    });
  });

  describe("explicit mode", () => {
    it("finds named packages", () => {
      const plans = createSplitPlans(["tiny-lib"], fakeDeps, 0);
      assert.equal(plans.length, 1);
      assert.equal(plans[0].packageName, "tiny-lib");
    });

    it("throws for unknown package", () => {
      assert.throws(
        () => createSplitPlans(["nonexistent"], fakeDeps, 0),
        /Package "nonexistent" not found/,
      );
    });
  });

  describe("name generation", () => {
    it("sanitizes service name from scoped package", () => {
      const plans = createSplitPlans(["@faker-js/faker"], fakeDeps, 0);
      assert.equal(plans[0].serviceName, "faker-js-faker-service");
    });

    it("generates simple service name", () => {
      const plans = createSplitPlans(["sql-formatter"], fakeDeps, 0);
      assert.equal(plans[0].serviceName, "sql-formatter-service");
    });

    it("generates uppercase binding name with underscores", () => {
      const plans = createSplitPlans(["@faker-js/faker"], fakeDeps, 0);
      assert.equal(plans[0].bindingName, "FAKER_JS_FAKER");
    });

    it("generates PascalCase entrypoint class", () => {
      const plans = createSplitPlans(["sql-formatter"], fakeDeps, 0);
      assert.equal(plans[0].entrypointClass, "SqlFormatterEntrypoint");
    });

    it("generates PascalCase entrypoint for scoped package", () => {
      const plans = createSplitPlans(["@faker-js/faker"], fakeDeps, 0);
      assert.equal(plans[0].entrypointClass, "FakerJsFakerEntrypoint");
    });

    it("initializes exportNames as empty array", () => {
      const plans = createSplitPlans(["sql-formatter"], fakeDeps, 0);
      assert.deepEqual(plans[0].exportNames, []);
    });
  });
});
