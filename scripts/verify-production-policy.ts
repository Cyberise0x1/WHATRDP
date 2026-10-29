import { verifyProductionPolicy } from "./lib/production-policy";

async function main() {
  await verifyProductionPolicy({
    eventName: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF,
    repository: process.env.GITHUB_REPOSITORY,
    policyReadToken: process.env.PRODUCTION_POLICY_READ_TOKEN,
  });
  console.log("Verified the production environment has required reviewers.");
}
main().catch(() => {
  console.error(
    "Production policy check failed. Configure required reviewers and a protected PRODUCTION_POLICY_READ_TOKEN with repository Administration read access.",
  );
  process.exitCode = 1;
});
