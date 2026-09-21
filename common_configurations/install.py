# Copyright (c) 2026, Sebastian Ortiz Valencia and contributors
# For license information, please see license.txt

import frappe


def after_install():
	install_custom_fields()


def install_custom_fields():
	"""Create custom fields on Service Portal Tool if they don't exist."""
	if not frappe.db.exists("Custom Field", "Service Portal Tool-question_set"):
		frappe.get_doc(
			{
				"doctype": "Custom Field",
				"dt": "Service Portal Tool",
				"fieldname": "question_set",
				"fieldtype": "Link",
				"options": "Portal Question Set",
				"label": "Conjunto de preguntas",
				"description": "Conjunto de preguntas configurables que reemplaza el campo de texto libre de contexto para esta herramienta",
				"insert_after": "is_enabled",
				"module": "Common Configurations",
			}
		).insert(ignore_permissions=True)

	frappe.db.commit()
