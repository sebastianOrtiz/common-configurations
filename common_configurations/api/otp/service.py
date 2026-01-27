"""
OTP Service

Business logic for OTP generation, verification, and rate limiting.
"""

import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional

import frappe
from frappe import _
from frappe.utils import now_datetime, get_datetime

from .twilio_client import TwilioClient


class OTPService:
	"""Service class for OTP operations."""

	@classmethod
	def get_settings(cls) -> "OTPSettings":
		"""Get OTP settings document."""
		from common_configurations.common_configurations.doctype.otp_settings.otp_settings import OTPSettings

		return OTPSettings.get_settings()

	@classmethod
	def is_enabled(cls) -> bool:
		"""Check if OTP verification is enabled."""
		from common_configurations.common_configurations.doctype.otp_settings.otp_settings import OTPSettings

		return OTPSettings.is_otp_enabled()

	@classmethod
	def get_public_settings(cls) -> dict:
		"""
		Get public OTP settings for frontend.

		Returns:
			dict with public settings (no secrets)
		"""
		if not cls.is_enabled():
			return {"enabled": False}

		settings = cls.get_settings()
		return {
			"enabled": True,
			"otp_length": settings.otp_length or 6,
			"otp_expiry_minutes": settings.otp_expiry_minutes or 5,
			"default_channel": settings.default_channel or "sms",
			"sms_available": bool(settings.twilio_phone_number),
			"whatsapp_available": bool(settings.twilio_whatsapp_number),
		}

	@classmethod
	def _generate_otp(cls, length: int = 6) -> str:
		"""Generate a random numeric OTP."""
		return "".join(secrets.choice("0123456789") for _ in range(length))

	@classmethod
	def _hash_otp(cls, otp: str) -> str:
		"""Hash OTP using SHA-256."""
		return hashlib.sha256(otp.encode()).hexdigest()

	@classmethod
	def _format_phone_e164(cls, phone_number: str, country_code: str = "+57") -> str:
		"""
		Format phone number to E.164 format for Twilio.

		Args:
			phone_number: Raw phone number
			country_code: Country code (default: +57 for Colombia)

		Returns:
			Phone number in E.164 format (e.g., +573001234567)
		"""
		# Remove any non-digit characters except leading +
		cleaned = "".join(c for c in phone_number if c.isdigit() or c == "+")

		# If already has country code, return as-is
		if cleaned.startswith("+"):
			return cleaned

		# Remove leading 0 if present (common in local format)
		if cleaned.startswith("0"):
			cleaned = cleaned[1:]

		# Add country code
		return f"{country_code}{cleaned}"

	@classmethod
	def _check_rate_limit(cls, user_contact: "Document") -> None:
		"""
		Check if user has exceeded OTP request rate limit.

		Args:
			user_contact: User Contact document

		Raises:
			frappe.ValidationError if rate limit exceeded
		"""
		settings = cls.get_settings()
		max_requests = settings.max_otp_requests_per_hour or 3

		# Reset counter if an hour has passed
		reset_at = user_contact.otp_requests_reset_at
		if reset_at:
			reset_dt = get_datetime(reset_at)
			if now_datetime() > reset_dt:
				user_contact.otp_requests_count = 0
				user_contact.otp_requests_reset_at = None

		# Check current count
		current_count = user_contact.otp_requests_count or 0
		if current_count >= max_requests:
			remaining_minutes = 60
			if reset_at:
				remaining = get_datetime(reset_at) - now_datetime()
				remaining_minutes = max(1, int(remaining.total_seconds() / 60))
			frappe.throw(
				_("Too many OTP requests. Please try again in {0} minutes.").format(remaining_minutes)
			)

	@classmethod
	def _check_lockout(cls, user_contact: "Document") -> None:
		"""
		Check if user is locked out from OTP verification.

		Args:
			user_contact: User Contact document

		Raises:
			frappe.ValidationError if account is locked
		"""
		if user_contact.otp_locked_until:
			locked_until = get_datetime(user_contact.otp_locked_until)
			if now_datetime() < locked_until:
				remaining = locked_until - now_datetime()
				remaining_minutes = max(1, int(remaining.total_seconds() / 60))
				frappe.throw(
					_("Account is temporarily locked. Please try again in {0} minutes.").format(
						remaining_minutes
					)
				)
			else:
				# Lockout expired, reset
				user_contact.otp_locked_until = None
				user_contact.otp_attempts = 0

	@classmethod
	def request_otp(cls, document: str, channel: str = "sms") -> dict:
		"""
		Generate and send OTP to user.

		Args:
			document: User's document number
			channel: "sms" or "whatsapp"

		Returns:
			dict with success status and masked phone number
		"""
		if not cls.is_enabled():
			frappe.throw(_("OTP verification is not enabled"))

		# Get user contact
		user_contact = frappe.db.get_value(
			"User contact",
			{"document": document},
			["name", "phone_number", "otp_requests_count", "otp_requests_reset_at", "otp_locked_until"],
			as_dict=True,
		)

		if not user_contact:
			frappe.throw(_("User not found"))

		if not user_contact.phone_number:
			frappe.throw(_("Phone number is required for OTP verification"))

		# Load full document for updates
		doc = frappe.get_doc("User contact", user_contact.name)

		# Check lockout
		cls._check_lockout(doc)

		# Check rate limit
		cls._check_rate_limit(doc)

		# Generate OTP
		settings = cls.get_settings()
		otp_length = settings.otp_length or 6
		otp_code = cls._generate_otp(otp_length)

		# DEBUG: Log OTP code (REMOVE IN PRODUCTION!)
		frappe.log_error(
			title="DEBUG OTP Code",
			message=f"Document: {document}, OTP: {otp_code}, Phone: {doc.phone_number}"
		)

		# Format phone number with country code and send OTP via Twilio
		formatted_phone = cls._format_phone_e164(doc.phone_number)
		twilio = TwilioClient()
		twilio.send_otp(formatted_phone, otp_code, channel)

		# Store OTP hash and update counters
		doc.otp_hash = cls._hash_otp(otp_code)
		doc.otp_created_at = now_datetime()
		doc.otp_attempts = 0
		doc.otp_requests_count = (doc.otp_requests_count or 0) + 1

		# Set rate limit reset time if first request
		if doc.otp_requests_count == 1:
			doc.otp_requests_reset_at = now_datetime() + timedelta(hours=1)

		doc.save(ignore_permissions=True)
		frappe.db.commit()

		# Mask phone number for response
		phone = doc.phone_number
		masked_phone = phone[:3] + "*" * (len(phone) - 5) + phone[-2:] if len(phone) > 5 else "****"

		return {
			"success": True,
			"message": _("OTP sent successfully"),
			"phone": masked_phone,
			"channel": channel,
			"expiry_minutes": settings.otp_expiry_minutes or 5,
		}

	@classmethod
	def verify_otp(cls, document: str, otp_code: str) -> dict:
		"""
		Verify OTP and return auth token if valid.

		Args:
			document: User's document number
			otp_code: OTP code to verify

		Returns:
			dict with auth_token if valid
		"""
		if not cls.is_enabled():
			frappe.throw(_("OTP verification is not enabled"))

		# Get user contact
		user_contact_name = frappe.db.get_value("User contact", {"document": document}, "name")

		if not user_contact_name:
			frappe.throw(_("User not found"))

		doc = frappe.get_doc("User contact", user_contact_name)

		# Check lockout
		cls._check_lockout(doc)

		# Check if OTP exists (use get_password for Password field)
		stored_hash = doc.get_password("otp_hash") if doc.otp_hash else None
		if not stored_hash or not doc.otp_created_at:
			frappe.throw(_("No OTP was requested. Please request a new OTP."))

		# Check expiry
		settings = cls.get_settings()
		expiry_minutes = settings.otp_expiry_minutes or 5
		otp_created = get_datetime(doc.otp_created_at)
		if now_datetime() > otp_created + timedelta(minutes=expiry_minutes):
			# Clear expired OTP
			doc.otp_hash = None
			doc.otp_created_at = None
			doc.save(ignore_permissions=True)
			frappe.db.commit()
			frappe.throw(_("OTP has expired. Please request a new one."))

		# Verify OTP
		otp_hash = cls._hash_otp(otp_code)

		# DEBUG: Log verification attempt (REMOVE IN PRODUCTION!)
		frappe.log_error(
			title="DEBUG OTP Verify",
			message=f"Document: {document}, Input: '{otp_code}', Input hash: {otp_hash[:16]}..., Stored hash: {stored_hash[:16] if stored_hash else 'None'}..."
		)

		if otp_hash != stored_hash:
			# Increment attempts
			doc.otp_attempts = (doc.otp_attempts or 0) + 1

			max_attempts = settings.max_verification_attempts or 5
			if doc.otp_attempts >= max_attempts:
				# Lock account
				lockout_minutes = settings.lockout_duration_minutes or 30
				doc.otp_locked_until = now_datetime() + timedelta(minutes=lockout_minutes)
				doc.otp_hash = None
				doc.otp_created_at = None
				doc.save(ignore_permissions=True)
				frappe.db.commit()
				frappe.throw(
					_("Too many failed attempts. Account locked for {0} minutes.").format(lockout_minutes)
				)

			remaining_attempts = max_attempts - doc.otp_attempts
			doc.save(ignore_permissions=True)
			frappe.db.commit()
			frappe.throw(_("Invalid OTP. {0} attempts remaining.").format(remaining_attempts))

		# OTP is valid - generate auth token
		from common_configurations.api.shared.security import create_user_contact_token

		auth_token = create_user_contact_token(doc.name)

		# Clear OTP data
		doc.otp_hash = None
		doc.otp_created_at = None
		doc.otp_attempts = 0
		doc.save(ignore_permissions=True)
		frappe.db.commit()

		return {
			"success": True,
			"auth_token": auth_token,
			"user_contact": doc.name,
		}

	@classmethod
	def clear_otp(cls, document: str) -> None:
		"""
		Clear OTP data for a user (admin function).

		Args:
			document: User's document number
		"""
		user_contact_name = frappe.db.get_value("User contact", {"document": document}, "name")
		if user_contact_name:
			frappe.db.set_value(
				"User contact",
				user_contact_name,
				{
					"otp_hash": None,
					"otp_created_at": None,
					"otp_attempts": 0,
					"otp_locked_until": None,
				},
			)
			frappe.db.commit()

	# ==========================================
	# Pending Registration Methods (using Cache)
	# ==========================================

	PENDING_REG_PREFIX = "pending_registration:"
	PENDING_REG_RATE_PREFIX = "pending_reg_rate:"

	@classmethod
	def _get_pending_key(cls, phone_number: str) -> str:
		"""Generate cache key for pending registration."""
		# Normalize phone number for consistent keys
		cleaned = "".join(c for c in phone_number if c.isdigit())
		return f"{cls.PENDING_REG_PREFIX}{cleaned}"

	@classmethod
	def _get_rate_limit_key(cls, phone_number: str) -> str:
		"""Generate cache key for rate limiting."""
		cleaned = "".join(c for c in phone_number if c.isdigit())
		return f"{cls.PENDING_REG_RATE_PREFIX}{cleaned}"

	@classmethod
	def _check_pending_rate_limit(cls, phone_number: str) -> None:
		"""
		Check rate limit for pending registration requests.

		Args:
			phone_number: Phone number to check

		Raises:
			frappe.ValidationError if rate limit exceeded
		"""
		settings = cls.get_settings()
		max_requests = settings.max_otp_requests_per_hour or 3

		rate_key = cls._get_rate_limit_key(phone_number)
		rate_data = frappe.cache().get_value(rate_key)

		if rate_data:
			count = rate_data.get("count", 0)
			if count >= max_requests:
				frappe.throw(
					_("Too many verification requests. Please try again later.")
				)

	@classmethod
	def _increment_pending_rate_limit(cls, phone_number: str) -> None:
		"""Increment rate limit counter for pending registration."""
		rate_key = cls._get_rate_limit_key(phone_number)
		rate_data = frappe.cache().get_value(rate_key) or {"count": 0}
		rate_data["count"] = rate_data.get("count", 0) + 1

		# Expire after 1 hour
		frappe.cache().set_value(rate_key, rate_data, expires_in_sec=3600)

	@classmethod
	def request_registration_otp(cls, form_data: dict, channel: str = "sms") -> dict:
		"""
		Store pending registration and send OTP for phone verification.

		Args:
			form_data: Registration form data (must include phone_number)
			channel: "sms" or "whatsapp"

		Returns:
			dict with success status and masked phone number
		"""
		if not cls.is_enabled():
			frappe.throw(_("OTP verification is not enabled"))

		phone_number = form_data.get("phone_number")
		if not phone_number:
			frappe.throw(_("Phone number is required"))

		document = form_data.get("document")
		if not document:
			frappe.throw(_("Document number is required"))

		# Check if document already exists
		existing = frappe.db.exists("User contact", {"document": document})
		if existing:
			frappe.throw(_("A user with this document number already exists"))

		# Check rate limit
		cls._check_pending_rate_limit(phone_number)

		# Generate OTP
		settings = cls.get_settings()
		otp_length = settings.otp_length or 6
		expiry_minutes = settings.otp_expiry_minutes or 5
		otp_code = cls._generate_otp(otp_length)

		# DEBUG: Log OTP code (REMOVE IN PRODUCTION!)
		frappe.log_error(
			title="DEBUG Registration OTP",
			message=f"Phone: {phone_number}, OTP: {otp_code}"
		)

		# Format phone and send OTP
		formatted_phone = cls._format_phone_e164(phone_number)
		twilio = TwilioClient()
		twilio.send_otp(formatted_phone, otp_code, channel)

		# Store in cache
		cache_key = cls._get_pending_key(phone_number)
		pending_data = {
			"form_data": form_data,
			"otp_hash": cls._hash_otp(otp_code),
			"attempts": 0,
			"channel": channel,
			"created_at": now_datetime().isoformat(),
		}

		# Cache expires after OTP expiry time
		frappe.cache().set_value(cache_key, pending_data, expires_in_sec=expiry_minutes * 60)

		# Increment rate limit
		cls._increment_pending_rate_limit(phone_number)

		# Mask phone for response
		masked_phone = phone_number[:3] + "*" * (len(phone_number) - 5) + phone_number[-2:] if len(phone_number) > 5 else "****"

		return {
			"success": True,
			"message": _("Verification code sent"),
			"phone": masked_phone,
			"channel": channel,
			"expiry_minutes": expiry_minutes,
		}

	@classmethod
	def verify_registration_otp(cls, phone_number: str, otp_code: str) -> dict:
		"""
		Verify OTP for pending registration and create user if valid.

		Args:
			phone_number: Phone number used in registration
			otp_code: OTP code to verify

		Returns:
			dict with auth_token and user_contact if valid
		"""
		if not cls.is_enabled():
			frappe.throw(_("OTP verification is not enabled"))

		cache_key = cls._get_pending_key(phone_number)
		pending_data = frappe.cache().get_value(cache_key)

		if not pending_data:
			frappe.throw(_("No pending registration found or it has expired. Please register again."))

		settings = cls.get_settings()
		max_attempts = settings.max_verification_attempts or 5

		# Check attempts
		attempts = pending_data.get("attempts", 0)
		if attempts >= max_attempts:
			# Delete pending registration
			frappe.cache().delete_value(cache_key)
			frappe.throw(_("Too many failed attempts. Please register again."))

		# Verify OTP
		stored_hash = pending_data.get("otp_hash")
		input_hash = cls._hash_otp(otp_code)

		# DEBUG: Log verification attempt (REMOVE IN PRODUCTION!)
		frappe.log_error(
			title="DEBUG Registration OTP Verify",
			message=f"Phone: {phone_number}, Input: '{otp_code}', Match: {input_hash == stored_hash}"
		)

		if input_hash != stored_hash:
			# Increment attempts
			pending_data["attempts"] = attempts + 1
			remaining = max_attempts - pending_data["attempts"]

			# Update cache (keep same expiry by re-setting)
			expiry_minutes = settings.otp_expiry_minutes or 5
			frappe.cache().set_value(cache_key, pending_data, expires_in_sec=expiry_minutes * 60)

			if remaining <= 0:
				frappe.cache().delete_value(cache_key)
				frappe.throw(_("Too many failed attempts. Please register again."))

			frappe.throw(_("Invalid code. {0} attempts remaining.").format(remaining))

		# OTP is valid - create user contact
		form_data = pending_data.get("form_data", {})

		# Create the user contact
		from common_configurations.api.contacts.service import ContactService

		contact = ContactService.create(form_data)

		# Generate auth token
		from common_configurations.api.shared.security import create_user_contact_token

		auth_token = create_user_contact_token(contact["name"])

		# Delete pending registration from cache
		frappe.cache().delete_value(cache_key)

		return {
			"success": True,
			"auth_token": auth_token,
			"user_contact": contact,
		}

	@classmethod
	def resend_registration_otp(cls, phone_number: str, channel: str = None) -> dict:
		"""
		Resend OTP for pending registration.

		Args:
			phone_number: Phone number from registration
			channel: Optional new channel (sms/whatsapp)

		Returns:
			dict with success status
		"""
		if not cls.is_enabled():
			frappe.throw(_("OTP verification is not enabled"))

		cache_key = cls._get_pending_key(phone_number)
		pending_data = frappe.cache().get_value(cache_key)

		if not pending_data:
			frappe.throw(_("No pending registration found. Please register again."))

		# Check rate limit
		cls._check_pending_rate_limit(phone_number)

		# Use existing channel if not specified
		if not channel:
			channel = pending_data.get("channel", "sms")

		# Generate new OTP
		settings = cls.get_settings()
		otp_length = settings.otp_length or 6
		expiry_minutes = settings.otp_expiry_minutes or 5
		otp_code = cls._generate_otp(otp_length)

		# DEBUG: Log OTP code (REMOVE IN PRODUCTION!)
		frappe.log_error(
			title="DEBUG Registration OTP Resend",
			message=f"Phone: {phone_number}, OTP: {otp_code}"
		)

		# Send OTP
		formatted_phone = cls._format_phone_e164(phone_number)
		twilio = TwilioClient()
		twilio.send_otp(formatted_phone, otp_code, channel)

		# Update cache with new OTP
		pending_data["otp_hash"] = cls._hash_otp(otp_code)
		pending_data["attempts"] = 0
		pending_data["channel"] = channel
		pending_data["created_at"] = now_datetime().isoformat()

		frappe.cache().set_value(cache_key, pending_data, expires_in_sec=expiry_minutes * 60)

		# Increment rate limit
		cls._increment_pending_rate_limit(phone_number)

		# Mask phone
		masked_phone = phone_number[:3] + "*" * (len(phone_number) - 5) + phone_number[-2:] if len(phone_number) > 5 else "****"

		return {
			"success": True,
			"message": _("Verification code sent"),
			"phone": masked_phone,
			"channel": channel,
			"expiry_minutes": expiry_minutes,
		}

	@classmethod
	def cancel_pending_registration(cls, phone_number: str) -> dict:
		"""
		Cancel pending registration and clear cache.

		Args:
			phone_number: Phone number from registration

		Returns:
			dict with success status
		"""
		cache_key = cls._get_pending_key(phone_number)
		frappe.cache().delete_value(cache_key)

		return {"success": True, "message": _("Registration cancelled")}
