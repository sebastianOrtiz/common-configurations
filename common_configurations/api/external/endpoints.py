"""
External API Endpoints

HTTP endpoints for external integrations (chatbots, mobile apps, etc.)
authenticated via API Key instead of User Contact token.
"""

import frappe
from frappe import _
from typing import Dict, Any

from ..shared.api_key import require_api_key
from ..shared.validators import sanitize_string, validate_document_number
from ..contacts.service import ContactService
from ..contacts.validators import parse_contact_data


@frappe.whitelist(allow_guest=True, methods=["GET"])
@require_api_key("enable_lookup_contact")
def lookup_contact(document: str) -> Dict[str, Any]:
	"""
	Look up a User Contact by document number.

	Returns basic contact info if found, or indicates the contact
	does not exist. Does NOT generate auth tokens.

	Args:
		document: Document number to search

	Returns:
		dict: {exists: bool, name?, full_name?, document?, document_type?}
	"""
	document = validate_document_number(document)

	contact = ContactService.get_by_document(document)

	if not contact:
		return {"exists": False}

	return {
		"exists": True,
		"name": contact["name"],
		"full_name": contact["full_name"],
		"document": contact["document"],
		"document_type": contact["document_type"],
		"phone_number": contact.get("phone_number"),
		"email": contact.get("email"),
	}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@require_api_key("enable_register_contact")
def register_contact(data) -> Dict[str, Any]:
	"""
	Register a new User Contact from an external integration.

	Creates the contact without generating auth tokens (external
	systems don't need portal authentication). If the contact
	already exists, returns the existing contact data.

	Args:
		data: Contact data (dict or JSON string)
			Required: full_name, document, document_type
			Optional: phone_number, email, gender

	Returns:
		dict: {name, full_name, document, document_type, ..., is_new: bool}
	"""
	validated_data = parse_contact_data(data)

	# Check if contact already exists
	existing = ContactService.get_by_document(validated_data.get("document"))

	if existing:
		return {**existing, "is_new": False}

	# Create without OTP/token flow
	doc = frappe.get_doc({"doctype": "User contact", **validated_data})
	doc.insert(ignore_permissions=True)
	frappe.db.commit()

	service = frappe.local.api_service
	frappe.logger().info(
		f"User contact created via API: {doc.name} "
		f"(service: {service['service_title']})"
	)

	return {
		"name": doc.name,
		"full_name": doc.full_name,
		"document": doc.document,
		"document_type": doc.document_type,
		"phone_number": doc.phone_number,
		"email": doc.email,
		"is_new": True,
	}
