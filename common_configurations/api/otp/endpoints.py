"""
OTP API Endpoints

HTTP endpoints for OTP operations.
"""

import frappe
from frappe import _

from common_configurations.api.shared import check_rate_limit, check_honeypot, sanitize_string
from .service import OTPService


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_otp_settings() -> dict:
	"""
	Get public OTP settings for frontend.

	Returns:
		dict with public settings (enabled, channels, etc.)
	"""
	check_rate_limit("otp_settings", limit=60, seconds=60)
	return OTPService.get_public_settings()


@frappe.whitelist(allow_guest=True, methods=["POST"])
def request_otp(document: str, channel: str = "sms", honeypot: str = None) -> dict:
	"""
	Request OTP to be sent to user's phone.

	Args:
		document: User's document number
		channel: "sms" or "whatsapp"
		honeypot: Honeypot field for bot detection

	Returns:
		dict with success status and masked phone
	"""
	# Security checks
	check_honeypot(honeypot)
	check_rate_limit("request_otp", limit=10, seconds=60)

	# Validate input
	document = sanitize_string(document)
	if not document:
		frappe.throw(_("Document number is required"))

	channel = sanitize_string(channel).lower()
	if channel not in ("sms", "whatsapp"):
		channel = "sms"

	return OTPService.request_otp(document, channel)


@frappe.whitelist(allow_guest=True, methods=["POST"])
def verify_otp(document: str, otp_code: str, honeypot: str = None) -> dict:
	"""
	Verify OTP and return auth token.

	Args:
		document: User's document number
		otp_code: OTP code to verify
		honeypot: Honeypot field for bot detection

	Returns:
		dict with auth_token if valid
	"""
	# Security checks
	check_honeypot(honeypot)
	check_rate_limit("verify_otp", limit=20, seconds=60)

	# Validate input
	document = sanitize_string(document)
	if not document:
		frappe.throw(_("Document number is required"))

	otp_code = sanitize_string(otp_code)
	if not otp_code:
		frappe.throw(_("OTP code is required"))

	# Remove any spaces or dashes from OTP
	otp_code = otp_code.replace(" ", "").replace("-", "")

	return OTPService.verify_otp(document, otp_code)


@frappe.whitelist(allow_guest=True, methods=["GET"])
def is_otp_enabled() -> dict:
	"""
	Simple check if OTP is enabled.

	Returns:
		dict with enabled status
	"""
	check_rate_limit("otp_check", limit=60, seconds=60)
	return {"enabled": OTPService.is_enabled()}
