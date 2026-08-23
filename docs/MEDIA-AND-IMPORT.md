# Media and bulk import

Two operator-facing paths that both accept a file from a browser, and both have the same
shape of danger: what the client says about the file is not what the file is.

Owning documents: `docs/SECURITY.md` for the threat model, `decisions/ADR-004` for tenant
scope, `decisions/ADR-013` for administrative reach versus member data reach. This file
records how those apply to uploads, and nothing that is already stated there.

---

## 1. Media upload (Phase 12)

### The path

```
browser                      Adira server                    ImageKit
   │                              │                              │
   ├── POST /api/media/upload-auth ─────►                        │
   │        purpose, customerId,  │  authorise, then sign        │
   │        claimed mime + bytes  │                              │
   │   ◄─── token, expire, signature, publicKey, folder          │
   │                              │                              │
   ├── POST the bytes ────────────────────────────────────────►  │
   │   ◄─── fileId ───────────────────────────────────────────   │
   │                              │                              │
   ├── POST /api/media/record ────►                              │
   │        fileId only           ├── GET /v1/files/{id}/details ►│
   │                              │   ◄── url, mime, size, dims   │
   │                              │  authorise AGAIN, then INSERT │
   │   ◄─── media id ─────────────                               │
```

The bytes never touch this server. Routing them through it would double the bandwidth and
the latency on the mobile connection a customer photographs their progress on, for no gain.

### What is trusted, and what is not

| Value | Source at record time | Why |
|---|---|---|
| `fileId` | the client | The only thing it can honestly report. Useless on its own. |
| `url`, `mime`, `size`, `width`, `height` | ImageKit, re-read server-side | Everything the client could claim is re-derived from the storage provider. |
| `organization_id` | the session | ADR-004. An import or upload cannot name its own tenant. |
| `customer_id` | the request, **after** `resolveMemberAccess` | Named by the caller, then authorised against their reach. |
| folder prefix | the session | A client-chosen folder would let one tenant write into another's prefix. |
| `requires_signed_url` | the purpose | Decided in `media.ts`, not per call site, so a new upload path cannot forget. |

`validateUploadRequest` runs **twice**: once before the upload against the client's claim,
for a fast comprehensible error, and once after against what ImageKit actually stored. A
caller who declares a 2 MB JPEG and uploads a 40 MB TIFF is caught by the second only.

`fetchUploadedFile` also asserts the returned URL begins with our configured endpoint.
ImageKit would not return anything else — but the value is about to be stored and later
rendered in a consultant's browser, and a stored URL pointing somewhere unexpected is the
difference between a bug and a content-injection vector.

### Two questions, not one

`src/server/media/upload-policy.ts` exists because media splits in two and the halves are
governed by different questions:

- **`exercise`, `meal`** — library content shared by the whole organization. The question
  is administrative: `canManageOrganization`.
- **`progress_photo`, `avatar`** — media about an identifiable member, and therefore health
  data. The question is data reach over that one member: `resolveMemberAccess`, which under
  ADR-013 is assignment-scoped for an ADMIN and self-only for a USER.

`requireRole("ADMIN")` is the correct gate for the first and completely the wrong one for
the second. Passing it says the caller may administer the organization — never that they
may see this member's body.

A customer id supplied alongside a library purpose is **dropped**, not honoured. Honouring
it would attach an organization-wide asset to one member's record on the strength of an
administrative check that never considered that member.

### The membership oracle

`UNKNOWN_MEMBER` and `MEMBER_NOT_ALLOWED` return an identical 404 with an identical
message. The difference between "no such member" and "a member you may not touch" is
exactly what an attacker probes for; answering it turns the endpoint into a membership
oracle for another consultant's caseload. `upload-policy.test.ts` asserts the two responses
stay equal — the property is easy to break by "improving" an error message.

### Configuration

Three keys, all required together, none of them `NEXT_PUBLIC_`:

```
IMAGEKIT_PUBLIC_KEY=
IMAGEKIT_PRIVATE_KEY=
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your_id
```

The public key is not secret, but it is handed to the browser in the upload-auth
**response** rather than inlined at build time. `NEXT_PUBLIC_*` is substituted during the
build, which would pin one build to one ImageKit account and stop staging differing from
production without a rebuild.

Absent configuration produces a 503 with a plain message, not a failure part-way through an
upload with an opaque provider error.

**If `IMAGEKIT_PRIVATE_KEY` ever appears in a client component, a response body, or a
`NEXT_PUBLIC_` variable, that is a full compromise of the media account.**

---

## 2. Bulk member import (Phase 13, §23)

### Preview, then confirm

```
choose file → POST /preview → operator reads the report → POST /import
                (writes nothing)                            (one transaction)
```

The preview classifies every row and reports **all** problems, not the first. Someone
importing three hundred members needs to fix their spreadsheet in one pass; an importer
that stops at row 3 and makes them re-upload is one they work around by splitting the file,
which is worse than the problem it avoids.

Line numbers in the report are the **file's** line numbers, so they match what the operator
sees in their spreadsheet.

### The file is sent twice, deliberately

The confirm step re-uploads the same bytes and the server re-parses them. It does **not**
post the rows the preview returned. A client that can post a row list can post rows the
preview never produced — with a role, a status, or an organization of its choosing.
Re-deriving costs milliseconds and removes the whole category.

`member-import.test.tsx` asserts the confirm request body is the raw CSV. That assertion is
the guard: a refactor to "send the parsed rows, it's already validated" would look like a
performance improvement and every server test would still pass.

### What an import can and cannot do

- Role is `USER` and status is `INVITED`. **Neither is a parameter anywhere in the path.**
  "Import three hundred administrators" is not one field away from a spreadsheet, and an
  imported account cannot sign in until someone proves they control the address.
- An address that already belongs to a member of this organization is **left alone**. An
  import never overwrites.
- At most `MAX_IMPORT_ROWS` (300) rows, and at most 2 MB of file.

### Atomicity

One transaction, in `src/server/repositories/member-import.ts`. Row-at-a-time across three
hundred round trips leaves a half-imported organization behind whenever the connection
drops mid-run, with no way to tell which rows landed and no recourse but to re-upload and
hope the duplicate handling is right.

Collisions use `ON CONFLICT ON CONSTRAINT users_email_unique_per_org DO NOTHING` rather
than catching `23505`. Inside a transaction a constraint violation aborts the whole
transaction, so catching per row would need a `SAVEPOINT` per row and would give up the
single statement entirely. Which rows collided is then found by **subtraction** — whatever
did not come back in `RETURNING` was already there.

Why its own module rather than `users.ts`: `createUser` lets a unique violation propagate,
which is right for a form where the collision *is* the answer and wrong for an import that
must survive one.

### The body reader

`src/app/api/members/import/body.ts`, shared by both endpoints so the limit cannot be
enforced on the preview and forgotten on the write — which is the version of the bug that
matters, since the preview is the harmless one.

- 2 MB cap, checked against `content-length` **and** again after reading. The header is a
  claim and a chunked request has none, so trusting it alone leaves the limit unenforced
  exactly when it is being evaded.
- `TextDecoder("utf-8", { fatal: true })`, so a mis-encoded export fails with a message
  instead of importing names full of replacement characters.

### The audit record

Counts, never addresses. A log listing three hundred email addresses is a second copy of
the member roster, and audit rows outlive the accounts they describe.

### The template

Generated from `IMPORT_TEMPLATE_HEADERS` — the same list the parser requires — so the file
an operator downloads cannot drift into one the importer rejects. A test parses the
generated template to hold that closed.

`toCsv` neutralises formula injection on every export: a value beginning `=`, `+`, `-`, or
`@` is treated as a formula by Excel and Sheets, so a member whose note reads
`=HYPERLINK("http://evil","click")` would otherwise become a live link in whatever a
consultant opens the export with.

---

## Known limits

- **No virus scanning.** Uploads are images from an authenticated staff member or customer,
  constrained to four raster formats and re-verified server-side. If media ever accepts
  documents, this needs revisiting before it does.
- **The preview cannot report existing addresses.** That answer lives in the database and
  would be stale the moment somebody else adds a member, so it is reported after the import
  rather than promised before it.
- **The row cap is a bound on blast radius, not a performance limit.** Raising it means
  re-reading the chunk comment in `member-import.ts`, not just changing the number.
