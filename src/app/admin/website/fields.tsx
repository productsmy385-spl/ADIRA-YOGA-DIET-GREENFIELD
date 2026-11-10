"use client";

import { useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { MediaUpload } from "@/components/media/media-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Small, consistent form pieces for the website editor. Every field shows its character
 * limit (the same limit the server enforces in content.ts), and a problem reported by the
 * server for that field path is shown under it and linked with aria-describedby.
 */

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

export function TextField({
  label,
  value,
  onChange,
  max,
  error,
  placeholder,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  error?: string;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "url";
  hint?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {value.length}/{max}
        </span>
      </div>
      <Input
        id={id}
        type={type}
        value={value}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="mt-1.5"
      />
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  max,
  error,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  error?: string;
  rows?: number;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {value.length}/{max}
        </span>
      </div>
      <textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={max}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "mt-1.5 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "aria-invalid:border-destructive",
        )}
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
}

/** One collapsible editor section. Native <details>: keyboard and screen-reader ready. */
export function EditorSection({
  title,
  summary,
  defaultOpen,
  attention,
  children,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  /** Has a server-reported problem inside — opened and marked so it is found. */
  attention?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen || attention}
      className="group rounded-2xl border border-border-glass bg-surface shadow-xs"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="flex items-center gap-2 font-semibold text-foreground">
            {title}
            {attention ? (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                Needs attention
              </span>
            ) : null}
          </span>
          {summary ? <span className="block truncate text-xs text-muted-foreground">{summary}</span> : null}
        </span>
        <ChevronDown aria-hidden className="size-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t border-border-glass px-4 py-4">{children}</div>
    </details>
  );
}

/**
 * A website image: upload (public `website` media), alt text, remove.
 *
 * The URL shown here is only a preview of the upload; on save the server discards it and
 * resolves the asset id itself (services/website.ts). Alt text is required at publish.
 */
export function ImageField({
  label,
  image,
  onChange,
  altError,
}: {
  label: string;
  image: { assetId: string | null; url: string | null; alt: string };
  onChange: (image: { assetId: string | null; url: string | null; alt: string }) => void;
  altError?: string;
}) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-border p-3">
      <legend className="px-1 text-xs font-semibold text-muted-foreground">{label}</legend>
      {image.url ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- tenant upload preview */}
          <img src={image.url} alt="" className="size-16 rounded-lg border border-border object-cover" />
          <button
            type="button"
            onClick={() => onChange({ assetId: null, url: null, alt: "" })}
            className="text-xs font-semibold text-destructive underline-offset-4 hover:underline"
          >
            Remove image
          </button>
        </div>
      ) : null}
      <MediaUpload
        purpose="website"
        label={image.url ? "Replace image" : "Upload image"}
        onUploaded={(media) => onChange({ ...image, assetId: media.id, url: media.url })}
      />
      {image.url ? (
        <TextField
          label="Describe the image (alt text)"
          max={200}
          value={image.alt}
          error={altError}
          onChange={(alt) => onChange({ ...image, alt })}
        />
      ) : null}
    </fieldset>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-primary"
      />
      {label}
    </label>
  );
}
