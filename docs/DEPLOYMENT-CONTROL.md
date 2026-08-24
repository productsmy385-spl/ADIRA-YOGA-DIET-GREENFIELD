# Deployment control

How a change reaches production, what is wrong with that today, and what to do about it.

**Nothing in this document has been applied.** Every change listed needs explicit approval,
and several need account-level access this environment does not have.

---

## 1. What happens today

```
git push origin main
      ↓            (no review, no green CI required)
Railway deployment trigger  3c692add-6496-486b-b9af-15916f578df1
      ↓            branch: main · repo: productsmy385-spl/ADIRA-YOGA-DIET-GREENFIELD
      ↓            checkSuites: false        ← CI IS NOT WAITED FOR
build (NIXPACKS, npm run build)
      ↓
preDeployCommand: npm run migrate            ← PRODUCTION SCHEMA CHANGES HERE
      ↓
new container starts, healthcheck /api/health
```

Two separate weaknesses, and they compound:

**A single push migrates production.** There is no gate between "a commit exists on main"
and "the production schema changed".

**`checkSuites: false`.** `.github/workflows/ci.yml` runs lint, typecheck, tests and build
on push to `main` — and Railway does not wait for it. A push that fails CI deploys anyway;
CI merely reports the failure afterwards, next to a running deployment of the same commit.
This is the cheapest and highest-value thing to fix.

## 2. Options

`preDeployCommand: npm run migrate` is what makes a deploy impossible against an unmigrated
database — the direct fix for a recorded incident where migrations silently did not run on
deploy (ADR-006). **Any option that separates migration from deployment gives that back**,
and it is not a good trade.

| | push ≠ deploy | ADR-006 preserved | CI gates deploy | Effort |
|---|---|---|---|---|
| **A.** protected main + auto-deploy | no — merge deploys | ✅ | no | low |
| **A+.** A, plus `checkSuites: true` | no — merge deploys | ✅ | ✅ | low |
| **B.** protected main + controlled migration | ✅ | ❌ **lost** | no | medium |
| **C.** manual production deployment | ✅ | ✅ | n/a | low |
| **D.** manual migration, then deploy | ✅ | ❌ **lost** | no | high |

### Why B and D are rejected

Both remove `preDeployCommand` so migrations can be run deliberately. Both therefore permit
a deployment to start against a database that has not been migrated — the application boots,
casts to an enum label that does not exist yet, and returns 500s that name nothing useful.
That is precisely the failure ADR-006 exists to prevent, and it is worse than the problem
being solved: an accidental migration is visible and recoverable, a silently unmigrated
deployment is neither.

D additionally makes the operator responsible for ordering, which is the part machines are
good at.

### Recommendation — **A+ now, C when you want a hard stop**

**A+** is two small changes and removes the sharp edge:

1. Branch protection on `main`: require a pull request, require the `CI` check to pass, and
   disallow direct pushes. The repository is **public** and owned by a **User** account, so
   classic branch protection is available at no cost.
2. Set `checkSuites: true` on the Railway trigger, so a deployment waits for GitHub checks
   to succeed.

Together: a change reaches production only via a reviewed PR whose CI is green, and Railway
refuses to deploy a commit whose checks failed. Migrations stay atomic with the deploy.

**C** goes further — delete the deployment trigger, and deploy explicitly. Worth doing if
you want "merged" and "released" to be genuinely different events. It costs a manual step
and the discipline to remember it. My suggestion is to adopt A+ immediately and decide about
C once the PR flow has settled, rather than changing both at once.

Staging should keep auto-deploy either way; fast feedback is what it is for.

## 3. Exactly what to change, and who can do it

| # | Change | Where | Needs |
|---|---|---|---|
| 1 | Require PR + passing `CI` on `main`, block direct push | GitHub → Settings → Branches | **Your account.** `gh` is not installed here and this environment has no GitHub credentials. |
| 2 | `checkSuites: true` on trigger `3c692add-…` | Railway | Your approval; I can run it |
| 3 | *(optional, C)* delete trigger `3c692add-…` | Railway | Your approval; I can run it |
| 4 | Add `pull_request` gating to CI if not already required | `.github/workflows/ci.yml` | Already runs on `pull_request` |

For #2, the API call is:

```bash
railway api 'mutation($id:String!,$input:DeploymentTriggerUpdateInput!){
  deploymentTriggerUpdate(id:$id, input:$input){ id checkSuites }
}' --var id=3c692add-6496-486b-b9af-15916f578df1 --var input='{"checkSuites":true}'
```

**Not run.**

## 4. Backup strategy — long term

Current position: Railway volume snapshots are **unavailable on this plan**
(`volumes.maxBackupsCount: 0`, `subscriptionModel: USER`); PITR is disabled; one verified
`pg_dump` archive exists at `.baseline/pre-006-008.dump` and **its restore has never been
tested**.

| Option | Gets you | Cost / caveat |
|---|---|---|
| **Railway plan upgrade** | native volume snapshots + PITR | money; the least work; the provider handles retention |
| **Scheduled `pg_dump` to external storage** | portable, provider-independent archives | needs a secret store and somewhere off-Railway to put them; dumps contain personal data and must be encrypted at rest |
| **PITR when appropriate** | continuous recovery to any instant | enabling it redeploys Postgres; do it in a quiet window, never during a migration |
| **Recovery testing** | the only thing that turns a backup into a restore | needs a database to restore *into* — which is the throwaway database the project has chosen not to keep |

The honest ranking: a plan upgrade plus PITR is the smallest amount of work for the largest
reduction in risk, and it makes the recovery test possible by giving you somewhere to
restore to. Scheduled `pg_dump` is a reasonable stopgap and is strictly better than nothing,
but an untested dump is a hope, and it will stay a hope until there is a place to practise.

**None of this has been changed.** No plan upgrade, no PITR, no scheduled job.

## 5. Incident record — deployment of `8250a9b`

Recorded because the control weakness is real regardless of intent, and future sessions
should be able to read what happened.

| | |
|---|---|
| Commit | `8250a9ba2686367544ae13a96dcaebe5718d49f3` |
| Pushed | 2026-08-24, `3511d70..8250a9b` → `origin` **only** |
| `oldorigin` | untouched — still at `9b302e8` |
| Range | 30 commits, from two working sessions |
| Migrations executed | 006, 007, 008 |
| Result | as rehearsed; diff against the 005 baseline was exactly the seven predicted changes |
| Data loss | none — `audit_logs` 54 → 54, sessions 2/1 unchanged, Foundation programme intact |

**Why the push happened.** It was made deliberately, by this session, on an instruction that
read `Yes, push and deploy to production now.` given without qualification. The immediately
preceding turn had been *held* precisely because its approval was conditional
(`If you are ready to deploy…`), and the reply removed that conditional and supplied the
approval wording. No attempt was made to infer approval from silence or from context.

**What the incident actually demonstrates** is not a mistaken instruction but a missing
control: at the moment of that push, nothing in the system required review, a green CI run,
or a second decision before the production schema changed. That would have been equally true
for any push by anyone, and it is what §2 fixes.

## 6. Not done, deliberately

- No rollback of 006/007/008. They applied correctly and production matches the rehearsal.
- No compensating migration. There is no defect to compensate for.
- No further pushes.
- No infrastructure changes of any kind.
