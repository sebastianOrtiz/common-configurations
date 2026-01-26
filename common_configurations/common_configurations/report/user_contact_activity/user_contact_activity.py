import frappe
from frappe import _


def execute(filters=None):
	"""Execute User Contact Activity Report"""
	columns = get_columns()
	data = get_data(filters)

	return columns, data


def get_columns():
	"""Define report columns"""
	return [
		{
			"fieldname": "contact_name",
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
		},
		{
			"fieldname": "total_cases",
			"label": _("Total Cases"),
			"fieldtype": "Int",
			"width": 100
		},
		{
			"fieldname": "active_cases",
			"label": _("Active Cases"),
			"fieldtype": "Int",
			"width": 100
		},
		{
			"fieldname": "total_appointments",
			"label": _("Total Appointments"),
			"fieldtype": "Int",
			"width": 130
		},
		{
			"fieldname": "last_activity",
			"label": _("Last Activity"),
			"fieldtype": "Date",
			"width": 120
		}
	]


def get_data(filters):
	"""Get user contact activity data"""
	# Check if Case Log and Appointment doctypes exist
	has_case_log = frappe.db.exists("DocType", "Case Log")
	has_appointment = frappe.db.exists("DocType", "Appointment")

	sql = """
		SELECT
			uc.name as contact_name,
			uc.full_name,
			uc.email,
			uc.phone_number,
			uc.modified as last_modified
	"""

	# Add case log counts if available
	if has_case_log:
		sql += """,
			(SELECT COUNT(*) FROM `tabCase Log` WHERE user_contact = uc.name) as total_cases,
			(SELECT COUNT(*) FROM `tabCase Log`
			 WHERE user_contact = uc.name
			 AND status NOT IN ('Closed', 'Archived')) as active_cases
		"""
	else:
		sql += """,
			0 as total_cases,
			0 as active_cases
		"""

	# Add appointment counts if available
	if has_appointment:
		sql += """,
			(SELECT COUNT(*) FROM `tabAppointment` WHERE party = uc.name) as total_appointments
		"""
	else:
		sql += """,
			0 as total_appointments
		"""

	sql += """
		FROM `tabUser contact` uc
		ORDER BY
	"""

	# Order by activity
	if has_case_log:
		sql += "total_cases DESC, "
	if has_appointment:
		sql += "total_appointments DESC, "

	sql += "uc.modified DESC"

	result = frappe.db.sql(sql, as_dict=True)

	data = []
	for row in result:
		# Determine last activity date
		last_activity = row.last_modified.date() if row.last_modified else None

		if has_case_log:
			last_case = frappe.db.get_value(
				"Case Log",
				{"user_contact": row.contact_name},
				"modified",
				order_by="modified desc"
			)
			if last_case and (not last_activity or last_case.date() > last_activity):
				last_activity = last_case.date()

		if has_appointment:
			last_appt = frappe.db.get_value(
				"Appointment",
				{"party": row.contact_name},
				"modified",
				order_by="modified desc"
			)
			if last_appt and (not last_activity or last_appt.date() > last_activity):
				last_activity = last_appt.date()

		data.append({
			"contact_name": row.contact_name,
			"full_name": row.full_name,
			"email": row.email or "",
			"phone_number": row.phone_number or "",
			"total_cases": row.total_cases,
			"active_cases": row.active_cases,
			"total_appointments": row.total_appointments,
			"last_activity": last_activity
		})

	return data
