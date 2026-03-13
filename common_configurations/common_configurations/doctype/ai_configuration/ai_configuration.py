# Copyright (c) 2026, Sebastian Ortiz Valencia and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class AIConfiguration(Document):

	def validate(self):
		self._validate_parameters()

	def _validate_parameters(self):
		if self.temperature is not None:
			if self.temperature < 0 or self.temperature > 2:
				frappe.throw(_("Temperature must be between 0.0 and 2.0"))
		if self.max_tokens is not None:
			if self.max_tokens < 1:
				frappe.throw(_("Max Tokens must be at least 1"))

	@frappe.whitelist()
	def test_connection(self):
		"""Test the AI provider connection."""
		from common_configurations.api.ai.client_factory import get_ai_client

		try:
			client = get_ai_client(self.config_name)
			response = client.chat("Respond with only: OK")
			return {"success": True, "response": response}
		except Exception as e:
			return {"success": False, "error": str(e)}
