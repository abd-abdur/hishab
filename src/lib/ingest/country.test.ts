import { describe, expect, it } from "vitest";

import { countrySignal, inferCountry } from "./country";

describe("inferCountry", () => {
  it("reads city keywords", () => {
    expect(inferCountry("BEAVERTAILS TORONTO WA", "AED")).toBe("CA");
    expect(inferCountry("POS CARREFOUR DUBAI MALL", "AED")).toBe("AE");
    expect(inferCountry("PRET A MANGER LONDON", "AED")).toBe("GB");
  });

  it("reads explicit country tokens, preferring the trailing one", () => {
    expect(inferCountry("TIM HORTONS 1234 QSR CAN", "AED")).toBe("CA");
    expect(inferCountry("AMAZON MKTP USA", "AED")).toBe("US");
  });

  it("reads original-currency markers when they differ from the statement currency", () => {
    expect(inferCountry("SQ RENDEZVIEWS CAD 13.08", "AED")).toBe("CA");
    expect(inferCountry("SOME SHOP AED 99.00", "AED")).toBe("AE"); // same currency → domestic default
  });

  it("defaults to the statement's home country when nothing matches", () => {
    expect(inferCountry("POS RANDOM SHOP 8821", "AED")).toBe("AE");
    expect(inferCountry("POS RANDOM SHOP 8821", "XXX")).toBeNull();
  });

  it("city beats currency default", () => {
    expect(inferCountry("DOORDASH SCOTTYBONS TORONTO", "AED")).toBe("CA");
  });

  it("a hint fills in when the text has no signal, but never overrides one", () => {
    expect(countrySignal("TIM HORTONS", "AED")).toBeNull();
    expect(inferCountry("TIM HORTONS", "AED", "CA")).toBe("CA"); // bare name → hint wins
    expect(inferCountry("TIM HORTONS DUBAI MALL", "AED", "CA")).toBe("AE"); // text signal wins
    expect(inferCountry("TIM HORTONS", "AED", null)).toBe("AE"); // no hint → home default
  });
});
