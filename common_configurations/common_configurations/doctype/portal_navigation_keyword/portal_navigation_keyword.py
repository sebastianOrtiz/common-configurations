# Copyright (c) 2026, Sebastian Ortiz Valencia and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class PortalNavigationKeyword(Document):
	def validate(self):
		# Enforce one keyword record per (reference_doctype, reference_name):
		# the store is a per-element cache, not a log.
		duplicate = frappe.db.get_value(
			"Portal Navigation Keyword",
			{
				"reference_doctype": self.reference_doctype,
				"reference_name": self.reference_name,
				"name": ["!=", self.name],
			},
			"name",
		)
		if duplicate:
			frappe.throw(
				_("Ya existe un registro de keywords para {0} {1}").format(
					self.reference_doctype, self.reference_name
				)
			)
