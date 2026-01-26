import frappe
from frappe import _


def execute(filters=None):
	"""Execute User Contact Summary Report"""
	columns = get_columns()
	data = get_data(filters)

	return columns, data


def get_columns():
	"""Define report columns"""
	return [
		{
			"fieldname": "metric",
			"label": _("Metric"),
			"fieldtype": "Data",
			"width": 250
		},
		{
			"fieldname": "value",
			"label": _("Value"),
			"fieldtype": "Data",
			"width": 150
		}
	]


def get_data(filters):
	"""Get user contact summary data"""
	data = []

	# Total contacts
	total_contacts = frappe.db.count("User contact")
	data.append({"metric": _("Total Contacts"), "value": total_contacts})

	# Contacts with email
	contacts_with_email = frappe.db.count("User contact", {"email": ["!=", ""]})
	data.append({"metric": _("Contacts with Email"), "value": contacts_with_email})

	# Contacts without email
	contacts_without_email = total_contacts - contacts_with_email
	data.append({"metric": _("Contacts without Email"), "value": contacts_without_email})

	# Contacts with phone
	contacts_with_phone = frappe.db.count("User contact", {"phone_number": ["!=", ""]})
	data.append({"metric": _("Contacts with Phone"), "value": contacts_with_phone})

	# Contacts without phone
	contacts_without_phone = total_contacts - contacts_with_phone
	data.append({"metric": _("Contacts without Phone"), "value": contacts_without_phone})

	# Add spacing
	data.append({"metric": "", "value": ""})

	# By document type
	data.append({"metric": _("By Document Type"), "value": ""})
	doc_types = frappe.get_all(
		"User contact",
		fields=["document_type", "count(*) as count"],
		group_by="document_type"
	)
	for doc_type in doc_types:
		data.append({
			"metric": f"  {doc_type.document_type}",
			"value": doc_type.count
		})

	# Add spacing
	data.append({"metric": "", "value": ""})

	# By gender
	data.append({"metric": _("By Gender"), "value": ""})
	genders = frappe.get_all(
		"User contact",
		fields=["gender", "count(*) as count"],
		group_by="gender"
	)
	for gender in genders:
		data.append({
			"metric": f"  {gender.gender}",
			"value": gender.count
		})

	return data
