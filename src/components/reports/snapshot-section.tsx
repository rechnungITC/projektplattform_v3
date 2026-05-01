import * as React from "react"

interface SnapshotSectionProps {
  title: string
  children: React.ReactNode
  /** Hint shown when the section is empty. Defaults to "—". */
  emptyHint?: string
  /** Render the empty hint when this is true; ignores children. */
  isEmpty?: boolean
}

/**
 * Common wrapper for report sections. Always renders the heading;
 * empty sections show an explicit "—" placeholder per spec § ST-04.
 */
export function SnapshotSection({
  title,
  children,
  emptyHint = "—",
  isEmpty = false,
}: SnapshotSectionProps) {
  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-2 text-sm">
        {isEmpty ? (
          <p className="text-muted-foreground">{emptyHint}</p>
        ) : (
          children
        )}
      </div>
    </section>
  )
}
