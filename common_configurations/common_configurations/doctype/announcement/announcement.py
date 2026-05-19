# Copyright (c) 2026, Nexora Online SAS and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class Announcement(Document):
	def validate(self):
		self._validate_date_range()

	def _validate_date_range(self):
		if self.valid_from and self.valid_to and self.valid_from > self.valid_to:
			frappe.throw(_("Valid From cannot be later than Valid To"))
