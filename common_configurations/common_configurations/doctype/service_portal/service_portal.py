# Copyright (c) 2026, Sebastian Ortiz Valencia and contributors
# For license information, please see license.txt

import frappe
import re
from frappe import _
from frappe.model.document import Document


class ServicePortal(Document):
	def validate(self):
		"""Validate portal configuration."""
		self.validate_portal_name()
		self._warn_if_otp_disabled()

	def validate_portal_name(self):
		"""
		Ensure portal_name is URL-safe:
		- Only lowercase letters, numbers, hyphens, and underscores
		- No spaces or special characters
		- Cannot start or end with hyphen
		"""
		if not self.portal_name:
			frappe.throw("Portal Name is required")

		# Check if portal_name is URL-safe
		url_safe_pattern = r'^[a-z0-9][a-z0-9_-]*[a-z0-9]$|^[a-z0-9]$'

		if not re.match(url_safe_pattern, self.portal_name):
			frappe.throw(
				f"Portal Name '{self.portal_name}' is not URL-safe. "
				"Use only lowercase letters, numbers, hyphens (-), and underscores (_). "
				"Cannot start or end with a hyphen. "
				"Example: 'portal-consultas' or 'agendamiento_citas'"
			)

		# Additional check for consecutive hyphens/underscores
		if '--' in self.portal_name or '__' in self.portal_name:
			frappe.throw(
				"Portal Name cannot contain consecutive hyphens or underscores"
			)

	def _warn_if_otp_disabled(self):
		"""
		If MFA OTP is enabled on this portal but OTP Settings is not configured,
		show a non-blocking warning so the user is aware.
		"""
		if not (self.require_auth and self.enable_mfa_otp):
			return

		otp_enabled = frappe.db.get_single_value("OTP Settings", "enable_otp_verification")

		if not otp_enabled:
			frappe.msgprint(
				msg=_(
					"El MFA OTP está habilitado en este portal, pero la configuración global de "
					"<strong>OTP Settings</strong> está desactivada.<br><br>"
					"El MFA OTP <strong>no funcionará</strong> hasta que actives la verificación OTP "
					"en <a href='/app/otp-settings'>OTP Settings</a>."
				),
				title=_("OTP no configurado"),
				indicator="orange",
			)
