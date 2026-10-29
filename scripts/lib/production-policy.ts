import { hasRequiredReviewers } from "./deployment";

type PolicyAccess = {
  eventName?: string;
  ref?: string;
  repository?: string;
  policyReadToken?: string;
};

/**
 * A protected credential with repository Administration (read) is required.
 * The ordinary Actions GITHUB_TOKEN cannot access this endpoint. Never fall back
 * to it or infer approval from an environment name alone.
 */
export async function verifyProductionPolicy(
  access: PolicyAccess,
  request: typeof fetch = fetch,
): Promise<void> {
  if (access.eventName !== "workflow_dispatch" || access.ref !== "refs/heads/main") {
    throw new Error("Production requires a manual main-branch release");
  }
  if (
    !access.repository ||
    !/^[a-zA-Z0-9][a-zA-Z0-9-]*\/[\w.-]+$/.test(access.repository) ||
    [".", ".."].includes(access.repository.split("/")[1]) ||
    !access.policyReadToken
  ) {
    throw new Error("Missing protected repository policy access");
  }
  const response = await request(
    `https://api.github.com/repos/${access.repository}/environments/production`,
    {
      headers: {
        Authorization: `Bearer ${access.policyReadToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok || !hasRequiredReviewers(await response.json())) {
    throw new Error("Production environment must have configured required reviewers");
  }
}
