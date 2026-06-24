/**
 * Tenant Hub — shared types
 */

export interface TenantPortalGroup {
  name: string;
  slug: string;
  display_name: string;
  description?: string | null;
  banner_image?: string | null;
  display_order: number;
}

export interface TenantPortal {
  name: string;
  display_name: string;
  description?: string | null;
  logo?: string | null;
  /** 1 = the destination requires auth; the hub should run SSO first. */
  requires_auth: 0 | 1;
  display_order: number;
  portal_path: string;
  destination_crm: string;
  crm_display_name: string;
  crm_logo?: string | null;
  crm_base_url: string;
  /** Composed by the backend: base_url + portal_path */
  target_url: string;
  /** Portal logo if set, else CRM logo. */
  effective_logo?: string | null;
}

export interface TenantPortalGroupWithPortals extends TenantPortalGroup {
  portals: TenantPortal[];
}

export interface SsoNonceResponse {
  nonce: string;
  target_url: string;
  destination_crm: string;
  expires_in: number;
}
