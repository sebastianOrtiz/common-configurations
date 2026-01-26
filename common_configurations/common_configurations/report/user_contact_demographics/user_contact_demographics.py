import frappe
from frappe import _


def execute(filters=None):
	"""Execute User Contact Demographics Report"""
	columns = get_columns()
	data = get_data(filters)
	chart = get_chart_data(data)

	return columns, data, None, chart


def get_columns():
	"""Define report columns"""
	return [
		{
			"fieldname": "gender",
			"label": _("Gender"),
			"fieldtype": "Data",
			"width": 180
		},
		{
			"fieldname": "total_contacts",
			"label": _("Total Contacts"),
			"fieldtype": "Int",
			"width": 150
		},
		{
			"fieldname": "cedula_count",
			"label": _("Cédula de ciudadanía"),
			"fieldtype": "Int",
			"width": 150
		},
		{
			"fieldname": "nit_count",
			"label": _("NIT"),
			"fieldtype": "Int",
			"width": 100
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
			"fieldname": "percentage",
			"label": _("Percentage"),
			"fieldtype": "Percent",
			"width": 120
		}
	]


def get_data(filters):
	"""Get demographic data grouped by gender"""
	sql = """
		SELECT
			gender,
			COUNT(*) as total_contacts,
			SUM(CASE WHEN document_type = 'Cedula de ciudadania' THEN 1 ELSE 0 END) as cedula_count,
			SUM(CASE WHEN document_type = 'NIT' THEN 1 ELSE 0 END) as nit_count,
			SUM(CASE WHEN email IS NOT NULL AND email != '' THEN 1 ELSE 0 END) as with_email,
			SUM(CASE WHEN phone_number IS NOT NULL AND phone_number != '' THEN 1 ELSE 0 END) as with_phone
		FROM `tabUser contact`
		GROUP BY gender
		ORDER BY total_contacts DESC
	"""

	result = frappe.db.sql(sql, as_dict=True)

	# Calculate total for percentage
	total = sum(row.total_contacts for row in result)

	data = []
	for row in result:
		percentage = (row.total_contacts / total * 100) if total > 0 else 0
		data.append({
			"gender": row.gender,
			"total_contacts": row.total_contacts,
			"cedula_count": row.cedula_count,
			"nit_count": row.nit_count,
			"with_email": row.with_email,
			"with_phone": row.with_phone,
			"percentage": percentage
		})

	return data


def get_chart_data(data):
	"""Generate chart for gender distribution"""
	if not data:
		return None

	return {
		"data": {
			"labels": [row["gender"] for row in data],
			"datasets": [
				{
					"name": _("Total Contacts"),
					"values": [row["total_contacts"] for row in data]
				}
			]
		},
		"type": "pie",
		"colors": ["#667eea", "#f56565", "#48bb78", "#ed8936"]
	}
