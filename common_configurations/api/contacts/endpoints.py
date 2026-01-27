"""
Contact API Endpoints

HTTP endpoints for User Contact operations.
This layer handles HTTP concerns (request/response, auth checks, rate limiting).
Business logic is delegated to the service layer.
"""

import frappe
from frappe import _

from ..shared.rate_limit import check_rate_limit
from ..shared.security import check_honeypot
from ..shared.validators import sanitize_string, validate_document_number
from .service import ContactService
from .validators import parse_contact_data


@frappe.whitelist(allow_guest=True, methods=["GET", "POST"])
def get_user_contact_by_document(document: str, honeypot: str = None):
    """
    Get User Contact by document number and generate auth token.

    This endpoint is used to "login" a returning user by their document number.
    On success, it generates a new auth token for subsequent requests.

    Rate limited: 30 requests per minute per IP.
    Protected by honeypot field.

    Args:
        document: Document number to search
        honeypot: Honeypot field (should be empty)

    Returns:
        dict: User Contact data with auth_token, or None if not found
    """
    # Security checks
    check_honeypot(honeypot)
    check_rate_limit("get_contact", limit=30, seconds=60)

    # Validate input
    document = validate_document_number(document)

    try:
        return ContactService.authenticate(document)

    except frappe.ValidationError:
        raise
    except Exception as e:
        frappe.log_error(f"Error getting user contact by document: {str(e)}")
        frappe.throw(_("Error searching for contact"))


@frappe.whitelist(allow_guest=True, methods=["POST"])
def create_user_contact(data, honeypot: str = None):
    """
    Create a new User Contact and generate auth token.

    If a contact with the same document number already exists, an error is thrown
    indicating the user should use the "login" flow instead.

    Rate limited: 20 requests per minute per IP.
    Protected by honeypot field.
    All data is validated and sanitized.

    Args:
        data: User Contact data (dict or JSON string)
        honeypot: Honeypot field (should be empty)

    Returns:
        dict: Created User Contact with auth_token
    """
    # Security checks
    check_honeypot(honeypot)
    check_rate_limit("create_contact", limit=20, seconds=60)

    try:
        # Parse and validate data
        validated_data = parse_contact_data(data)

        # Delegate to service
        return ContactService.create(validated_data)

    except frappe.ValidationError:
        raise
    except Exception as e:
        frappe.log_error(f"Error creating user contact: {str(e)}")
        frappe.throw(_("Error creating contact"))


@frappe.whitelist(allow_guest=True, methods=["POST"])
def update_user_contact(name: str, data, honeypot: str = None):
    """
    Update an existing User Contact.

    Rate limited: 20 requests per minute per IP.
    Protected by honeypot field.

    Args:
        name: Name/ID of the User Contact document
        data: Fields to update (dict or JSON string)
        honeypot: Honeypot field (should be empty)

    Returns:
        dict: Updated User Contact document
    """
    # Security checks
    check_honeypot(honeypot)
    check_rate_limit("update_contact", limit=20, seconds=60)

    if not name:
        frappe.throw(_("Contact ID is required"), frappe.ValidationError)

    name = sanitize_string(name, 140)

    try:
        # Parse and validate data
        validated_data = parse_contact_data(data)

        # Delegate to service
        return ContactService.update(name, validated_data)

    except frappe.ValidationError:
        raise
    except frappe.DoesNotExistError:
        raise
    except Exception as e:
        frappe.log_error(f"Error updating user contact: {str(e)}")
        frappe.throw(_("Error updating contact"))


@frappe.whitelist(allow_guest=True, methods=["GET", "POST"])
def get_user_contact_fields():
    """
    Get User Contact DocType fields metadata for dynamic form generation.

    Rate limited: 30 requests per minute per IP.

    Returns:
        list: List of field definitions
    """
    check_rate_limit("get_fields", limit=30, seconds=60)

    try:
        return ContactService.get_fields_metadata()

    except Exception as e:
        frappe.log_error(f"Error getting user contact fields: {str(e)}")
        frappe.throw(_("Error loading form fields"))
