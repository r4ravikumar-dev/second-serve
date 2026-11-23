// End-to-end smoke test against the running dev server, using separate cookie sessions.
const B = "http://localhost:3000";
const jars = {};
async function req(who, method, path, body, origin = B) {
  const res = await fetch(B + path, {
    method,
    headers: { "Content-Type": "application/json", Origin: origin, Cookie: jars[who] ?? "" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get("set-cookie");
  if (set) jars[who] = set.split(";")[0];
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const login = (who, id) => req(who, "POST", "/api/session", { devUserId: id });
let pass = 0, fail = 0;
const check = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

await login("m", "demo_staff_bakery");
await login("c", "demo_customer");
await login("n", "demo_ngo_member");
await login("m2", "demo_staff_cafe");
await login("a", "demo_admin");
await login("new", "demo_newcomer");

// 1 Hinglish stock update -> proposals (not applied)
let r = await req("m", "POST", "/api/stock/voice", { text: "बारह croissant बचे, 4 muffin" });
check("Hinglish text update proposes 2 changes", r.status === 200 && r.data.proposals?.length === 2, JSON.stringify(r.data.proposals?.map((p) => `${p.name}:${p.current}->${p.proposed}`)));
r = await req("m", "POST", "/api/stock/apply", { updates: r.data.proposals.map((p) => ({ stockItemId: p.stockItemId, setRemaining: p.proposed })) });
check("Apply confirmed proposals", r.status === 200);

// 2 Rescue from stock -> draft
const stock = (await req("m", "GET", "/api/stock")).data;
const cro = stock.items.find((i) => i.nameEn.includes("croissant"));
check("Croissant remaining is 12 after update", cro.remaining === 12, String(cro.remaining));
r = await req("m", "POST", "/api/surplus", { source: "stock", selected: [{ stockItemId: cro.id, qty: 6 }] });
check("Draft created from stock", r.status === 200 && r.data.items?.length === 1, `model=${r.data.model}`);
const draftId = r.data.id;

const now = Date.now();
const approval = (price) => ({
  channel: "sell", title: "Croissant pack", category: "bakery", vegMark: "egg", packs: 3,
  originalPricePerPack: 180, pricePerPack: price, items: [{ stockItemId: cro.id, name: "Butter croissant", qtyPerPack: 2 }],
  allergensConfirmed: ["gluten", "dairy", "egg"], allergenCheckDone: true, preparedAt: now - 3600_000, storage: "ambient",
  pickupStart: now, pickupEnd: now + 3600_000,
});
r = await req("m", "POST", `/api/surplus/${draftId}`, approval(10));
check("Price below 20% floor rejected", r.status === 400 && r.data.error === "price_out_of_bounds");
r = await req("m", "POST", `/api/surplus/${draftId}`, { ...approval(80), allergenCheckDone: false });
check("Missing allergen confirmation rejected", r.status === 400);
r = await req("m", "POST", `/api/surplus/${draftId}`, approval(80));
check("Approve & publish", r.status === 200 && r.data.kind === "offer");
const offerId = r.data.id;
r = await req("m", "POST", `/api/surplus/${draftId}`, approval(80));
check("Draft can't be approved twice", r.status === 409);
const stock2 = (await req("m", "GET", "/api/stock")).data.items.find((i) => i.id === cro.id);
check("Stock reduced by 6 (3 packs × 2)", stock2.remaining === 6, String(stock2.remaining));

// 3 Customer discovery + reservation
r = await req("c", "GET", "/api/offers?lat=12.9352&lng=77.6245&radiusKm=5");
check("Customer sees the new offer nearby", r.data.some?.((o) => o.id === offerId));
check("Public offer has no private fields", r.data.every?.((o) => !("safetyAttestation" in o) && !("merchantId" in o)));
r = await req("c", "POST", "/api/reservations", { offerId, qty: 2 });
check("Customer reserves 2", r.status === 200 && /^[A-Z0-9]{6}$/.test(r.data.code));
const code = r.data.code;
r = await req("c", "POST", "/api/reservations", { offerId, qty: 2 });
check("Can't over-reserve (only 1 left)", r.status === 409, r.data.error);
r = await req("c", "GET", "/api/reservations");
check("Customer can see their code again", r.data[0]?.code === code);

// 4 Counter
r = await req("m", "POST", "/api/pickups", { code: "ZZZZZZ" });
check("Wrong code rejected", r.status === 400 && r.data.error === "wrong_code");
r = await req("m2", "POST", "/api/pickups", { code });
check("Another merchant can't redeem the code", r.status === 400);
r = await req("m", "POST", "/api/pickups", { code });
check("Correct code collects, amount due ₹160", r.status === 200 && r.data.amountDue === 160, JSON.stringify(r.data));
r = await req("m", "POST", "/api/pickups", { code });
check("Code can't be reused", r.status === 400 || r.status === 409);

// 5 Authorization + CSRF
r = await req("c", "GET", "/api/stock");
check("Customer blocked from merchant API", r.status === 403);
r = await req("c", "POST", "/api/reservations", { offerId, qty: 1 }, "https://evil.example");
check("Cross-origin POST blocked", r.status === 403);
r = await req("anon", "GET", "/api/reservations");
check("Anonymous blocked", r.status === 401);
r = await req("c", "POST", "/api/reservations", { offerId: "x".repeat(65), qty: 1 });
check("Bad input rejected with 400", r.status === 400);

// 6 Donation flow
r = await req("n", "POST", "/api/donations/demo_don_1", { action: "claim" });
check("NGO claims donation", r.status === 200 && r.data.code);
const hc = (await req("n", "GET", "/api/donations")).data.mine.find((d) => d.id === "demo_don_1")?.handoverCode;
r = await req("m2", "POST", "/api/donations/demo_don_1", { action: "handover", code: "AAAAAA" });
check("Wrong handover code rejected", r.status === 400);
r = await req("m2", "POST", "/api/donations/demo_don_1", { action: "handover", code: hc });
check("Café confirms handover", r.status === 200 && r.data.meals === 6);

// 7 Onboarding + verification + admin
r = await req("new", "POST", "/api/merchants", { name: "Chai Point Express", type: "cafe", address: "80 Feet Road, Koramangala", location: { lat: 12.94, lng: 77.62 }, pickupHours: { open: "07:00", close: "21:00" } });
check("Newcomer registers a business (pending)", r.status === 200 && r.data.verification.status === "pending");
r = await req("new", "GET", "/api/stock");
check("Unverified merchant can't use stock API", r.status === 403);
const up = await req("new", "POST", "/api/uploads", { kind: "licence", contentType: "application/pdf", size: 1234 });
await fetch(B + up.data.url, { method: "PUT", headers: { ...up.data.headers, Origin: B, Cookie: jars.new }, body: new Uint8Array(1234) });
r = await req("new", "POST", "/api/verification", { docPath: up.data.path, typedNumber: "12345678901234", mimeType: "application/pdf" });
check("Licence submitted → auto_checked with checks", r.status === 200 && r.data.status === "auto_checked" && r.data.checks.formatOk, JSON.stringify(r.data.checks));
r = await req("a", "GET", "/api/admin/verification");
const q = r.data.find?.((x) => x.name === "Chai Point Express");
check("Appears in admin queue", !!q);
r = await req("a", "POST", "/api/admin/verification", { kind: "merchant", id: q.id, approve: false });
check("Reject without reason refused", r.status === 400);
r = await req("a", "POST", "/api/admin/verification", { kind: "merchant", id: q.id, approve: true });
check("Admin approves", r.status === 200);
r = await req("new", "GET", "/api/stock");
check("Now verified merchant can use stock", r.status === 200);

// 8 Sweep + dashboard
r = await req("cron", "POST", "/api/cron/sweep");
check("Sweep runs (dev mode, no token)", r.status === 200, JSON.stringify(r.data));
r = await req("m", "GET", "/api/insights");
check("Dashboard shows recovered revenue ≥ 160", r.data.impact?.revenueRecovered >= 160, String(r.data.impact?.revenueRecovered));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
