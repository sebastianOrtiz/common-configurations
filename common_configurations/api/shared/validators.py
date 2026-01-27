"""
Input Validation Utilities

Provides validation and sanitization functions for common input types.
All validators either return sanitized data or raise frappe.ValidationError.
"""

import re
import frappe
from frappe import _
from typing import Optional


def sanitize_string(value: str, max_length: int = 500) -> Optional[str]:
    """
    General string sanitization.

    Removes control characters and truncates to max length.

    Args:
        value: String to sanitize
        max_length: Maximum allowed length

    Returns:
        str or None: Sanitized string, or None if input is empty
    """
    if not value:
        return None

    value = str(value).strip()

    # Truncate if too long
    if len(value) > max_length:
        value = value[:max_length]

    # Remove null bytes and other control characters
    value = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", value)

    return value


def validate_document_number(document: str, document_type: str = None) -> str:
    """
    Validate and sanitize document number.

    Args:
        document: Document number to validate
        document_type: Type of document (CC, NIT, CE, etc.) - for future validation rules

    Returns:
        str: Sanitized document number

    Raises:
        frappe.ValidationError: If document is invalid
    """
    if not document:
        frappe.throw(_("Document number is required"), frappe.ValidationError)

    # Remove whitespace and convert to string
    document = str(document).strip()

    # Check length (reasonable limits)
    if len(document) < 4:
        frappe.throw(_("Document number is too short"), frappe.ValidationError)

    if len(document) > 20:
        frappe.throw(_("Document number is too long"), frappe.ValidationError)

    # Only allow alphanumeric characters and hyphens
    if not re.match(r"^[a-zA-Z0-9\-]+$", document):
        frappe.throw(
            _("Document number contains invalid characters"), frappe.ValidationError
        )

    return document


def validate_email(email: str) -> Optional[str]:
    """
    Validate email format.

    Args:
        email: Email address to validate

    Returns:
        str or None: Validated email (lowercase), or None if empty

    Raises:
        frappe.ValidationError: If email format is invalid
    """
    if not email:
        return None

    email = str(email).strip().lower()

    # Basic email regex
    email_pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"

    if not re.match(email_pattern, email):
        frappe.throw(_("Invalid email format"), frappe.ValidationError)

    if len(email) > 254:
        frappe.throw(_("Email address is too long"), frappe.ValidationError)

    return email


def validate_phone(phone: str) -> Optional[str]:
    """
    Validate phone number format.

    Accepts international format with + prefix.
    Allows common separators (spaces, dashes, parentheses, dots).

    Args:
        phone: Phone number to validate

    Returns:
        str or None: Original phone number (preserving format), or None if empty

    Raises:
        frappe.ValidationError: If phone format is invalid
    """
    if not phone:
        return None

    phone = str(phone).strip()

    # Remove common formatting characters for validation
    cleaned = re.sub(r"[\s\-\(\)\.]", "", phone)

    # Allow + at the beginning for international
    if cleaned.startswith("+"):
        cleaned_check = cleaned[1:]
    else:
        cleaned_check = cleaned

    # Should only contain digits after cleaning
    if not cleaned_check.isdigit():
        frappe.throw(
            _("Phone number contains invalid characters"), frappe.ValidationError
        )

    # Reasonable length check (7-15 digits)
    if len(cleaned_check) < 7 or len(cleaned_check) > 15:
        frappe.throw(_("Phone number has invalid length"), frappe.ValidationError)

    return phone


def validate_name(name: str, field_label: str = "Name") -> str:
    """
    Validate a name field (full name, first name, etc.)

    Allows letters, spaces, hyphens, apostrophes, and accented characters.
    Blocks potential injection patterns.

    Args:
        name: Name to validate
        field_label: Label for error messages (e.g., "Full Name")

    Returns:
        str: Sanitized name

    Raises:
        frappe.ValidationError: If name is invalid
    """
    if not name:
        frappe.throw(_(f"{field_label} is required"), frappe.ValidationError)

    name = str(name).strip()

    # Length checks
    if len(name) < 2:
        frappe.throw(_(f"{field_label} is too short"), frappe.ValidationError)

    if len(name) > 140:
        frappe.throw(_(f"{field_label} is too long"), frappe.ValidationError)

    # Block obvious injection attempts
    dangerous_patterns = [
        r"<script",
        r"javascript:",
        r"onclick",
        r"onerror",
        r"SELECT\s+",
        r"INSERT\s+",
        r"UPDATE\s+",
        r"DELETE\s+",
        r"DROP\s+",
        r"UNION\s+",
        r"--",
        r";",
    ]

    name_lower = name.lower()
    for pattern in dangerous_patterns:
        if re.search(pattern, name_lower, re.IGNORECASE):
            frappe.throw(_("Invalid characters in name"), frappe.ValidationError)

    return name


def validate_datetime(value: str) -> str:
    """
    Validate datetime string format.

    Args:
        value: Datetime string to validate (expected: YYYY-MM-DD HH:MM:SS)

    Returns:
        str: Validated datetime string

    Raises:
        frappe.ValidationError: If format is invalid
    """
    if not value:
        frappe.throw(_("Datetime is required"), frappe.ValidationError)

    value = str(value).strip()

    # Try to parse the datetime
    try:
        from frappe.utils import get_datetime
        get_datetime(value)
    except Exception:
        frappe.throw(_("Invalid datetime format"), frappe.ValidationError)

    return value


def validate_date(value: str) -> str:
    """
    Validate date string format.

    Args:
        value: Date string to validate (expected: YYYY-MM-DD)

    Returns:
        str: Validated date string

    Raises:
        frappe.ValidationError: If format is invalid
    """
    if not value:
        frappe.throw(_("Date is required"), frappe.ValidationError)

    value = str(value).strip()

    # Basic format check
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", value):
        frappe.throw(_("Invalid date format. Use YYYY-MM-DD"), frappe.ValidationError)

    return value
