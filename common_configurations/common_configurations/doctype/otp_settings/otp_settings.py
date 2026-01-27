"""
OTP Settings DocType

Single DocType for configuring OTP verification via Twilio (SMS/WhatsApp).
"""

import frappe
from frappe import _
from frappe.model.document import Document


class OTPSettings(Document):
	def validate(self) -> None:
		"""Validate OTP settings configuration."""
		if self.enable_otp_verification:
			self._validate_twilio_config()
			self._validate_otp_config()

	def _validate_twilio_config(self) -> None:
		"""Validate Twilio configuration when OTP is enabled."""
		if not self.twilio_account_sid:
			frappe.throw(_("Twilio Account SID es requerido cuando OTP está habilitado"))

		if not self.twilio_auth_token:
			frappe.throw(_("Twilio Auth Token es requerido cuando OTP está habilitado"))

		if not self.twilio_phone_number and not self.twilio_whatsapp_number:
			frappe.throw(
				_("Al menos un número de teléfono Twilio (SMS o WhatsApp) es requerido")
			)

	def _validate_otp_config(self) -> None:
		"""Validate OTP configuration values."""
		if self.otp_length and (self.otp_length < 4 or self.otp_length > 8):
			frappe.throw(_("La longitud del OTP debe estar entre 4 y 8 dígitos"))

		if self.otp_expiry_minutes and self.otp_expiry_minutes < 1:
			frappe.throw(_("El tiempo de expiración debe ser al menos 1 minuto"))

		if self.max_verification_attempts and self.max_verification_attempts < 1:
			frappe.throw(_("El máximo de intentos debe ser al menos 1"))

	@staticmethod
	def get_settings() -> "OTPSettings":
		"""
		Get OTP settings document (cached).

		Returns:
			OTPSettings: The OTP settings document
		"""
		return frappe.get_cached_doc("OTP Settings")

	@staticmethod
	def is_otp_enabled() -> bool:
		"""
		Check if OTP verification is enabled.

		Returns:
			bool: True if OTP is enabled, False otherwise
		"""
		try:
			settings = OTPSettings.get_settings()
			return bool(settings.enable_otp_verification)
		except Exception:
			return False

	@staticmethod
	def clear_cache() -> None:
		"""Clear the cached OTP settings."""
		frappe.cache().delete_value("OTP Settings")
