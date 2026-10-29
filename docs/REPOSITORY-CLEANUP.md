# Repository cleanup map

| Previous item                                                                                         | Treatment                                                                                    |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `storefront/src`, migrations and runtime/build configs                                                | Moved to repository root; callers/test paths updated                                         |
| Two package manifests and a workspace wrapper                                                         | Consolidated into one root application/lockfile                                              |
| Flat test folder                                                                                      | Split into unit, integration and test-only fixtures                                          |
| WHMCS PHP modules and hosting comparison guides                                                       | Removed from the distributable tree                                                          |
| Legacy card gateway SDK/routes/config/mocks                                                           | Removed; internal provider-neutral payment checks retained                                   |
| Historical payment field                                                                              | Preserved in immutable baseline/additive migration and read-only exporter compatibility only |
| Session transcript, `.commandcode/` settings/taste files, operational journals/state and `WORKLOG.md` | Untracked and ignored; original local files preserved                                        |
| Old root hosting/launch research and old agent prompt                                                 | Untracked local originals; maintained guidance consolidated into README/docs/AGENTS          |
| `storefront/` local build/emulator/database state, uploaded originals                                 | Left in place and ignored, not deleted or migrated                                           |
| Historical decisions and durable project scope                                                        | Retained under `.agents/memory/`; no Git-history rewrite                                     |
| GitHub delivery                                                                                       | Credential-free checks plus separately guarded staging/manual production definitions         |

## Intentional boundaries

No framework replacement, major Next upgrade, gateway implementation, real data
migration, remote resource creation or production deployment occurred. Existing
database migration files retain their original contents; new compatibility work
is forward-only.

GitHub workflow syntax/policy checks and local runtime verification do not
constitute a successful remote CI run or cloud deployment. See the test plan and
deployment guide for external acceptance still required.
