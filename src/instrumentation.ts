// Runs once when the Next.js server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertSafeConfig, config } = await import("./server/config");
  assertSafeConfig();
  if (config.dataBackend === "memory") {
    const { getStore } = await import("./server/store");
    const { MemoryStore } = await import("./server/store/memory");
    const store = getStore();
    if (store instanceof MemoryStore && store.isEmpty()) {
      const { seedDemo } = await import("./server/seed");
      await seedDemo(store);
      console.log("Seeded demo data into the in-memory store (.data/dev-db.json)");
    }
  }
}
