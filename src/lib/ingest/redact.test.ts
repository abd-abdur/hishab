import { describe, expect, it } from "vitest";

import { redactAccountIdentifiers } from "./redact";

describe("redactAccountIdentifiers", () => {
  it("masks UAE IBANs keeping the country code and last 4", () => {
    const input = "IBAN: AE070331234567890123456";
    const output = redactAccountIdentifiers(input);
    expect(output).not.toContain("0331234567890123");
    expect(output).toMatch(/AE•+3456/);
  });

  it("masks card-style groups", () => {
    const output = redactAccountIdentifiers("Card 4111 1111 1111 1234 was charged");
    expect(output).not.toContain("4111 1111 1111 1234");
    expect(output).toContain("1234");
    expect(output).toContain("•");
  });

  it("masks standalone digit runs of 8+ keeping the last 4", () => {
    expect(redactAccountIdentifiers("Account 28862557")).toBe("Account ••••2557");
    expect(redactAccountIdentifiers("Ref 529090001234562698")).toBe("Ref ••••••••••••••2698");
  });

  it("leaves amounts, dates, and short numbers alone", () => {
    const input = "27/08/2026 POS GROCERY 1,234.56 AED balance 12,345.67";
    expect(redactAccountIdentifiers(input)).toBe(input);
  });

  it("is deterministic", () => {
    const input = "AE070331234567890123456 and 28862557";
    expect(redactAccountIdentifiers(input)).toBe(redactAccountIdentifiers(input));
  });
});
