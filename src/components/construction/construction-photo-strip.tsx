"use client"

import * as React from "react"
import Image from "next/image"
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Download,
  Link2Off,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import {
  formatPhotoSize,
  offeredPhotoActions,
  planPhotoSwap,
  summarizeUploads,
} from "@/lib/construction/photo-strip"
import {
  ConstructionPhotoApiError,
  constructionPhotoFileUrl,
  removeConstructionPhoto,
  updateConstructionPhoto,
  uploadConstructionPhotos,
  type PhotoAnchor,
} from "@/lib/construction/photos-api"
import { useConstructionPhotos } from "@/hooks/use-construction-photos"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { ConstructionPhoto } from "@/types/construction-photo"

/** Vom Server erlaubt und hier gespiegelt, damit der Dateidialog vorfiltert. */
const ACCEPT = "image/jpeg,image/png,.jpg,.jpeg,.png"

interface Props {
  projectId: string
  anchor: PhotoAnchor
  /** Projektleitung, Bauleitung oder Mandanten-Administration (β-Regel). */
  canManage: boolean
  /**
   * Protokollierte Abnahme (Q-ε7): ergänzen ja, entfernen nein. Die Fläche
   * sagt das aus, statt einen Knopf anzubieten, der in `42501` läuft.
   */
  frozen?: boolean
  /** Überschrift der Sektion; die Strecke bringt keine eigene mit. */
  heading?: string
  onChanged?: () => void | Promise<void>
}

/**
 * PROJ-45-ε — die Fotostrecke, eine Komponente für alle drei Anker (L32).
 *
 * **Hinzufügen ist bewusst nicht gegated** (AC-45ε.16/.17, β-Regel): wer einen
 * Mangel melden darf, darf ihn auch fotografieren — Betrachter eingeschlossen.
 * Ändern, Umsortieren und Entfernen erscheinen nur für die engere Rolle; die
 * Durchsetzung liegt in den Datenbankfunktionen und wird hier weder nachgebaut
 * noch umgangen (D-β9-Muster).
 *
 * Die Galerie lädt die **Vorschaugrösse** (AC-45ε.9); acht Originale wären
 * zweistellige Megabyte für eine Ansicht, die Bilder in 480 px zeigt. Das
 * Original hängt am Herunterladen-Knopf.
 *
 * **Der Anker wechselt nicht im Betrieb:** ein Wechsel wird über einen `key` am
 * Aufrufer erledigt statt über ein Zurücksetzen im Effect (γ-Lehre,
 * `react-hooks/set-state-in-effect`).
 */
export function ConstructionPhotoStrip({
  projectId,
  anchor,
  canManage,
  frozen = false,
  heading = "Fotos",
  onChanged,
}: Props) {
  const { photos, loading, moduleInactive, error, refresh } =
    useConstructionPhotos(projectId, anchor)
  const actions = offeredPhotoActions(canManage, frozen)
  const [busy, setBusy] = React.useState(false)
  const [pendingDelete, setPendingDelete] =
    React.useState<ConstructionPhoto | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const notifyChanged = async () => {
    await refresh()
    if (onChanged) await onChanged()
  }

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    // Zurücksetzen, damit dieselbe Datei ein zweites Mal gewählt werden kann.
    event.target.value = ""
    if (files.length === 0) return
    setBusy(true)
    try {
      const outcomes = await uploadConstructionPhotos(projectId, anchor, files)
      const summary = summarizeUploads(outcomes)
      if (summary.failedCount === 0) {
        toast.success(summary.headline)
      } else {
        // Jede abgewiesene Datei wird NAMENTLICH genannt (AC-45ε.2) — „3 von 5"
        // verschweigt, welche fehlen und warum.
        toast.warning(summary.headline, {
          description: summary.failures
            .map((f) => `${f.filename}: ${f.message}`)
            .join("\n"),
          duration: 12_000,
        })
      }
      if (summary.okCount > 0) await notifyChanged()
    } catch (err) {
      toast.error("Upload fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setBusy(false)
    }
  }

  const saveMeta = async (
    photo: ConstructionPhoto,
    patch: { caption?: string | null; taken_on?: string | null },
  ) => {
    setBusy(true)
    try {
      // Leeren geht über den ausdrücklichen Schalter, nicht über ein
      // weggelassenes Feld — „weglassen" heisst serverseitig UNVERÄNDERT
      // (der in PROJ-122 live aufgetretene Defekt).
      const body: Parameters<typeof updateConstructionPhoto>[2] = {}
      if (patch.caption !== undefined) {
        if (patch.caption === null || patch.caption.trim() === "") {
          body.clear_caption = true
        } else {
          body.caption = patch.caption.trim()
        }
      }
      if (patch.taken_on !== undefined) {
        if (patch.taken_on === null || patch.taken_on === "") {
          body.clear_taken_on = true
        } else {
          body.taken_on = patch.taken_on
        }
      }
      await updateConstructionPhoto(projectId, photo.id, body)
      await notifyChanged()
    } catch (err) {
      toast.error("Änderung fehlgeschlagen", {
        description: describe(err),
      })
    } finally {
      setBusy(false)
    }
  }

  const move = async (photo: ConstructionPhoto, direction: "up" | "down") => {
    const swap = planPhotoSwap(photos, photo.id, direction)
    if (!swap) return
    setBusy(true)
    try {
      await updateConstructionPhoto(projectId, swap.a.id, {
        sort_order: swap.a.sort_order,
      })
      await updateConstructionPhoto(projectId, swap.b.id, {
        sort_order: swap.b.sort_order,
      })
      await notifyChanged()
    } catch (err) {
      toast.error("Reihenfolge nicht gespeichert", { description: describe(err) })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (photo: ConstructionPhoto, deleteFile: boolean) => {
    setBusy(true)
    try {
      const res = await removeConstructionPhoto(projectId, photo.id, deleteFile)
      toast.success(
        res.file_trashed
          ? "Foto entfernt, Datei im Papierkorb"
          : "Foto vom Bezug gelöst, Datei bleibt im Dokumentenbaum",
      )
      setPendingDelete(null)
      await notifyChanged()
    } catch (err) {
      toast.error("Entfernen fehlgeschlagen", { description: describe(err) })
    } finally {
      setBusy(false)
    }
  }

  if (moduleInactive) return null

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {heading}
          {photos.length > 0 ? (
            <span className="ml-2 font-normal text-muted-foreground">
              {photos.length}
            </span>
          ) : null}
        </h3>
        {actions.canAdd ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              multiple
              className="hidden"
              onChange={onPick}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <Camera className="mr-2 h-4 w-4" />
              Foto hinzufügen
            </Button>
          </>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Skeleton className="aspect-[4/3] w-full" />
          <Skeleton className="aspect-[4/3] w-full" />
        </div>
      ) : photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Fotos. JPEG und PNG bis 50 MB je Datei; mehrere Dateien in
          einem Vorgang sind möglich.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {photos.map((photo, index) => (
            <PhotoCard
              key={photo.id}
              projectId={projectId}
              photo={photo}
              busy={busy}
              first={index === 0}
              last={index === photos.length - 1}
              canEditMeta={actions.canEditMeta}
              canReorder={actions.canReorder}
              canUnlink={actions.canUnlink}
              onSaveMeta={saveMeta}
              onMove={move}
              onUnlink={(p) => void remove(p, false)}
              onRequestDelete={setPendingDelete}
            />
          ))}
        </ul>
      )}

      {frozen && photos.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Die Abnahme ist protokolliert: Fotos lassen sich noch ergänzen, aber
          nicht mehr entfernen.
        </p>
      ) : null}

      {photos.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Die Galerie lädt verkleinerte Vorschauen. Auf den Speicherplatz des
          Mandanten zählt nur die Originaldatei — Vorschau und Druckgrösse
          entstehen zusätzlich, werden aber nicht mitgezählt.
        </p>
      ) : null}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Foto und Datei löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Verknüpfung wird gelöst und die Datei wandert in den
              Papierkorb des Dokumentenbaums. Hängt dieselbe Datei noch an einer
              anderen Stelle, wird das Löschen abgewiesen — dann bleibt
              {" "}&bdquo;Vom Bezug l&ouml;sen&ldquo;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                if (pendingDelete) void remove(pendingDelete, true)
              }}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function describe(err: unknown): string {
  if (err instanceof ConstructionPhotoApiError) return err.message
  return err instanceof Error ? err.message : "Unbekannter Fehler"
}

interface CardProps {
  projectId: string
  photo: ConstructionPhoto
  busy: boolean
  first: boolean
  last: boolean
  canEditMeta: boolean
  canReorder: boolean
  canUnlink: boolean
  onSaveMeta: (
    photo: ConstructionPhoto,
    patch: { caption?: string | null; taken_on?: string | null },
  ) => void | Promise<void>
  onMove: (photo: ConstructionPhoto, direction: "up" | "down") => void | Promise<void>
  onUnlink: (photo: ConstructionPhoto) => void
  onRequestDelete: (photo: ConstructionPhoto) => void
}

/**
 * Eine Karte. Die Eingabefelder sind über `key` an die Foto-Kennung gebunden
 * (siehe Aufrufer), damit ein Wechsel der Strecke sie zurücksetzt, ohne dass
 * ein Effect Zustand schreibt.
 */
function PhotoCard({
  projectId,
  photo,
  busy,
  first,
  last,
  canEditMeta,
  canReorder,
  canUnlink,
  onSaveMeta,
  onMove,
  onUnlink,
  onRequestDelete,
}: CardProps) {
  const [caption, setCaption] = React.useState(photo.caption ?? "")
  const [takenOn, setTakenOn] = React.useState(photo.taken_on ?? "")
  const captionId = `photo-caption-${photo.id}`
  const dateId = `photo-date-${photo.id}`

  const captionDirty = (photo.caption ?? "") !== caption
  const dateDirty = (photo.taken_on ?? "") !== takenOn

  return (
    <li className="space-y-2 rounded-lg border p-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded bg-muted">
        <Image
          src={constructionPhotoFileUrl(projectId, photo.id, "preview")}
          alt={photo.caption ?? photo.original_filename ?? "Baufoto"}
          fill
          sizes="(max-width: 640px) 100vw, 320px"
          className="object-cover"
          unoptimized
        />
      </div>

      {canEditMeta ? (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor={captionId} className="text-xs">
              Bildunterschrift
            </Label>
            <Input
              id={captionId}
              value={caption}
              disabled={busy}
              placeholder="z. B. Riss Außenwand Achse C"
              maxLength={500}
              onChange={(e) => setCaption(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={dateId} className="text-xs">
              Aufnahmedatum
            </Label>
            <Input
              id={dateId}
              type="date"
              value={takenOn}
              disabled={busy}
              onChange={(e) => setTakenOn(e.target.value)}
            />
            {photo.taken_on === null ? (
              <p className="text-xs text-muted-foreground">
                Das Bild trug keine Aufnahmezeit — nachtragbar, es wird kein
                Datum erfunden.
              </p>
            ) : null}
          </div>
          {captionDirty || dateDirty ? (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() =>
                void onSaveMeta(photo, {
                  ...(captionDirty ? { caption } : {}),
                  ...(dateDirty ? { taken_on: takenOn } : {}),
                })
              }
            >
              Speichern
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-0.5 text-sm">
          <p className="font-medium">{photo.caption ?? "Ohne Bildunterschrift"}</p>
          <p className="text-xs text-muted-foreground">
            {photo.taken_on
              ? new Date(photo.taken_on).toLocaleDateString("de-DE")
              : "Aufnahmedatum unbekannt"}
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {photo.original_filename ?? "Datei"} · {formatPhotoSize(photo.size_bytes)}
      </p>

      <div className="flex flex-wrap items-center gap-1">
        <Button asChild size="sm" variant="ghost">
          <a
            href={constructionPhotoFileUrl(projectId, photo.id, "original")}
            download
          >
            <Download className="mr-1 h-4 w-4" />
            Original
          </a>
        </Button>
        {canReorder ? (
          <>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={busy || first}
              aria-label="Nach vorne"
              onClick={() => void onMove(photo, "up")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={busy || last}
              aria-label="Nach hinten"
              onClick={() => void onMove(photo, "down")}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          </>
        ) : null}
        {canUnlink ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => onUnlink(photo)}
            >
              <Link2Off className="mr-1 h-4 w-4" />
              Vom Bezug lösen
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={busy}
              onClick={() => onRequestDelete(photo)}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Löschen
            </Button>
          </>
        ) : null}
      </div>
    </li>
  )
}
