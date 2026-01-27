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


# ==========================================
# Registration OTP Endpoints
# ==========================================

@frappe.whitelist(allow_guest=True, methods=["POST"])
def request_registration_otp(data: str, channel: str = "sms", honeypot: str = None) -> dict:
	"""
	Request OTP for new user registration.
	Stores form data in cache until OTP is verified.

	Args:
		data: JSON string with registration form data
		channel: "sms" or "whatsapp"
		honeypot: Honeypot field for bot detection

	Returns:
		dict with success status and masked phone
	"""
	import json

	# Security checks
	check_honeypot(honeypot)
	check_rate_limit("request_registration_otp", limit=10, seconds=60)

	# Parse form data
	try:
		form_data = json.loads(data) if isinstance(data, str) else data
	except json.JSONDecodeError:
		frappe.throw(_("Invalid form data"))

	# Validate required fields
	if not form_data.get("phone_number"):
		frappe.throw(_("Phone number is required"))

	if not form_data.get("document"):
		frappe.throw(_("Document number is required"))

	# Sanitize channel
	channel = sanitize_string(channel).lower()
	if channel not in ("sms", "whatsapp"):
		channel = "sms"

	return OTPService.request_registration_otp(form_data, channel)


@frappe.whitelist(allow_guest=True, methods=["POST"])
def verify_registration_otp(phone_number: str, otp_code: str, honeypot: str = None) -> dict:
	"""
	Verify OTP for pending registration and create user.

	Args:
		phone_number: Phone number used in registration
		otp_code: OTP code to verify
		honeypot: Honeypot field for bot detection

	Returns:
		dict with auth_token and user_contact if valid
	"""
	# Security checks
	check_honeypot(honeypot)
	check_rate_limit("verify_registration_otp", limit=20, seconds=60)

	# Validate input
	phone_number = sanitize_string(phone_number)
	if not phone_number:
		frappe.throw(_("Phone number is required"))

	otp_code = sanitize_string(otp_code)
	if not otp_code:
		frappe.throw(_("OTP code is required"))

	# Clean OTP
	otp_code = otp_code.replace(" ", "").replace("-", "")

	return OTPService.verify_registration_otp(phone_number, otp_code)


@frappe.whitelist(allow_guest=True, methods=["POST"])
def resend_registration_otp(phone_number: str, channel: str = None, honeypot: str = None) -> dict:
	"""
	Resend OTP for pending registration.

	Args:
		phone_number: Phone number from registration
		channel: Optional new channel (sms/whatsapp)
		honeypot: Honeypot field for bot detection

	Returns:
		dict with success status
	"""
	# Security checks
	check_honeypot(honeypot)
	check_rate_limit("resend_registration_otp", limit=5, seconds=60)

	# Validate input
	phone_number = sanitize_string(phone_number)
	if not phone_number:
		frappe.throw(_("Phone number is required"))

	if channel:
		channel = sanitize_string(channel).lower()
		if channel not in ("sms", "whatsapp"):
			channel = None

	return OTPService.resend_registration_otp(phone_number, channel)


@frappe.whitelist(allow_guest=True, methods=["POST"])
def cancel_registration(phone_number: str, honeypot: str = None) -> dict:
	"""
	Cancel pending registration.

	Args:
		phone_number: Phone number from registration
		honeypot: Honeypot field for bot detection

	Returns:
		dict with success status
	"""
	# Security checks
	check_honeypot(honeypot)

	phone_number = sanitize_string(phone_number)
	if not phone_number:
		frappe.throw(_("Phone number is required"))

	return OTPService.cancel_pending_registration(phone_number)
