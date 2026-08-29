import { describe, expect, it } from "vitest";

import { displayMerchant, normalizeMerchant } from "./normalize";

describe("normalizeMerchant", () => {
  it("strips POS noise and location tails", () => {
    expect(normalizeMerchant("CAREEM*RIDE-88213 DUBAI ARE")).toContain("CAREEM");
    expect(normalizeMerchant("CAREEM*RIDE-88213 DUBAI ARE")).not.toContain("88213");
  });

  it("collapses the same merchant across descriptor variants", () => {
    const a = normalizeMerchant("CARREFOUR MOE POS 4421 DUBAI AE");
    const b = normalizeMerchant("CARREFOUR MOE POS 9987 DUBAI AE");
    expect(a).toBe(b);
  });

  it("strips masked card numbers and embedded dates", () => {
    const result = normalizeMerchant("NETFLIX.COM CARD ****1234 12/08/2026");
    expect(result).toContain("NETFLIX");
    expect(result).not.toContain("1234");
  });

  it("never returns an empty key", () => {
    expect(normalizeMerchant("12345 67890").length).toBeGreaterThan(0);
  });
});

describe("displayMerchant", () => {
  it("title-cases the normalized key", () => {
    expect(displayMerchant("CARREFOUR MOE")).toBe("Carrefour Moe");
  });
});
