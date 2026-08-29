/**
 * Seeds system categories and the UAE merchant dictionary.
 * Idempotent: run any time with `npm run db:seed`.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { SYSTEM_CATEGORIES } from "../lib/categories";
import { categories, merchantDictionary } from "./schema";

const MERCHANTS: Array<[norm: string, display: string, slug: string]> = [
  // Groceries
  ["CARREFOUR", "Carrefour", "groceries"],
  ["LULU", "Lulu Hypermarket", "groceries"],
  ["SPINNEYS", "Spinneys", "groceries"],
  ["WAITROSE", "Waitrose", "groceries"],
  ["UNION COOP", "Union Coop", "groceries"],
  ["CHOITHRAMS", "Choithrams", "groceries"],
  ["WEST ZONE", "West Zone", "groceries"],
  ["VIVA SUPERMARKET", "Viva", "groceries"],
  ["NESTO", "Nesto", "groceries"],
  ["ISTANBUL SUPERMARKET", "Istanbul Supermarket", "groceries"],
  // Dining & delivery
  ["TALABAT", "Talabat", "dining"],
  ["DELIVEROO", "Deliveroo", "dining"],
  ["ZOMATO", "Zomato", "dining"],
  ["NOON FOOD", "Noon Food", "dining"],
  ["MCDONALDS", "McDonald's", "dining"],
  ["KFC", "KFC", "dining"],
  ["STARBUCKS", "Starbucks", "dining"],
  ["COSTA", "Costa Coffee", "dining"],
  ["TIM HORTONS", "Tim Hortons", "dining"],
  ["SUBWAY", "Subway", "dining"],
  ["HARDEES", "Hardee's", "dining"],
  ["PIZZA HUT", "Pizza Hut", "dining"],
  ["PAPA JOHNS", "Papa John's", "dining"],
  ["CAFETERIA", "Cafeteria", "dining"],
  // Transport
  ["CAREEM", "Careem", "transport"],
  ["UBER", "Uber", "transport"],
  ["RTA", "RTA", "transport"],
  ["SALIK", "Salik", "transport"],
  ["NOL", "Nol", "transport"],
  ["DUBAI TAXI", "Dubai Taxi", "transport"],
  ["EKAR", "Ekar", "transport"],
  ["UDRIVE", "Udrive", "transport"],
  ["PARKIN", "Parkin", "transport"],
  ["MAWAQIF", "Mawaqif", "transport"],
  // Buy now, pay later
  ["TABBY", "Tabby", "bnpl"],
  ["TAMARA", "Tamara", "bnpl"],
  ["POSTPAY", "Postpay", "bnpl"],
  ["CASHEW", "Cashew", "bnpl"],
  // Fuel
  ["ADNOC", "ADNOC", "fuel"],
  ["ENOC", "ENOC", "fuel"],
  ["EPPCO", "EPPCO", "fuel"],
  ["EMARAT", "Emarat", "fuel"],
  ["CAFU", "CAFU", "fuel"],
  // Shopping
  ["NOON", "Noon", "shopping"],
  ["AMAZON", "Amazon", "shopping"],
  ["AMAZON AE", "Amazon.ae", "shopping"],
  ["SHEIN", "Shein", "shopping"],
  ["NAMSHI", "Namshi", "shopping"],
  ["IKEA", "IKEA", "shopping"],
  ["ACE HARDWARE", "ACE Hardware", "shopping"],
  ["SHARAF DG", "Sharaf DG", "shopping"],
  ["EMAX", "Emax", "shopping"],
  ["JUMBO", "Jumbo Electronics", "shopping"],
  ["DUBAI DUTY FREE", "Dubai Duty Free", "shopping"],
  ["ALIEXPRESS", "AliExpress", "shopping"],
  ["TEMU", "Temu", "shopping"],
  ["DRAGON MART", "Dragon Mart", "shopping"],
  ["H&M", "H&M", "shopping"],
  ["ZARA", "Zara", "shopping"],
  ["MAX", "Max Fashion", "shopping"],
  ["BRANDS FOR LESS", "Brands For Less", "shopping"],
  // Utilities
  ["DEWA", "DEWA", "utilities"],
  ["SEWA", "SEWA", "utilities"],
  ["ADDC", "ADDC", "utilities"],
  ["FEWA", "FEWA", "utilities"],
  ["EMPOWER", "Empower", "utilities"],
  ["LOOTAH", "Lootah Gas", "utilities"],
  // Telecom
  ["ETISALAT", "e& (Etisalat)", "telecom"],
  ["DU", "du", "telecom"],
  ["VIRGIN MOBILE", "Virgin Mobile", "telecom"],
  // Housing
  ["EJARI", "Ejari", "housing"],
  ["DUBIZZLE", "Dubizzle", "housing"],
  // Health
  ["ASTER", "Aster", "health"],
  ["LIFE PHARMACY", "Life Pharmacy", "health"],
  ["BIN SINA", "BinSina Pharmacy", "health"],
  ["MEDICINA", "Medicina Pharmacy", "health"],
  ["NMC", "NMC Healthcare", "health"],
  ["MEDICLINIC", "Mediclinic", "health"],
  ["DAMAN", "Daman", "health"],
  // Entertainment & subscriptions
  ["NETFLIX", "Netflix", "entertainment"],
  ["SPOTIFY", "Spotify", "entertainment"],
  ["ANGHAMI", "Anghami", "entertainment"],
  ["OSN", "OSN+", "entertainment"],
  ["SHAHID", "Shahid", "entertainment"],
  ["STARZPLAY", "StarzPlay", "entertainment"],
  ["APPLE COM BILL", "Apple", "entertainment"],
  ["GOOGLE PLAY", "Google Play", "entertainment"],
  ["PLAYSTATION", "PlayStation", "entertainment"],
  ["STEAM", "Steam", "entertainment"],
  ["VOX CINEMAS", "VOX Cinemas", "entertainment"],
  ["REEL CINEMAS", "Reel Cinemas", "entertainment"],
  ["YOUTUBE PREMIUM", "YouTube Premium", "entertainment"],
  // Travel
  ["EMIRATES", "Emirates", "travel"],
  ["FLYDUBAI", "flydubai", "travel"],
  ["ETIHAD", "Etihad", "travel"],
  ["AIR ARABIA", "Air Arabia", "travel"],
  ["WIZZ AIR", "Wizz Air", "travel"],
  ["BOOKING COM", "Booking.com", "travel"],
  ["AIRBNB", "Airbnb", "travel"],
  ["AGODA", "Agoda", "travel"],
  // Fees
  ["VAT", "VAT", "fees"],
  ["SERVICE CHARGE", "Service Charge", "fees"],
  ["ATM FEE", "ATM Fee", "fees"],
];

async function main() {
  try {
    process.loadEnvFile(".env");
  } catch {
    /* no .env — rely on the ambient environment */
  }
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = drizzle(neon(url));

  for (const cat of SYSTEM_CATEGORIES) {
    await db
      .insert(categories)
      .values({
        id: `sys_${cat.slug}`,
        userId: null,
        slug: cat.slug,
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        kind: cat.kind,
        sortOrder: cat.sortOrder,
      })
      .onConflictDoUpdate({
        target: categories.id,
        set: { name: cat.name, icon: cat.icon, color: cat.color, sortOrder: cat.sortOrder },
      });
  }
  console.log(`Seeded ${SYSTEM_CATEGORIES.length} system categories`);

  for (const [norm, display, slug] of MERCHANTS) {
    await db
      .insert(merchantDictionary)
      .values({ merchantNorm: norm, displayName: display, categorySlug: slug })
      .onConflictDoNothing();
  }
  console.log(`Seeded ${MERCHANTS.length} dictionary merchants`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
