import frappe
from frappe import _


def execute(filters=None):
	"""Execute Incomplete Contact Information Report"""
	columns = get_columns()
	data = get_data(filters)

	return columns, data


def get_columns():
	"""Define report columns"""
	return [
		{
			"fieldname": "name",
			"label": _("Contact ID"),
			"fieldtype": "Link",
			"options": "User contact",
			"width": 120
		},
		{
			"fieldname": "full_name",
			"label": _("Full Name"),
			"fieldtype": "Data",
			"width": 200
		},
		{
			"fieldname": "document_type",
			"label": _("Document Type"),
			"fieldtype": "Data",
			"width": 150
		},
		{
			"fieldname": "document",
			"label": _("Document Number"),
			"fieldtype": "Data",
			"width": 150
		},
		{
			"fieldname": "missing_fields",
			"label": _("Missing Information"),
			"fieldtype": "Data",
			"width": 250
		},
		{
			"fieldname": "email",
			"label": _("Email"),
			"fieldtype": "Data",
			"width": 180
		},
		{
			"fieldname": "phone_number",
			"label": _("Phone"),
			"fieldtype": "Data",
			"width": 120
		}
	]


def get_data(filters):
	"""Get contacts with incomplete information"""
	# Get all contacts
	contacts = frappe.get_all(
		"User contact",
		fields=["name", "full_name", "document_type", "document", "email", "phone_number"],
		order_by="creation desc"
	)

	data = []
	for contact in contacts:
		missing = []

		# Check for missing fields
		if not contact.email:
			missing.append(_("Email"))
		if not contact.phone_number:
			missing.append(_("Phone"))

		# Only include contacts with missing information
		if missing:
			data.append({
				"name": contact.name,
				"full_name": contact.full_name,
				"document_type": contact.document_type,
				"document": contact.document,
				"missing_fields": ", ".join(missing),
				"email": contact.email or _("Missing"),
				"phone_number": contact.phone_number or _("Missing")
			})

	return data
