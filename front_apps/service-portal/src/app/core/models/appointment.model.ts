/**
 * Appointment and Meet Scheduling Models
 */

export interface Appointment {
  name?: string;
  calendar_resource: string;
  user_contact?: string;
  start_datetime: string; // ISO format
  end_datetime: string; // ISO format
  status: 'Draft' | 'Confirmed' | 'Cancelled' | 'No-show' | 'Completed';
  draft_expires_at?: string;

  // Party (optional)
  party_type?: string;
  party?: string;

  // Service details
  service?: string;
  notes?: string;
  source?: 'Web' | 'Admin' | 'API';
  appointment_context?: string;

  // Video call
  video_call_profile?: string;
  call_link_mode?: 'inherit' | 'manual' | 'auto';
  manual_meeting_url?: string;
  manual_meeting_notes?: string;

  // Meeting result
  meeting_url?: string;
  video_provider?: 'google_meet' | 'microsoft_teams';
  meeting_id?: string;
  meeting_status?: 'not_created' | 'created' | 'failed';
  meeting_error?: string;
  meeting_created_at?: string;

  // Metadata
  docstatus?: number; // 0 = Draft, 1 = Submitted, 2 = Cancelled
  creation?: string;
  modified?: string;
  owner?: string;
}

export interface AvailableSlot {
  start: string; // ISO datetime
  end: string; // ISO datetime
  capacity_remaining: number;
  is_available: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  availability_ok?: boolean;
  capacity_ok?: boolean;
  overlap_info?: {
    has_overlap: boolean;
    overlapping_appointments: string[];
    capacity_used: number;
    capacity_available: number;
  };
}

export interface MeetingGenerationResult {
  success: boolean;
  meeting_url?: string;
  meeting_id?: string;
  status: string;
  message: string;
}

export interface CalendarResource {
  name: string;
  resource_name: string;
  resource_type: 'Person' | 'Room' | 'Equipment' | 'Service';
  reference_doctype?: string;
  reference_name?: string;
  timezone: string;
  slot_duration_minutes: number;
  capacity: number;
  draft_expiration_minutes: number;
  availability_plan?: string;
  video_call_profile?: string;
  is_active: boolean;
}

export interface AvailabilityPlan {
  name: string;
  plan_name: string;
  description?: string;
  valid_from?: string;
  valid_to?: string;
  timezone: string;
  is_active: boolean;
  slots: AvailabilitySlot[];
}

export interface AvailabilitySlot {
  weekday: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  start_time: string; // HH:mm:ss
  end_time: string; // HH:mm:ss
}
