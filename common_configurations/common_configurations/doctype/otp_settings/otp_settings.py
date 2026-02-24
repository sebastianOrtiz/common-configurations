"""
OTP Settings DocType

Single DocType for configuring OTP verification via SMS.
Delega las credenciales del proveedor al DocType SMS Provider.
"""

import frappe
from frappe import _
from frappe.model.document import Document


class OTPSettings(Document):
	def validate(self) -> None:
		"""Validate OTP settings configuration."""
		if self.enable_otp_verification:
			self._validate_provider_link()
			self._validate_otp_config()

	def _validate_provider_link(self) -> None:
		"""Validate that a valid, active SMS Provider is linked."""
		if not self.sms_provider_link:
			frappe.throw(_("Se debe seleccionar un SMS Provider cuando OTP está habilitado"))

		provider_is_active = frappe.db.get_value("SMS Provider", self.sms_provider_link, "is_active")
		if not provider_is_active:
			frappe.throw(
				_("El SMS Provider '{0}' no está activo. "
				  "Active el proveedor antes de habilitarlo en OTP Settings.").format(
					self.sms_provider_link
				)
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

	def on_update(self) -> None:
		"""Clear cache when settings are updated."""
		self.clear_cache()

	def after_insert(self) -> None:
		"""Clear cache when settings are first created."""
		self.clear_cache()

	@staticmethod
	def clear_cache() -> None:
		"""Clear the cached OTP settings."""
		frappe.cache().delete_value("OTP Settings")
		frappe.clear_document_cache("OTP Settings", "OTP Settings")
