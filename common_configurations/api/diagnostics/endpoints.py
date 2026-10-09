"""
Diagnostics API Endpoints

Best-effort sink for voice assistant diagnostic events. Never raises to the client.
"""

from typing import Any, Dict, Optional

import frappe

from ..shared import check_honeypot, check_rate_limit, get_current_user_contact
from ..shared.validators import sanitize_string
from . import service


@frappe.whitelist(allow_guest=True, methods=["POST"])
def log_events(
	events: Any = None,
	portal: Optional[str] = None,
	session_id: Optional[str] = None,
	honeypot: Optional[str] = None,
) -> Dict[str, Any]:
	"""
	Store voice assistant diagnostic events as Voice Assistant Log records.

	Rate limited: 60 requests per minute per IP. Max 50 events per call.
	Best-effort: always returns a dict, never throws.

	Returns:
		{"ok": True, "stored": n} | {"ok": True, "stored": 0, "disabled": True}
		| {"ok": True, "stored": 0, "rate_limited": True} | {"ok": False, "stored": 0}
	"""
	try:
		check_rate_limit("voice_log_events", limit=60, seconds=60)
		check_honeypot(honeypot)

		if not service.is_enabled():
			return {"ok": True, "stored": 0, "disabled": True}

		try:
			user_contact = get_current_user_contact()
		except Exception:
			user_contact = None

		stored = service.store_events(
			events,
			sanitize_string(portal, 140),
			sanitize_string(session_id, 140),
			sanitize_string(getattr(user_contact, "name", None) or user_contact, 140) if user_contact else None,
		)
		return {"ok": True, "stored": stored}
	except frappe.TooManyRequestsError:
		return {"ok": True, "stored": 0, "rate_limited": True}
	except Exception:
		frappe.log_error(title="Voice Assistant Log: log_events failed", message=frappe.get_traceback())
		return {"ok": False, "stored": 0}
