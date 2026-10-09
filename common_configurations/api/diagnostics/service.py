"""
Diagnostics service: validates and persists Voice Assistant Log entries.
"""

import json
from typing import Any, Dict, List, Optional

import frappe
from frappe.utils import get_datetime, now_datetime

from ..shared.validators import sanitize_string

MAX_EVENTS_PER_CALL = 50
MAX_DETAILS_LENGTH = 20000

EVENT_TYPES = {
	"command_heard", "interpret", "action_dispatched", "navigation",
	"tts", "no_match", "error", "other",
}
INTERPRET_SOURCES = {"rule", "ai", "none"}
OUTCOMES = {
	"dispatched", "no_match", "redirect_intended", "redirect_done",
	"navigated", "error", "spoken",
}


def is_enabled() -> bool:
	"""Toggle in Common Configurations Settings (default on)."""
	value = frappe.db.get_single_value("Common Configurations Settings", "voice_diagnostics_enabled")
	return value is None or bool(int(value))


def parse_events(raw: Any) -> List[Dict[str, Any]]:
	"""Decode the `events` param (JSON string or list) into at most MAX_EVENTS_PER_CALL dicts."""
	if isinstance(raw, str):
		raw = json.loads(raw) if raw.strip() else []
	if isinstance(raw, dict):
		raw = [raw]
	if not isinstance(raw, list):
		return []
	return [e for e in raw[:MAX_EVENTS_PER_CALL] if isinstance(e, dict)]


def _enum(value: Any, allowed: set, default: Optional[str]) -> Optional[str]:
	value = sanitize_string(value, 50)
	return value if value in allowed else default


def _serialize_details(details: Any) -> Optional[str]:
	if details in (None, "", {}):
		return None
	if not isinstance(details, str):
		try:
			details = json.dumps(details, ensure_ascii=False, default=str)
		except (TypeError, ValueError):
			details = str(details)
	return details[:MAX_DETAILS_LENGTH]


def _log_time(ts: Any):
	"""Accept ISO string or epoch (s/ms); fall back to server time."""
	if ts in (None, ""):
		return now_datetime()
	try:
		if isinstance(ts, (int, float)):
			from datetime import datetime
			seconds = ts / 1000 if ts > 1e11 else ts
			return datetime.fromtimestamp(seconds)
		return get_datetime(str(ts)).replace(tzinfo=None)
	except Exception:
		return now_datetime()


def store_event(event: Dict[str, Any], portal: Optional[str], session_id: Optional[str], user_contact: Optional[str]) -> None:
	doc = frappe.get_doc({
		"doctype": "Voice Assistant Log",
		"log_time": _log_time(event.get("ts")),
		"portal": portal,
		"session_id": session_id,
		"user_contact": user_contact,
		"route": sanitize_string(event.get("route"), 500),
		"event_type": _enum(event.get("event_type"), EVENT_TYPES, "other"),
		"transcript": sanitize_string(event.get("transcript"), 1000),
		"interpreted_action": sanitize_string(event.get("interpreted_action"), 140),
		"interpret_source": _enum(event.get("interpret_source"), INTERPRET_SOURCES, None),
		"outcome": _enum(event.get("outcome"), OUTCOMES, None),
		"tts_text": sanitize_string(event.get("tts_text"), 1000),
		"details": _serialize_details(event.get("details")),
	})
	doc.insert(ignore_permissions=True)


def store_events(raw_events: Any, portal: Optional[str], session_id: Optional[str], user_contact: Optional[str]) -> int:
	"""Persist events; a bad event is logged and skipped, never aborts the batch."""
	stored = 0
	for event in parse_events(raw_events):
		try:
			store_event(event, portal, session_id, user_contact)
			stored += 1
		except Exception:
			frappe.log_error(title="Voice Assistant Log: event skipped", message=frappe.get_traceback())
	return stored
