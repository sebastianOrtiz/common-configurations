"""
Security Utilities for Public APIs

Provides rate limiting, honeypot validation, and input sanitization
for APIs that allow guest access.
"""

import re
import time
import frappe
from frappe import _
from frappe.utils import cint


# ===================
# Rate Limiting
# ===================

def check_rate_limit(action: str, limit: int = 10, seconds: int = 60) -> None:
    """
    Check rate limit for an action by IP address.

    Uses Frappe's cache (Redis) to track request counts per IP.

    Args:
        action: Identifier for the action being rate limited
        limit: Maximum number of requests allowed
        seconds: Time window in seconds

    Raises:
        frappe.TooManyRequestsError: If rate limit exceeded
    """
    ip = get_client_ip()
    cache_key = f"rate_limit:{action}:{ip}"

    # Get current count from cache
    current = cint(frappe.cache.get_value(cache_key) or 0)

    if current >= limit:
        # Log the rate limit hit
        frappe.log_error(
            title=_("Rate Limit Exceeded"),
            message=f"IP: {ip}, Action: {action}, Limit: {limit}/{seconds}s"
        )
        frappe.throw(
            _("Too many requests. Please wait a moment and try again."),
            frappe.TooManyRequestsError
        )

    # Increment counter
    frappe.cache.set_value(cache_key, current + 1, expires_in_sec=seconds)


def get_client_ip() -> str:
    """
    Get the real client IP address, handling proxies.

    Returns:
        str: Client IP address
    """
    # Check for forwarded IP (behind proxy/load balancer)
    forwarded_for = frappe.request.headers.get('X-Forwarded-For', '')
    if forwarded_for:
        # X-Forwarded-For can contain multiple IPs, take the first one
        return forwarded_for.split(',')[0].strip()

    # Check for real IP header
    real_ip = frappe.request.headers.get('X-Real-IP', '')
    if real_ip:
        return real_ip.strip()

    # Fall back to remote address
    return frappe.request.remote_addr or 'unknown'


# ===================
# Honeypot Validation
# ===================

def check_honeypot(honeypot_value: str = None) -> None:
    """
    Check honeypot field to detect bot submissions.

    Bots typically fill all form fields, including hidden ones.
    If the honeypot field has a value, it's likely a bot.

    Args:
        honeypot_value: Value of the honeypot field

    Raises:
        frappe.ValidationError: If honeypot is filled (bot detected)
    """
    if honeypot_value:
        ip = get_client_ip()
        # Log potential bot activity
        frappe.log_error(
            title=_("Bot Detected (Honeypot)"),
            message=f"IP: {ip}, Honeypot value: {honeypot_value[:100]}"
        )
        # Return generic error to not reveal detection
        frappe.throw(_("Invalid request"), frappe.ValidationError)


# ===================
# Input Validation
# ===================

def validate_document_number(document: str, document_type: str = None) -> str:
    """
    Validate and sanitize document number.

    Args:
        document: Document number to validate
        document_type: Type of document (CC, NIT, CE, etc.)

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
    if not re.match(r'^[a-zA-Z0-9\-]+$', document):
        frappe.throw(_("Document number contains invalid characters"), frappe.ValidationError)

    return document


def validate_email(email: str) -> str:
    """
    Validate email format.

    Args:
        email: Email address to validate

    Returns:
        str: Validated email (lowercase)

    Raises:
        frappe.ValidationError: If email is invalid
    """
    if not email:
        return None

    email = str(email).strip().lower()

    # Basic email regex
    email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

    if not re.match(email_pattern, email):
        frappe.throw(_("Invalid email format"), frappe.ValidationError)

    if len(email) > 254:
        frappe.throw(_("Email address is too long"), frappe.ValidationError)

    return email


def validate_phone(phone: str) -> str:
    """
    Validate phone number format.

    Args:
        phone: Phone number to validate

    Returns:
        str: Sanitized phone number

    Raises:
        frappe.ValidationError: If phone is invalid
    """
    if not phone:
        return None

    phone = str(phone).strip()

    # Remove common formatting characters
    cleaned = re.sub(r'[\s\-\(\)\.]', '', phone)

    # Allow + at the beginning for international
    if cleaned.startswith('+'):
        cleaned_check = cleaned[1:]
    else:
        cleaned_check = cleaned

    # Should only contain digits after cleaning
    if not cleaned_check.isdigit():
        frappe.throw(_("Phone number contains invalid characters"), frappe.ValidationError)

    # Reasonable length check (7-15 digits)
    if len(cleaned_check) < 7 or len(cleaned_check) > 15:
        frappe.throw(_("Phone number has invalid length"), frappe.ValidationError)

    return phone


def validate_name(name: str, field_label: str = "Name") -> str:
    """
    Validate a name field (full name, first name, etc.)

    Args:
        name: Name to validate
        field_label: Label for error messages

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

    # Allow letters, spaces, hyphens, apostrophes, and accented characters
    # Block obvious injection attempts
    dangerous_patterns = [
        r'<script', r'javascript:', r'onclick', r'onerror',
        r'SELECT\s+', r'INSERT\s+', r'UPDATE\s+', r'DELETE\s+',
        r'DROP\s+', r'UNION\s+', r'--', r';'
    ]

    name_lower = name.lower()
    for pattern in dangerous_patterns:
        if re.search(pattern, name_lower, re.IGNORECASE):
            frappe.throw(_("Invalid characters in name"), frappe.ValidationError)

    return name


def sanitize_string(value: str, max_length: int = 500) -> str:
    """
    General string sanitization.

    Args:
        value: String to sanitize
        max_length: Maximum allowed length

    Returns:
        str: Sanitized string
    """
    if not value:
        return None

    value = str(value).strip()

    # Truncate if too long
    if len(value) > max_length:
        value = value[:max_length]

    # Remove null bytes and other control characters
    value = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', value)

    return value


def validate_user_contact_data(data: dict) -> dict:
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
    if 'full_name' in data:
        validated['full_name'] = validate_name(data['full_name'], "Full Name")

    if 'document' in data:
        validated['document'] = validate_document_number(
            data['document'],
            data.get('document_type')
        )

    # Optional fields
    if 'document_type' in data:
        validated['document_type'] = sanitize_string(data['document_type'], 50)

    if 'email' in data:
        validated['email'] = validate_email(data.get('email'))

    if 'phone_number' in data:
        validated['phone_number'] = validate_phone(data.get('phone_number'))

    if 'gender' in data:
        # Gender should be from a predefined list
        valid_genders = ['Male', 'Female', 'Other', 'Prefer not to say', '']
        gender = sanitize_string(data['gender'], 50)
        if gender and gender not in valid_genders:
            validated['gender'] = 'Other'
        else:
            validated['gender'] = gender

    # Copy any other fields that might be custom, with sanitization
    known_fields = {'full_name', 'document', 'document_type', 'email', 'phone_number', 'gender'}
    for key, value in data.items():
        if key not in known_fields and key not in validated:
            if isinstance(value, str):
                validated[key] = sanitize_string(value)
            elif isinstance(value, (int, float, bool)):
                validated[key] = value
            # Skip complex types for security

    return validated
