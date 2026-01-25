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
  first_name: string;
  last_name?: string;
  email: string;
  phone?: string;
  company?: string;
  notes?: string;
}
