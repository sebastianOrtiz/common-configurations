import frappe
from frappe import _


def execute(filters=None):
	"""Execute User Contact Registration Trend Report"""
	columns = get_columns()
	data = get_data(filters)
	chart = get_chart_data(data)

	return columns, data, None, chart


def get_columns():
	"""Define report columns"""
	return [
		{
			"fieldname": "month",
			"label": _("Month"),
			"fieldtype": "Data",
			"width": 150
		},
		{
			"fieldname": "new_contacts",
			"label": _("New Contacts"),
			"fieldtype": "Int",
			"width": 150
		},
		{
			"fieldname": "cumulative",
			"label": _("Cumulative Total"),
			"fieldtype": "Int",
			"width": 150
		}
	]


def get_data(filters):
	"""Get user contact registration trend data"""
	# Default to 12 months if not specified
	months = filters.get("months", 12) if filters else 12

	sql = """
		SELECT
			DATE_FORMAT(creation, '%%Y-%%m') as month,
			COUNT(*) as new_contacts
		FROM `tabUser contact`
		WHERE creation >= DATE_SUB(CURDATE(), INTERVAL %s MONTH)
		GROUP BY month
		ORDER BY month
	"""

	result = frappe.db.sql(sql, [months], as_dict=True)

	# Calculate cumulative
	cumulative = 0
	data = []
	for row in result:
		cumulative += row.new_contacts
		data.append({
			"month": row.month,
			"new_contacts": row.new_contacts,
			"cumulative": cumulative
		})

	return data


def get_chart_data(data):
	"""Generate chart for registration trend"""
	if not data:
		return None

	return {
		"data": {
			"labels": [row["month"] for row in data],
			"datasets": [
				{
					"name": _("New Contacts"),
					"values": [row["new_contacts"] for row in data]
				},
				{
					"name": _("Cumulative Total"),
					"values": [row["cumulative"] for row in data]
				}
			]
		},
		"type": "line",
		"colors": ["#4c51bf", "#48bb78"]
	}
