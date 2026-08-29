import { describe, expect, it } from "vitest";

import { classifyP2P, holderNameTokens } from "./categorize.server";

const holder = holderNameTokens("Abdur Rahman");

describe("classifyP2P", () => {
  it("treats a counterparty sharing a holder name token as self", () => {
    expect(classifyP2P("TO ABDUR - SIB", holder)).toBe("self");
    expect(classifyP2P("FROM ABDUR RAHMAN", holder)).toBe("self");
    expect(classifyP2P("TO ABDUR RAHMAN MOINUL", holder)).toBe("self");
  });

  it("classifies money to other people as outgoing spending", () => {
    expect(classifyP2P("TO MOHAMMAD TOWHID JAMAL", holder)).toBe("out");
    expect(classifyP2P("TO MEHER MD SAAD", holder)).toBe("out");
  });

  it("classifies money from other people as incoming", () => {
    expect(classifyP2P("FROM MEHER MD SAAD", holder)).toBe("in");
    expect(classifyP2P("FROM MOHAMED MOHIDUL ALAM", holder)).toBe("in");
  });

  it("ignores rows that are not TO/FROM person patterns", () => {
    expect(classifyP2P("CARREFOUR MOE", holder)).toBeNull();
    expect(classifyP2P("CREDIT REPAYMENT AUTOPAY", holder)).toBeNull();
    expect(classifyP2P("TOTAL ENERGIES", holder)).toBeNull();
  });

  it("short name fragments don't cause false self-matches", () => {
    // "MD" (2 chars) in the holder name must not match everyone named MD
    const initials = holderNameTokens("Md Ali");
    expect(classifyP2P("TO MEHER MD SAAD", initials)).toBe("out");
  });
});
