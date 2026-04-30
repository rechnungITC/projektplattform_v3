/**
 * PROJ-15 — fetch wrappers for vendor master data + evaluations + documents
 * + project-assignments.
 *
 * All endpoints admin/editor or project-editor gated server-side; this is
 * just typed network glue for the UI.
 */

import type {
  Vendor,
  VendorDocument,
  VendorDocumentKind,
  VendorEvaluation,
  VendorProjectAssignmentRich,
  VendorRole,
  VendorStatus,
  VendorWithStats,
} from "@/types/vendor"

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

async function safeError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody
    return body.error?.message ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

// ─── Vendors ───────────────────────────────────────────────────────────

export interface VendorListOptions {
  status?: VendorStatus
  search?: string
}

export async function listVendors(
  options: VendorListOptions = {}
): Promise<VendorWithStats[]> {
  const params = new URLSearchParams()
  if (options.status) params.set("status", options.status)
  if (options.search) params.set("search", options.search)
  const qs = params.toString()
  const url = qs ? `/api/vendors?${qs}` : "/api/vendors"
  const response = await fetch(url, { method: "GET", cache: "no-store" })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { vendors: VendorWithStats[] }
  return body.vendors ?? []
}

export interface VendorInput {
  name: string
  category?: string | null
  primary_contact_email?: string | null
  website?: string | null
  status?: VendorStatus
}

export async function createVendor(input: VendorInput): Promise<Vendor> {
  const response = await fetch("/api/vendors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { vendor: Vendor }
  return body.vendor
}

export async function updateVendor(
  vendorId: string,
  input: Partial<VendorInput>
): Promise<Vendor> {
  const response = await fetch(`/api/vendors/${encodeURIComponent(vendorId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { vendor: Vendor }
  return body.vendor
}

export async function deleteVendor(vendorId: string): Promise<void> {
  const response = await fetch(`/api/vendors/${encodeURIComponent(vendorId)}`, {
    method: "DELETE",
  })
  if (!response.ok && response.status !== 204) {
    throw new Error(await safeError(response))
  }
}

// ─── Evaluations ──────────────────────────────────────────────────────

export async function listEvaluations(
  vendorId: string
): Promise<VendorEvaluation[]> {
  const response = await fetch(
    `/api/vendors/${encodeURIComponent(vendorId)}/evaluations`,
    { method: "GET", cache: "no-store" }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { evaluations: VendorEvaluation[] }
  return body.evaluations ?? []
}

export interface EvaluationInput {
  criterion: string
  score: number
  comment?: string | null
}

export async function createEvaluation(
  vendorId: string,
  input: EvaluationInput
): Promise<VendorEvaluation> {
  const response = await fetch(
    `/api/vendors/${encodeURIComponent(vendorId)}/evaluations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { evaluation: VendorEvaluation }
  return body.evaluation
}

export async function deleteEvaluation(
  vendorId: string,
  evaluationId: string
): Promise<void> {
  const response = await fetch(
    `/api/vendors/${encodeURIComponent(vendorId)}/evaluations/${encodeURIComponent(evaluationId)}`,
    { method: "DELETE" }
  )
  if (!response.ok && response.status !== 204) {
    throw new Error(await safeError(response))
  }
}

// ─── Documents ────────────────────────────────────────────────────────

export async function listDocuments(
  vendorId: string
): Promise<VendorDocument[]> {
  const response = await fetch(
    `/api/vendors/${encodeURIComponent(vendorId)}/documents`,
    { method: "GET", cache: "no-store" }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { documents: VendorDocument[] }
  return body.documents ?? []
}

export interface DocumentInput {
  kind: VendorDocumentKind
  title: string
  external_url: string
  document_date?: string | null
  note?: string | null
}

export async function createDocument(
  vendorId: string,
  input: DocumentInput
): Promise<VendorDocument> {
  const response = await fetch(
    `/api/vendors/${encodeURIComponent(vendorId)}/documents`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { document: VendorDocument }
  return body.document
}

export async function deleteDocument(
  vendorId: string,
  documentId: string
): Promise<void> {
  const response = await fetch(
    `/api/vendors/${encodeURIComponent(vendorId)}/documents/${encodeURIComponent(documentId)}`,
    { method: "DELETE" }
  )
  if (!response.ok && response.status !== 204) {
    throw new Error(await safeError(response))
  }
}

// ─── Project ↔ Vendor Assignments ─────────────────────────────────────

export async function listProjectAssignments(
  projectId: string
): Promise<VendorProjectAssignmentRich[]> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/vendor-assignments`,
    { method: "GET", cache: "no-store" }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as {
    assignments: VendorProjectAssignmentRich[]
  }
  return body.assignments ?? []
}

export interface AssignmentInput {
  vendor_id: string
  role: VendorRole
  scope_note?: string | null
  valid_from?: string | null
  valid_until?: string | null
}

export async function createAssignment(
  projectId: string,
  input: AssignmentInput
): Promise<VendorProjectAssignmentRich> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/vendor-assignments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as {
    assignment: VendorProjectAssignmentRich
  }
  return body.assignment
}

export async function updateAssignment(
  projectId: string,
  assignmentId: string,
  input: Partial<AssignmentInput>
): Promise<VendorProjectAssignmentRich> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/vendor-assignments/${encodeURIComponent(assignmentId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as {
    assignment: VendorProjectAssignmentRich
  }
  return body.assignment
}

export async function deleteAssignment(
  projectId: string,
  assignmentId: string
): Promise<void> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/vendor-assignments/${encodeURIComponent(assignmentId)}`,
    { method: "DELETE" }
  )
  if (!response.ok && response.status !== 204) {
    throw new Error(await safeError(response))
  }
}
