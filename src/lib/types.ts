// Shared domain types (server + client). Timestamps are epoch milliseconds.

export type Role = "customer" | "merchant_staff" | "ngo_member" | "admin";
export type Locale = "en" | "hi";

export const CATEGORIES = ["bakery", "meals", "fresh", "desserts", "beverages"] as const;
export type Category = (typeof CATEGORIES)[number];

export const ALLERGENS = [
  "gluten", "dairy", "nuts", "peanuts", "egg", "soy", "sesame", "fish", "shellfish", "mustard",
] as const;
export type Allergen = (typeof ALLERGENS)[number];

export type VegMark = "veg" | "nonveg" | "egg";

export interface GeoPoint { lat: number; lng: number }

export interface User {
  id: string;
  role: Role;
  displayName: string;
  email: string;
  orgId?: string;          // merchantId or ngoId
  locale: Locale;
  activeReservations: number;
  noShows: number;
  createdAt: number;
}

export type VerificationStatus = "pending" | "auto_checked" | "verified" | "rejected" | "suspended";

export interface VerificationChecks {
  formatOk: boolean;
  numberMatches: boolean;
  notExpired: boolean;
  nameMatches: boolean;
}

export interface Verification {
  status: VerificationStatus;
  documentType?: string;          // fssai_registration | fssai_state | fssai_central | ngo_registration
  licenceNumber?: string;
  licenceName?: string;
  validUpto?: string;             // YYYY-MM-DD
  docPath?: string;
  checks?: VerificationChecks;
  extractedBy?: string;           // model id or "mock"
  reviewedBy?: string;
  reviewedAt?: number;
  rejectReason?: string;
  submittedAt?: number;
}

export interface FoodSafety {
  allowedSaleCategories: Category[];
  donationEligibleCategories: Category[];
  maxHoursSincePrep: Partial<Record<Category, number>>;
}

export interface Merchant {
  id: string;
  name: string;
  type: "cafe" | "restaurant" | "bakery" | "cloud_kitchen" | "retail";
  address: string;
  location: GeoPoint;
  geohash: string;
  pickupHours: { open: string; close: string }; // "HH:MM"
  verification: Verification;
  foodSafety: FoodSafety;
  aiQuota: { date: string; drafts: number; voice: number; licence: number };
  createdAt: number;
}

export interface StockItem {
  id: string;
  merchantId: string;
  name: string;           // as entered/spoken (may be Hindi)
  nameEn: string;
  category: Category;
  vegMark: VegMark;
  unit: string;
  usualPrice: number;     // INR
  allergens: Allergen[];
  usualDailySales?: number; // merchant's own estimate (cold start)
  date: string;           // business day YYYY-MM-DD
  preparedToday: number;
  remaining: number;
  lastUpdatedAt: number;
  lastUpdatedBy?: string;
  updatedVia?: "tap" | "set" | "voice" | "reservation" | "rescue";
}

export interface SalesDay {
  id: string; // `${merchantId}_${date}`
  merchantId: string;
  date: string;
  weekday: number; // 0=Sun
  items: Record<string, { prepared: number; soldByHour: number[]; leftover: number; rescued: number; donated: number }>;
}

export interface DraftItem {
  stockItemId?: string;
  nameOriginal: string;
  nameEn: string;
  category: Category;
  vegMark: VegMark;
  qty: number;
  unitPrice: number;
  allergensSuspected: Allergen[];
}

export interface Bundle {
  title: string;
  titleHi?: string;
  itemIndexes: number[];
  originalPrice: number;
  suggestedPrice: number;
}

export interface SurplusDraft {
  id: string;
  merchantId: string;
  createdBy: string;
  source: "stock" | "text" | "voice" | "photo";
  inputLang?: string;
  items: DraftItem[];
  bundles: Bundle[];
  pickupWindow: { start: number; end: number };
  notes: string;
  confidence: number;
  model: string;
  warnings: string[];
  status: "draft" | "approved" | "rejected";
  rejectReason?: string;
  createdAt: number;
}

export type OfferStatus = "live" | "sold_out" | "expired" | "withdrawn";

export interface Offer {
  id: string;
  merchantId: string;
  merchantName: string;
  draftId?: string;
  title: string;
  titleHi?: string;
  category: Category;
  vegMark: VegMark;
  items: { name: string; qty: number; stockItemId?: string }[];
  allergensConfirmed: Allergen[];
  originalPrice: number;
  price: number;
  qtyTotal: number;
  qtyAvailable: number;
  pickupStart: number;
  pickupEnd: number;
  location: GeoPoint;
  geohash: string;
  status: OfferStatus;
  safetyAttestation: { preparedAt: number; storage: string; attestedBy: string };
  createdAt: number;
}

/** Public projection for the live map. Never contains private fields. */
export interface PublicOffer {
  id: string;
  title: string;
  titleHi?: string;
  category: Category;
  vegMark: VegMark;
  price: number;
  originalPrice: number;
  qtyAvailable: number;
  pickupStart: number;
  pickupEnd: number;
  merchantName: string;
  allergens: Allergen[];
  location: GeoPoint;
  geohash: string;
}

export type ReservationStatus = "reserved" | "collected" | "cancelled" | "no_show";

export interface Reservation {
  id: string;
  offerId: string;
  merchantId: string;
  customerUid: string;
  qty: number;
  priceEach: number;
  offerTitle: string;
  merchantName: string;
  pickupStart: number;
  pickupEnd: number;
  codeHash: string;
  codeEnc?: string;
  failedAttempts: number;
  status: ReservationStatus;
  createdAt: number;
  collectedAt?: number;
}

export type DonationStatus = "offered" | "claimed" | "collected" | "expired";

export interface Donation {
  id: string;
  merchantId: string;
  merchantName: string;
  items: { name: string; qty: number }[];
  estimatedMeals: number;
  estimatedKg: number;
  location: GeoPoint;
  geohash: string;
  safetyAttestation: { preparedAt: number; storage: string; allergens: Allergen[]; attestedBy: string };
  status: DonationStatus;
  pickupWindow: { start: number; end: number };
  claimedByNgo?: string;
  claimedByName?: string;
  handoverCodeHash?: string;
  handoverCodeEnc?: string;
  merchantConfirmedAt?: number;
  createdAt: number;
}

export interface Ngo {
  id: string;
  name: string;
  serviceArea: GeoPoint & { radiusKm: number };
  verification: Verification;
  createdAt: number;
}

export interface Impact {
  id: string; // `${merchantId}_${yyyy-mm}`
  merchantId: string;
  month: string;
  unitsRescued: number;
  revenueRecovered: number;
  mealsDonated: number;
  kgRescued: number;
  noShows: number;
  topWastedItems: Record<string, number>;
}

export interface AtRiskFlag {
  stockItemId: string;
  name: string;
  remaining: number;
  expectedRemainingSales: number;
  likelyLeftover: number;
  action: "discount_now" | "donate_at_close" | "prepare_less_tomorrow";
  suggestedDiscountAt?: string; // HH:MM
  tomorrowReduceBy?: number;
  basis: "history" | "merchant_estimate";
}
