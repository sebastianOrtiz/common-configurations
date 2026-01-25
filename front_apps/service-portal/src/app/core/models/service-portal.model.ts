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
  request_contact_user_data: boolean;
  registration_title?: string;
  registration_description?: string;

  // Styles
  primary_color?: string;
  secondary_color?: string;
  logo?: string;
  background_image?: string;
  custom_css?: string;

  // Tools
  tools: ServicePortalTool[];
}

export interface ServicePortalTool {
  name?: string;
  tool_type: string;
  label: string;
  tool_description?: string;
  icon?: string;
  button_color?: string;
  display_order: number;
  is_enabled: boolean;

  // Custom fields (depends on tool_type)
  // For meet_scheduling:
  calendar_resource?: string;
  show_calendar_view?: boolean;
  slot_duration_minutes?: number;

  // Additional custom fields can be added here
  [key: string]: any;
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
