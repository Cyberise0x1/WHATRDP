import { exportOrders } from "./export-orders";

const [flag, source, output] = process.argv.slice(2);
if (flag !== "--offline-copy" || !source || !output) {
  console.error("Usage: npm run orders:export -- --offline-copy /path/to/offline-copy.db generated-artifacts/orders.sql");
  process.exitCode = 1;
} else {
  exportOrders(source, output).then(
    (count) => console.log(`Exported ${count} orders. Output contains sensitive data; keep it private.`),
    () => { console.error("Export failed; verify source copy, output location and schema. No import was performed."); process.exitCode = 1; },
  );
}
