"""
Contact Validators

Validation specific to User Contact domain.
"""

import json
import frappe
from frappe import _
from typing import Dict, Any

from ..shared.validators import (
    sanitize_string,
    validate_document_number,
    validate_email,
    validate_phone,
    validate_name,
)


def validate_user_contact_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate all fields for User Contact creation/update.

    Args:
        data: Dictionary of field values

    Returns:
        dict: Validated and sanitized data

    Raises:
        frappe.ValidationError: If any field is invalid
    """
    validated = {}

    # Required fields
    if "full_name" in data:
        validated["full_name"] = validate_name(data["full_name"], "Nombre completo")

    if "document" in data:
        validated["document"] = validate_document_number(
            data["document"], data.get("document_type")
        )

    # Optional fields
    if "document_type" in data:
        validated["document_type"] = sanitize_string(data["document_type"], 50)

    if "email" in data:
        validated["email"] = validate_email(data.get("email"))

    if "phone_number" in data:
        validated["phone_number"] = validate_phone(data.get("phone_number"))

    if "gender" in data:
        # Just sanitize - Frappe will validate against DocType options
        validated["gender"] = sanitize_string(data["gender"], 50)

    # Copy any other fields that might be custom, with sanitization
    known_fields = {
        "full_name",
        "document",
        "document_type",
        "email",
        "phone_number",
        "gender",
    }
    for key, value in data.items():
        if key not in known_fields and key not in validated:
            if isinstance(value, str):
                validated[key] = sanitize_string(value)
            elif isinstance(value, (int, float, bool)):
                validated[key] = value
            # Skip complex types for security

    return validated


def parse_contact_data(data) -> Dict[str, Any]:
    """
    Parse and validate contact data from request.

    Handles both dict and JSON string input.

    Args:
        data: Contact data (dict or JSON string)

    Returns:
        dict: Validated and sanitized data

    Raises:
        frappe.ValidationError: If data is invalid
    """
    # Parse data if it's a string (from JSON)
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except json.JSONDecodeError:
            frappe.throw(_("Invalid data format"), frappe.ValidationError)

    if not isinstance(data, dict):
        frappe.throw(_("Data must be a dictionary"), frappe.ValidationError)

    return validate_user_contact_data(data)
