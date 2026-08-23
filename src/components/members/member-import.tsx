"use client";

import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/glass/glass";
import { EmptyState, ErrorState, LoadingState, Skeleton } from "@/components/glass/states";

/**
 * The member import UI (Phase 13, §23).
 *
 * PREVIEW, THEN CONFIRM. Nothing is written until the operator has seen a count of what
 * would be created, what would be skipped, and exactly which line each problem is on.
 * Importing three hundred people is not undoable through the interface, so the interface
 * must not make it a single click on a file the operator has not been shown.
 *
 * THE FILE IS SENT TWICE, AND THAT IS ON PURPOSE. The confirm step re-uploads the same
 * bytes rather than posting the rows the preview returned, because a client that can post
 * a row list can post rows the preview never produced. The server re-parses and re-decides
 * from the file; this component holds the text only so the user does not have to pick it
 * again.
 */

interface PreviewRow {
  line: number;
  status: "VALID" | "INVALID" | "DUPLICATE";
  errors: string[];
  raw: Record<string, string>;
}

interface Preview {
  rows: PreviewRow[];
  valid: number;
  invalid: number;
  duplicates: number;
  fileErrors: string[];
  maxRows: number;
  tooManyRows: boolean;
}

interface ImportOutcome {
  created: number;
  alreadyExisted: string[];
  skippedInvalid: number;
  skippedDuplicate: number;
}

type Phase =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "previewed"; fileName: string; text: string; preview: Preview }
  | { kind: "importing"; fileName: string }
  | { kind: "done"; outcome: ImportOutcome }
  | { kind: "error"; message: string };

async function errorFrom(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}

/** The problem rows, capped. Three hundred error lines is not a review, it is a wall. */
const PROBLEMS_SHOWN = 25;

export function MemberImport({ onImported }: { onImported?: () => void }) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  async function handleFile(file: File) {
    setPhase({ kind: "reading" });

    try {
      const text = await file.text();
      const response = await fetch("/api/members/import/preview", {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: text,
      });

      if (!response.ok) {
        setPhase({
          kind: "error",
          message: await errorFrom(response, "That file could not be read."),
        });
        return;
      }

      setPhase({
        kind: "previewed",
        fileName: file.name,
        text,
        preview: (await response.json()) as Preview,
      });
    } catch {
      setPhase({ kind: "error", message: "That file could not be read." });
    } finally {
      // Cleared so re-choosing the SAME file after a fix still fires `change`.
      if (input.current) input.current.value = "";
    }
  }

  async function confirmImport(fileName: string, text: string) {
    setPhase({ kind: "importing", fileName });

    try {
      const response = await fetch("/api/members/import", {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: text,
      });

      if (!response.ok) {
        setPhase({
          kind: "error",
          message: await errorFrom(response, "The import could not be completed."),
        });
        return;
      }

      setPhase({ kind: "done", outcome: (await response.json()) as ImportOutcome });
      onImported?.();
    } catch {
      setPhase({ kind: "error", message: "The import could not be completed." });
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={inputId} className="text-sm font-medium text-foreground">
          Member list (CSV)
        </label>
        <p className="type-meta mt-1 text-muted-foreground">
          Columns: <code>email</code>, <code>full_name</code>, and optionally{" "}
          <code>phone</code> and <code>locale</code>. Everyone is invited, not activated —
          each person still signs in for themselves.
        </p>

        <input
          ref={input}
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />

        <Button
          type="button"
          variant="outline"
          className="mt-3"
          disabled={phase.kind === "reading" || phase.kind === "importing"}
          onClick={() => input.current?.click()}
        >
          Choose a file
        </Button>
      </div>

      {phase.kind === "reading" && (
        <LoadingState label="Checking the file">
          <Skeleton className="h-24 w-full" />
        </LoadingState>
      )}

      {phase.kind === "importing" && (
        <LoadingState label={`Importing ${phase.fileName}`}>
          <Skeleton className="h-24 w-full" />
        </LoadingState>
      )}

      {phase.kind === "error" && (
        <ErrorState
          title="That did not work"
          message={phase.message}
          retry={
            <Button type="button" variant="outline" onClick={() => setPhase({ kind: "idle" })}>
              Try another file
            </Button>
          }
        />
      )}

      {phase.kind === "previewed" && (
        <PreviewReport
          preview={phase.preview}
          fileName={phase.fileName}
          onConfirm={() => void confirmImport(phase.fileName, phase.text)}
          onCancel={() => setPhase({ kind: "idle" })}
        />
      )}

      {phase.kind === "done" && <Outcome outcome={phase.outcome} />}
    </div>
  );
}

function PreviewReport({
  preview,
  fileName,
  onConfirm,
  onCancel,
}: {
  preview: Preview;
  fileName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (preview.fileErrors.length > 0) {
    // A file-level problem — a missing column — would otherwise repeat itself on every
    // row, and three hundred identical messages hide the one fact that matters.
    return (
      <ErrorState
        title="That file is missing something"
        message={preview.fileErrors.join(" ")}
        retry={
          <Button type="button" variant="outline" onClick={onCancel}>
            Choose another file
          </Button>
        }
      />
    );
  }

  if (preview.rows.length === 0) {
    return (
      <EmptyState
        title="Nothing to import"
        reason={`${fileName} has a header row but no members below it.`}
      />
    );
  }

  const problems = preview.rows.filter((row) => row.status !== "VALID");

  return (
    <GlassPanel className="space-y-4 p-5">
      <div>
        <h3 className="type-heading text-foreground">Before anything is created</h3>
        <p className="type-meta mt-1 text-muted-foreground">{fileName}</p>
      </div>

      <dl className="grid grid-cols-3 gap-4">
        <Count label="Will be invited" value={preview.valid} tone="foreground" />
        <Count label="Has an error" value={preview.invalid} tone="destructive" />
        <Count label="Repeated in file" value={preview.duplicates} tone="muted" />
      </dl>

      {preview.tooManyRows && (
        <p className="text-sm text-destructive">
          This file has {preview.valid} members and the limit is {preview.maxRows}. Split
          it and import it in parts.
        </p>
      )}

      {problems.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-foreground">
            {problems.length} row{problems.length === 1 ? "" : "s"} will be skipped
          </h4>

          {/* Wide content scrolls inside its own box rather than the page. */}
          <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Rows that will not be imported, with the reason for each
              </caption>
              <thead className="sticky top-0 bg-surface/95 backdrop-blur">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Line
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Email
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Why
                  </th>
                </tr>
              </thead>
              <tbody>
                {problems.slice(0, PROBLEMS_SHOWN).map((row) => (
                  <tr key={row.line} className="border-t border-border align-top">
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {row.line}
                    </td>
                    <td className="px-3 py-2 break-all">{row.raw.email || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.errors.join(" ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {problems.length > PROBLEMS_SHOWN && (
            <p className="type-meta mt-2 text-muted-foreground">
              Showing the first {PROBLEMS_SHOWN} of {problems.length}. Fix these and check
              the file again to see the rest.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={onConfirm}
          disabled={preview.valid === 0 || preview.tooManyRows}
        >
          Invite {preview.valid} member{preview.valid === 1 ? "" : "s"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      {preview.valid === 0 && (
        <p className="text-sm text-muted-foreground">
          No row in this file can be imported yet.
        </p>
      )}
    </GlassPanel>
  );
}

function Count({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "foreground" | "destructive" | "muted";
}) {
  const color =
    tone === "destructive"
      ? "text-destructive"
      : tone === "muted"
        ? "text-muted-foreground"
        : "text-foreground";

  return (
    <div>
      <dt className="type-meta text-muted-foreground">{label}</dt>
      <dd className={`type-metric ${color}`}>{value}</dd>
    </div>
  );
}

function Outcome({ outcome }: { outcome: ImportOutcome }) {
  return (
    <GlassPanel className="space-y-3 p-5" role="status" aria-live="polite">
      <h3 className="type-heading text-foreground">
        {outcome.created} member{outcome.created === 1 ? "" : "s"} invited
      </h3>

      {outcome.alreadyExisted.length > 0 && (
        <div>
          <p className="text-sm text-muted-foreground">
            {outcome.alreadyExisted.length} address
            {outcome.alreadyExisted.length === 1 ? "" : "es"} already belonged to someone
            here and {outcome.alreadyExisted.length === 1 ? "was" : "were"} left alone:
          </p>
          <ul className="mt-2 max-h-40 overflow-auto text-sm text-muted-foreground">
            {outcome.alreadyExisted.map((email) => (
              <li key={email} className="break-all">
                {email}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(outcome.skippedInvalid > 0 || outcome.skippedDuplicate > 0) && (
        <p className="text-sm text-muted-foreground">
          {outcome.skippedInvalid} row{outcome.skippedInvalid === 1 ? "" : "s"} had errors
          and {outcome.skippedDuplicate} {outcome.skippedDuplicate === 1 ? "was" : "were"}{" "}
          repeated in the file. Neither was imported.
        </p>
      )}

      <p className="type-meta text-muted-foreground">
        Everyone imported is invited, not active. Each person activates their own account
        by signing in.
      </p>
    </GlassPanel>
  );
}
