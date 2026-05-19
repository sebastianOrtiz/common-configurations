/**
 * Service Portal Models
 */

export interface ServicePortal {
  name: string;
  portal_name: string;
  title: string;
  description?: string;
  is_active: boolean;

  // Registration
  registration_title?: string;
  registration_description?: string;

  // Auth
  require_auth?: boolean;
  enable_mfa_otp?: boolean;

  // Styles
  primary_color?: string;
  secondary_color?: string;
  logo?: string;
  background_image?: string;
  custom_css?: string;

  // Tools
  tools: ServicePortalTool[];

  // Announcements
  announcement_rotation_seconds?: number;
  announcements_left?: AnnouncementSetData | null;
  announcements_bottom?: AnnouncementSetData | null;
  announcements_right?: AnnouncementSetData | null;
}

export interface AnnouncementData {
  name: string;
  content_type: 'image' | 'text' | 'html';
  announcement_type: 'info' | 'promo' | 'alert' | 'event';
  image?: string;
  heading?: string;
  body?: string;
  html_content?: string;
  cta_url?: string;
  cta_target?: '_blank' | '_self';
}

export interface AnnouncementSetData {
  name: string;
  title: string;
  announcements: AnnouncementData[];
}

export interface ServicePortalTool {
  name?: string;
  tool_type: string;
  label: string;
  tool_description?: string;
  icon?: string;
  tool_image?: string;
  button_color?: string;
  display_order: number;
  is_enabled: boolean;

  // Custom fields (depends on tool_type)
  // For meet_scheduling:
  calendar_resource?: string;
  show_calendar_view?: boolean;
  slot_duration_minutes?: number;

  // For portal_redirect:
  target_portal?: string;

  // For portal_quick_links:
  quick_links?: string;
  quick_links_data?: PortalQuickLinksData;

  // For quick_link (direct external link):
  quick_link_external?: string;
  quick_link_external_data?: ExternalLinkData;

  // Additional custom fields can be added here
  [key: string]: any;
}

export interface ExternalLinkData {
  name: string;
  title: string;
  label: string;
  url: string;
  target: '_blank' | '_self';
  icon?: string;
  image?: string;
  color?: string;
  description?: string;
}

export interface PortalQuickLinksData {
  name: string;
  link_group_name: string;
  description?: string;
  icon?: string;
  image?: string;
  links: PortalQuickLinkItem[];
}

// Resolved quick link item: External Link data + item-level overrides
export interface PortalQuickLinkItem extends ExternalLinkData {
  display_order: number;
  is_enabled: boolean;
}

export interface ToolType {
  name: string;
  tool_name: string;
  tool_label: string;
  app_name: string;
  icon?: string;
  description?: string;
  is_active: boolean;
}

export interface UserContact {
  name?: string;
  full_name: string;
  document_type: string;
  document: string;
  phone_number?: string;
  email?: string;
  gender?: string;
  // Allow additional custom fields
  [key: string]: any;
}

/**
 * DocType Field Metadata from Frappe
 */
export interface DocField {
  fieldname: string;
  fieldtype: string;
  label: string;
  reqd?: number;
  options?: string;
  default?: string;
  description?: string;
  read_only?: number;
  hidden?: number;
  depends_on?: string;
  mandatory_depends_on?: string;
  length?: number;
  precision?: number;
  in_list_view?: number;
}

/**
 * DocType Metadata from Frappe
 */
export interface DocTypeMeta {
  name: string;
  fields: DocField[];
  field_order?: string[];
}

/**
 * OTP Settings (public settings from backend)
 */
export interface OTPSettings {
  enabled: boolean;
  otp_length?: number;
  otp_expiry_minutes?: number;
  default_channel?: 'sms' | 'whatsapp';
  sms_available?: boolean;
  whatsapp_available?: boolean;
}

/**
 * OTP Request Response
 */
export interface OTPRequestResponse {
  success: boolean;
  message?: string;
  phone?: string;  // Masked phone number
  channel?: 'sms' | 'whatsapp';
  expiry_minutes?: number;
}

/**
 * OTP Verify Response
 */
export interface OTPVerifyResponse {
  success: boolean;
  auth_token?: string;
  user_contact?: string;
}

/**
 * Registration OTP Verify Response
 * Returns full user contact object after creation
 */
export interface RegistrationOTPVerifyResponse {
  success: boolean;
  auth_token?: string;
  user_contact?: UserContact;
}

/**
 * User Contact with OTP requirement flag
 */
export interface UserContactWithOTP extends UserContact {
  auth_token?: string;
  requires_otp?: boolean;
  otp_settings?: OTPSettings;
}

/**
 * Guest/anonymous user contact for portals that don't require authentication.
 * Has no auth token — FrappeApiService won't send X-User-Contact-Token.
 * Not persisted to localStorage (session-only).
 */
export const ANONYMOUS_USER_CONTACT: UserContact = {
  name: 'anonymous',
  full_name: 'Invitado',
  document_type: '',
  document: 'anonymous',
};
