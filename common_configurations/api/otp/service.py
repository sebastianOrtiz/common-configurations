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

		# Send OTP via Twilio
		twilio = TwilioClient()
		twilio.send_otp(doc.phone_number, otp_code, channel)

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

		# Check if OTP exists
		if not doc.otp_hash or not doc.otp_created_at:
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
		if otp_hash != doc.otp_hash:
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
