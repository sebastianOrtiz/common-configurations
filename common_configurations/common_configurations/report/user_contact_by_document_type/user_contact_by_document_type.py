import frappe
from frappe import _


def execute(filters=None):
	"""Execute User Contact by Document Type Report"""
	columns = get_columns()
	data = get_data(filters)
	chart = get_chart_data(data)

	return columns, data, None, chart


def get_columns():
	"""Define report columns"""
	return [
		{
			"fieldname": "document_type",
			"label": _("Document Type"),
			"fieldtype": "Data",
			"width": 200
		},
		{
			"fieldname": "total_contacts",
			"label": _("Total Contacts"),
			"fieldtype": "Int",
			"width": 150
		},
		{
			"fieldname": "with_email",
			"label": _("With Email"),
			"fieldtype": "Int",
			"width": 120
		},
		{
			"fieldname": "with_phone",
			"label": _("With Phone"),
			"fieldtype": "Int",
			"width": 120
		},
		{
			"fieldname": "complete_info",
			"label": _("Complete Info"),
			"fieldtype": "Int",
			"width": 130
		},
		{
			"fieldname": "percentage",
			"label": _("Percentage"),
			"fieldtype": "Percent",
			"width": 120
		}
	]


def get_data(filters):
	"""Get contacts grouped by document type"""
	sql = """
		SELECT
			document_type,
			COUNT(*) as total_contacts,
			SUM(CASE WHEN email IS NOT NULL AND email != '' THEN 1 ELSE 0 END) as with_email,
			SUM(CASE WHEN phone_number IS NOT NULL AND phone_number != '' THEN 1 ELSE 0 END) as with_phone,
			SUM(CASE WHEN (email IS NOT NULL AND email != '')
				AND (phone_number IS NOT NULL AND phone_number != '') THEN 1 ELSE 0 END) as complete_info
		FROM `tabUser contact`
		GROUP BY document_type
		ORDER BY total_contacts DESC
	"""

	result = frappe.db.sql(sql, as_dict=True)

	# Calculate total for percentage
	total = sum(row.total_contacts for row in result)

	data = []
	for row in result:
		percentage = (row.total_contacts / total * 100) if total > 0 else 0
		data.append({
			"document_type": row.document_type,
			"total_contacts": row.total_contacts,
			"with_email": row.with_email,
			"with_phone": row.with_phone,
			"complete_info": row.complete_info,
			"percentage": percentage
		})

	return data


def get_chart_data(data):
	"""Generate chart for document type distribution"""
	if not data:
		return None

	return {
		"data": {
			"labels": [row["document_type"] for row in data],
			"datasets": [
				{
					"name": _("Total Contacts"),
					"values": [row["total_contacts"] for row in data]
				}
			]
		},
		"type": "pie",
		"colors": ["#4c51bf", "#48bb78", "#ed8936", "#f56565"]
	}
