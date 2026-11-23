import type { VerificationChecks } from "@/lib/types";

// Pure, testable licence checks. These never approve anything on their own:
// they give the admin a checklist before the human decision (DESIGN §2, D34).

const digits = (s: string) => s.replace(/\D/g, "");

/** FSSAI licence/registration numbers are 14 digits. */
export function fssaiFormatOk(num: string): boolean {
  return /^\d{14}$/.test(digits(num)) && digits(num).length === num.replace(/[\s-]/g, "").length;
}

/** NGO identifiers vary (NGO Darpan ID, trust/society registration): loose sanity check only. */
export function ngoIdFormatOk(id: string): boolean {
  return /^[A-Za-z0-9/\-]{6,30}$/.test(id.trim());
}

export function numbersMatch(typed: string, extracted: string, kind: "fssai" | "ngo"): boolean {
  if (!typed || !extracted) return false;
  if (kind === "fssai") return digits(typed) === digits(extracted);
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return norm(typed) === norm(extracted);
}

export function notExpired(validUpto: string | undefined, todayKey: string): boolean {
  return !!validUpto && /^\d{4}-\d{2}-\d{2}$/.test(validUpto) && validUpto >= todayKey;
}

const STOP = new Set(["the", "pvt", "private", "ltd", "limited", "llp", "and", "&", "co", "company", "foods", "food", "m/s", "ms", "trust", "society", "foundation"]);

function tokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((t) => t && !STOP.has(t)),
  );
}

/** Token-overlap similarity; ≥ 0.5 counts as a match (handles "Pvt Ltd", word order). */
export function nameSimilarity(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / Math.min(ta.size, tb.size);
}

export function runChecks(input: {
  kind: "fssai" | "ngo";
  typedNumber: string;
  extractedNumber: string;
  businessName: string;
  extractedName: string;
  validUpto?: string;
  todayKey: string;
}): VerificationChecks {
  const formatOk = input.kind === "fssai" ? fssaiFormatOk(input.extractedNumber) : ngoIdFormatOk(input.extractedNumber);
  return {
    formatOk,
    numberMatches: numbersMatch(input.typedNumber, input.extractedNumber, input.kind),
    // NGO registrations often have no expiry: treat a missing date as OK for NGOs only.
    notExpired: input.kind === "ngo" && !input.validUpto ? true : notExpired(input.validUpto, input.todayKey),
    nameMatches: nameSimilarity(input.businessName, input.extractedName) >= 0.5,
  };
}
