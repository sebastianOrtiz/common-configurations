import frappe


def execute():
	"""Default voice_diagnostics_enabled to ON for sites that never saved the Settings."""
	exists = frappe.db.exists(
		"Singles",
		{"doctype": "Common Configurations Settings", "field": "voice_diagnostics_enabled"},
	)
	if not exists:
		frappe.db.set_single_value("Common Configurations Settings", "voice_diagnostics_enabled", 1)
