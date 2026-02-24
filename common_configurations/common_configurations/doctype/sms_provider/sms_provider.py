"""
SMS Provider DocType

Stores credentials and configuration for an SMS provider.
Supports multiple providers via provider_type field.
"""

import frappe
from frappe import _
from frappe.model.document import Document


class SMSProvider(Document):
	def validate(self) -> None:
		"""Validate SMS Provider configuration."""
		if not self.api_url:
			frappe.throw(_("API URL es requerido"))
		if not self.api_key:
			frappe.throw(_("API Key es requerido"))

	def on_trash(self) -> None:
		"""Prevent deletion if this provider is referenced by OTP Settings."""
		linked = frappe.db.get_value("OTP Settings", "OTP Settings", "sms_provider_link")
		if linked == self.name:
			frappe.throw(
				_("No se puede eliminar el proveedor '{0}' porque está siendo "
				  "utilizado en OTP Settings.").format(self.provider_name)
			)
