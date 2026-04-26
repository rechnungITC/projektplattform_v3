export type Role = "admin" | "member" | "viewer"

export interface Profile {
  id: string
  email: string
  display_name: string | null
  created_at: string
  updated_at: string | null
}

export interface Tenant {
  id: string
  name: string
  domain: string | null
  created_at: string
  created_by: string | null
}

export interface TenantMembership {
  id: string
  tenant_id: string
  user_id: string
  role: Role
  created_at: string
  tenant: Tenant
}

export interface TenantMember {
  membership_id: string
  user_id: string
  email: string
  display_name: string | null
  role: Role
  created_at: string
}
