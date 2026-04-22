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
        validated["document_type"] = normalize_document_type(data["document_type"])

    if "email" in data:
        validated["email"] = validate_email(data.get("email"))

    if "phone_number" in data:
        validated["phone_number"] = validate_phone(data.get("phone_number"))

    if "gender" in data:
        validated["gender"] = normalize_gender(data["gender"])

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


def normalize_document_type(value: str) -> str:
    """
    Normalize document type aliases to the stored DocType value.

    Accepts common aliases (cedula, nit, cc) and maps them
    to the actual Select option stored in User Contact.
    """
    if not value:
        return value

    value = sanitize_string(value, 50)
    if not value:
        return value

    key = value.lower().strip()

    # Get actual options from DocType
    options = _get_select_options("User contact", "document_type")

    # Check if value already matches an option (case-insensitive)
    for opt in options:
        if opt.lower() == key:
            return opt

    # Alias mappings
    cedula_aliases = {"cedula", "cc", "cédula", "cedula de ciudadania", "cédula de ciudadanía"}
    nit_aliases = {"nit"}

    if key in cedula_aliases:
        for opt in options:
            if "cedula" in opt.lower() or "cédula" in opt.lower():
                return opt

    if key in nit_aliases:
        for opt in options:
            if "nit" in opt.lower():
                return opt

    # Return sanitized value as-is, let Frappe validate
    return value


def normalize_gender(value: str) -> str:
    """
    Normalize gender aliases to the stored DocType value.

    Accepts common aliases (hombre, mujer, male, female) and maps
    them to the actual Select option stored in User Contact.
    """
    if not value:
        return value

    value = sanitize_string(value, 50)
    if not value:
        return value

    key = value.lower().strip()

    # Get actual options from DocType
    options = _get_select_options("User contact", "gender")

    # Check if value already matches an option (case-insensitive)
    for opt in options:
        if opt.lower() == key:
            return opt

    # Alias mappings
    male_aliases = {"hombre", "male", "m", "masculino"}
    female_aliases = {"mujer", "female", "f", "femenino"}
    other_aliases = {"otro", "other", "no binario", "non-binary"}
    unspecified_aliases = {"no especifica", "no especificado", "unspecified", "n/a", ""}

    if key in male_aliases:
        for opt in options:
            if "masculino" in opt.lower() or "male" in opt.lower():
                return opt

    if key in female_aliases:
        for opt in options:
            if "femenino" in opt.lower() or "female" in opt.lower():
                return opt

    if key in other_aliases:
        for opt in options:
            if "otro" in opt.lower() or "other" in opt.lower():
                return opt

    if key in unspecified_aliases:
        for opt in options:
            if "no especifica" in opt.lower() or "unspecified" in opt.lower():
                return opt

    # Return sanitized value as-is, let Frappe validate
    return value


def _get_select_options(doctype: str, fieldname: str) -> list:
    """Get Select field options from a DocType definition."""
    meta = frappe.get_meta(doctype)
    field = meta.get_field(fieldname)
    if field and field.options:
        return [opt.strip() for opt in field.options.split("\n") if opt.strip()]
    return []


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
