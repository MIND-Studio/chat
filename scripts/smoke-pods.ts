/**
 * Verify the CSS instance is reachable and both demo pods are seeded.
 * Usage: npm run smoke:pods
 */

const TARGETS = [
  { name: "css-root", url: "http://localhost:3031/" },
  { name: "alice-pod", url: "http://localhost:3031/alice/" },
  { name: "bob-pod", url: "http://localhost:3031/bob/" },
  { name: "alice-profile", url: "http://localhost:3031/alice/profile/card" },
  { name: "bob-profile", url: "http://localhost:3031/bob/profile/card" },
  {
    name: "storage-desc",
    url: "http://localhost:3031/alice/.well-known/solid",
  },
];

async function main(): Promise<void> {
  let failed = 0;
  for (const t of TARGETS) {
    try {
      const res = await fetch(t.url);
      const ok = res.ok;
      console.log(`${ok ? "✓" : "✗"} ${t.name.padEnd(15)} ${res.status} ${t.url}`);
      if (!ok) failed++;
    } catch (err) {
      console.log(`✗ ${t.name.padEnd(15)} ERR ${t.url} — ${(err as Error).message}`);
      failed++;
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} target(s) failed. Is docker compose up?`);
    process.exit(1);
  }
  console.log("\nall targets healthy.");
}

main();
