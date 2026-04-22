# Copyright (c) 2026, Nexora online SAS and contributors
# For license information, please see license.txt

"""
API Service DocType

Manages external API service configurations with API key generation
and endpoint access control.
"""

import secrets
import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class APIService(Document):
	def validate(self):
		self._generate_keys_for_new_rows()

	def _generate_keys_for_new_rows(self):
		"""Generate API keys for newly added rows that don't have one yet."""
		for key_row in self.api_keys:
			if not key_row.api_key:
				key_row.api_key = secrets.token_hex(32)
				key_row.created_at = now_datetime()
