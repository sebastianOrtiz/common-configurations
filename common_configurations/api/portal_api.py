"""
Portal API

Custom API endpoints for Service Portal operations
"""

import frappe
import frappe.sessions
from frappe import _


@frappe.whitelist(methods=['GET'], allow_guest=False)
def get_csrf_token():
	"""
	Get CSRF token for the current session

	This endpoint is used by frontend apps (Angular, React) that run on
	website routes where the token is not automatically injected.

	Returns:
		str: CSRF token for the current session
	"""
	try:
		# Get or generate CSRF token for current session
		csrf_token = frappe.sessions.get_csrf_token()

		# Commit to ensure session is saved
		frappe.db.commit()

		return csrf_token
	except Exception as e:
		frappe.log_error(f"Error getting CSRF token: {str(e)}")
		frappe.throw(_("Error getting CSRF token"))


@frappe.whitelist(methods=['GET', 'POST'], xss_safe=True)
def get_user_contact_by_document(document):
	"""
	Get User Contact by document number

	Args:
		document (str): Document number to search

	Returns:
		dict: User Contact document or None
	"""
	# Ensure user is logged in
	if frappe.session.user == 'Guest':
		frappe.throw(_("Authentication required"))

	try:
		contacts = frappe.get_all(
			'User contact',
			filters={'document': document},
			fields=['*'],
			limit=1
		)

		if contacts and len(contacts) > 0:
			return contacts[0]

		return None

	except Exception as e:
		frappe.log_error(f"Error getting user contact by document: {str(e)}")
		frappe.throw(_("Error searching for contact"))


@frappe.whitelist(methods=['POST'], xss_safe=True)
def create_user_contact(data):
	"""
	Create a new User Contact

	Args:
		data (dict): User Contact data

	Returns:
		dict: Created User Contact document
	"""
	# Ensure user is logged in
	if frappe.session.user == 'Guest':
		frappe.throw(_("Authentication required"))

	try:
		# Parse data if it's a string (from JSON)
		if isinstance(data, str):
			import json
			data = json.loads(data)

		# Create new document
		doc = frappe.get_doc({
			'doctype': 'User contact',
			**data
		})

		doc.insert()
		frappe.db.commit()

		return doc.as_dict()

	except Exception as e:
		frappe.log_error(f"Error creating user contact: {str(e)}")
		frappe.throw(_("Error creating contact: {0}").format(str(e)))


@frappe.whitelist(methods=['POST'], xss_safe=True)
def update_user_contact(name, data):
	"""
	Update an existing User Contact

	Args:
		name (str): Name/ID of the User Contact document
		data (dict): Fields to update

	Returns:
		dict: Updated User Contact document
	"""
	# Ensure user is logged in
	if frappe.session.user == 'Guest':
		frappe.throw(_("Authentication required"))

	try:
		# Parse data if it's a string (from JSON)
		if isinstance(data, str):
			import json
			data = json.loads(data)

		# Get existing document
		doc = frappe.get_doc('User contact', name)

		# Update fields
		for key, value in data.items():
			if hasattr(doc, key):
				setattr(doc, key, value)

		doc.save()
		frappe.db.commit()

		return doc.as_dict()

	except Exception as e:
		frappe.log_error(f"Error updating user contact: {str(e)}")
		frappe.throw(_("Error updating contact: {0}").format(str(e)))


@frappe.whitelist(methods=['GET', 'POST'], xss_safe=True)
def get_user_contact_fields():
	"""
	Get User Contact DocType fields metadata

	Returns:
		list: List of field definitions
	"""
	# Ensure user is logged in
	if frappe.session.user == 'Guest':
		frappe.throw(_("Authentication required"))

	try:
		meta = frappe.get_meta('User contact')

		fields = []
		for field in meta.fields:
			# Only include data entry fields (exclude Section Break, Column Break, etc.)
			if field.fieldtype in [
				'Data', 'Select', 'Int', 'Float', 'Currency',
				'Date', 'Datetime', 'Time', 'Check', 'Text',
				'Small Text', 'Long Text', 'Link', 'Dynamic Link',
				'Phone', 'Email'
			] and not field.hidden and not field.read_only:
				fields.append({
					'fieldname': field.fieldname,
					'fieldtype': field.fieldtype,
					'label': field.label,
					'reqd': field.reqd,
					'options': field.options,
					'default': field.default,
					'description': field.description,
					'read_only': field.read_only,
					'hidden': field.hidden,
					'length': field.length,
					'precision': field.precision,
				})

		return fields

	except Exception as e:
		frappe.log_error(f"Error getting user contact fields: {str(e)}")
		frappe.throw(_("Error loading form fields"))
