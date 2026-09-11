import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/**
 * The heading every administrative page opens with.
 *
 * Typography is deliberately heavier than the default: `text-3xl font-extrabold` rather
 * than `text-2xl font-semibold`. A console page needs one unmistakable anchor at the top,
 * and at 24px/600 the title competed with the action buttons beside it instead of leading
 * them.
 *
 * The description is `text-foreground/70`, NOT `text-muted-foreground`. Muted resolves to
 * roughly 51% lightness against a near-white ground, which is fine for an incidental hint
 * and too weak for a sentence that explains what a page is for — several of these carry
 * the permission rules an operator actually needs to read.
 */
export function PageHeader({ title, description, children, className = "" }: PageHeaderProps) {
  return (
    <div className={`flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between ${className}`}>
      <div className="min-w-0">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm/relaxed text-foreground/70">
            {description}
          </p>
        )}
      </div>

      {children && (
        <div className="flex flex-wrap items-center gap-2">
          {children}
        </div>
      )}
    </div>
  );
}
