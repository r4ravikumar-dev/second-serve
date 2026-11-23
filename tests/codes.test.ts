import { describe, expect, it } from "vitest";
import { codeMatches, decryptCode, encryptCode, generateCode, hashCode, normalizeCode } from "@/server/codes";
import { createSessionToken, verifySessionToken } from "@/server/auth";

describe("pickup codes", () => {
  it("are 6 unambiguous characters", () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
  });
  it("hash is bound to the record id", () => {
    const h = hashCode("res_1", "ABC234");
    expect(codeMatches("res_1", "abc 234", h)).toBe(true);
    expect(codeMatches("res_2", "ABC234", h)).toBe(false);
    expect(codeMatches("res_1", "ABC235", h)).toBe(false);
  });
  it("encrypts and decrypts; tampering fails closed", () => {
    const blob = encryptCode("XYZ789");
    expect(decryptCode(blob)).toBe("XYZ789");
    expect(decryptCode(blob.slice(0, -2) + "AA")).toBeNull();
    expect(decryptCode(undefined)).toBeNull();
  });
  it("normalizes input", () => expect(normalizeCode(" ab-c 2 3 4 ")).toBe("ABC234"));
});

describe("session tokens", () => {
  it("round-trip and expire", () => {
    const tok = createSessionToken("u1", 1000);
    expect(verifySessionToken(tok, 2000)).toBe("u1");
    expect(verifySessionToken(tok, 1000 + 8 * 24 * 3600 * 1000)).toBeNull();
  });
  it("reject tampering", () => {
    const [p, s] = createSessionToken("u1").split(".");
    const forged = Buffer.from(JSON.stringify({ uid: "admin", exp: Date.now() + 1e9 })).toString("base64url");
    expect(verifySessionToken(`${forged}.${s}`)).toBeNull();
    expect(verifySessionToken(`${p}.x`)).toBeNull();
    expect(verifySessionToken("garbage")).toBeNull();
  });
});
