// Seeds demo data. Default: in-memory dev store file. For Firestore:
//   DATA_BACKEND=firestore GOOGLE_CLOUD_PROJECT=<id> npm run seed -- --yes
import { seedDemo } from "../src/server/seed";
import { getStore } from "../src/server/store";

async function main() {
  const backend = process.env.DATA_BACKEND ?? "memory";
  if (backend === "firestore" && !process.argv.includes("--yes")) {
    console.error(`This writes demo data into Firestore project ${process.env.GOOGLE_CLOUD_PROJECT}. Re-run with --yes to confirm.`);
    process.exit(1);
  }
  await seedDemo(getStore());
  await new Promise((r) => setTimeout(r, 500)); // let the memory store flush to disk
  console.log(`Demo data seeded (${backend}).`);
}
main().catch((e) => { console.error(e); process.exit(1); });
