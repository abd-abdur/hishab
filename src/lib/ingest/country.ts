/**
 * Deterministic merchant-country inference from statement row text — no model
 * involved. Card rows usually carry a city ("TIM HORTONS TORONTO"), an ISO
 * country token ("... CAN"), or an original-currency marker ("CAD 20.00").
 *
 * Runs at draft time (while text is still plaintext) and the result is stored
 * as a two-letter code in the plaintext skeleton, like the category: coarse,
 * aggregatable, and deliberately not identifying on its own.
 *
 * Resolution order: explicit country token → city keyword → original-currency
 * code → home-country default for AED statements. Null when nothing matches.
 */

const COUNTRY_TOKENS: Record<string, string> = {
  UAE: "AE", ARE: "AE",
  USA: "US",
  CAN: "CA", CANADA: "CA",
  GBR: "GB", UK: "GB",
  SAU: "SA", KSA: "SA",
  QAT: "QA", QATAR: "QA",
  KWT: "KW", KUWAIT: "KW",
  BHR: "BH", BAHRAIN: "BH",
  OMN: "OM", OMAN: "OM",
  IND: "IN", INDIA: "IN",
  PAK: "PK", PAKISTAN: "PK",
  BGD: "BD", BANGLADESH: "BD",
  TUR: "TR", TURKIYE: "TR", TURKEY: "TR",
  EGY: "EG", EGYPT: "EG",
  THA: "TH", THAILAND: "TH",
  MYS: "MY", MALAYSIA: "MY",
  SGP: "SG", SINGAPORE: "SG",
  IDN: "ID", INDONESIA: "ID",
  FRA: "FR", FRANCE: "FR",
  DEU: "DE", GERMANY: "DE",
  ESP: "ES", SPAIN: "ES",
  ITA: "IT", ITALY: "IT",
  NLD: "NL", NETHERLANDS: "NL",
  CHE: "CH", SWITZERLAND: "CH",
  JPN: "JP", JAPAN: "JP",
  AUS: "AU", AUSTRALIA: "AU",
  GEO: "GE", GEORGIA: "GE",
  AZE: "AZ", AZERBAIJAN: "AZ",
  MDV: "MV", MALDIVES: "MV",
  LKA: "LK",
};

const CITY_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(DUBAI|ABU DHABI|SHARJAH|AJMAN|AL AIN|FUJAIRAH|RAS AL KHAIMAH|UMM AL QUWAIN)\b/, "AE"],
  [/\b(TORONTO|MISSISSAUGA|VANCOUVER|MONTREAL|CALGARY|OTTAWA|SCARBOROUGH|ETOBICOKE|BRAMPTON|ONTARIO|QUEBEC)\b/, "CA"],
  [/\b(NEW YORK|BROOKLYN|SEATTLE|SAN FRANCISCO|LOS ANGELES|LAS VEGAS|CHICAGO|HOUSTON|MIAMI|BOSTON)\b/, "US"],
  [/\b(LONDON|MANCHESTER|BIRMINGHAM|EDINBURGH|GLASGOW)\b/, "GB"],
  [/\b(RIYADH|JEDDAH|DAMMAM|MECCA|MEDINA|MAKKAH|MADINAH)\b/, "SA"],
  [/\bDOHA\b/, "QA"],
  [/\b(MUMBAI|DELHI|BANGALORE|BENGALURU|HYDERABAD|CHENNAI|KOLKATA|KOCHI|KERALA)\b/, "IN"],
  [/\b(KARACHI|LAHORE|ISLAMABAD)\b/, "PK"],
  [/\b(DHAKA|CHITTAGONG|SYLHET)\b/, "BD"],
  [/\b(ISTANBUL|ANKARA|ANTALYA|IZMIR)\b/, "TR"],
  [/\b(CAIRO|GIZA|ALEXANDRIA)\b/, "EG"],
  [/\b(BANGKOK|PHUKET|PATTAYA)\b/, "TH"],
  [/\b(KUALA LUMPUR|PENANG|LANGKAWI)\b/, "MY"],
  [/\b(BALI|JAKARTA)\b/, "ID"],
  [/\b(PARIS|LYON|NICE)\b/, "FR"],
  [/\b(BERLIN|MUNICH|FRANKFURT|HAMBURG)\b/, "DE"],
  [/\b(MADRID|BARCELONA|SEVILLE)\b/, "ES"],
  [/\b(ROME|MILAN|VENICE|FLORENCE)\b/, "IT"],
  [/\b(AMSTERDAM|ROTTERDAM)\b/, "NL"],
  [/\b(TOKYO|OSAKA|KYOTO)\b/, "JP"],
  [/\b(SYDNEY|MELBOURNE|BRISBANE|PERTH)\b/, "AU"],
  [/\b(TBILISI|BATUMI)\b/, "GE"],
  [/\bBAKU\b/, "AZ"],
  [/\b(MALE|MALDIVES)\b/, "MV"],
  [/\b(COLOMBO)\b/, "LK"],
  [/\bSINGAPORE\b/, "SG"],
];

/** Currencies that imply one country strongly enough to use as a signal. */
const CURRENCY_COUNTRY: Record<string, string> = {
  AED: "AE", CAD: "CA", GBP: "GB", SAR: "SA", QAR: "QA", KWD: "KW", BHD: "BH",
  OMR: "OM", INR: "IN", PKR: "PK", BDT: "BD", TRY: "TR", EGP: "EG", THB: "TH",
  MYR: "MY", SGD: "SG", IDR: "ID", JPY: "JP", AUD: "AU", GEL: "GE", AZN: "AZ",
  MVR: "MV", LKR: "LK", CHF: "CH", USD: "US",
};

/** An original-currency marker like "CAD 20.00", "USD-12.34", or "| CAD |". */
const CURRENCY_AMOUNT_RE = /\b([A-Z]{3})\s*-?\d[\d,]*\.?\d*/;

/**
 * Trailing two-letter ISO tokens ("AMZN MKTP CA", "HM CA") — only checked as
 * the LAST word, where card processors print the country; anywhere else two
 * letters are too ambiguous.
 */
const TRAILING_ISO2 = new Set([
  "AE", "CA", "US", "GB", "SA", "QA", "KW", "BH", "OM", "IN", "PK", "BD", "TR",
  "EG", "TH", "MY", "SG", "ID", "FR", "DE", "ES", "IT", "NL", "JP", "AU",
]);

/**
 * A country the row's own text actually asserts — a country token, a known
 * city, or a foreign-currency marker. Null when the text carries no signal
 * (many banks print bare merchant names).
 */
export function countrySignal(description: string, statementCurrency: string): string | null {
  const text = description.toUpperCase();

  const words = text.split(/[^A-Z]+/).filter(Boolean);
  for (let i = words.length - 1; i >= 0; i--) {
    const token = COUNTRY_TOKENS[words[i] as string];
    if (token) return token;
  }
  const last = words[words.length - 1];
  if (last && last.length === 2 && TRAILING_ISO2.has(last) && words.length > 1) return last;

  for (const [pattern, country] of CITY_KEYWORDS) {
    if (pattern.test(text)) return country;
  }

  const currencyMatch = CURRENCY_AMOUNT_RE.exec(text);
  if (currencyMatch) {
    const byCurrency = CURRENCY_COUNTRY[currencyMatch[1] as string];
    if (byCurrency && byCurrency !== CURRENCY_COUNTRY[statementCurrency]) return byCurrency;
  }

  return null;
}

/** The statement's home country — the fallback when nothing else knows better. */
export function homeCountry(statementCurrency: string): string | null {
  return CURRENCY_COUNTRY[statementCurrency] ?? null;
}

/**
 * Best-effort country for a row: what the text asserts, else an optional hint
 * (e.g. the categorization model's world knowledge of the merchant), else the
 * statement's home country.
 */
export function inferCountry(
  description: string,
  statementCurrency: string,
  hint?: string | null,
): string | null {
  return (
    countrySignal(description, statementCurrency) ?? hint ?? homeCountry(statementCurrency)
  );
}
