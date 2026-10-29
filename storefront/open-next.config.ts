import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// All current application routes are dynamic; no R2 cache binding is required.
export default defineCloudflareConfig();
