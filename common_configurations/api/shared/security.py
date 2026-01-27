"""
Security Utilities

Provides authentication, honeypot validation, and ownership verification
for User Contact token-based authentication system.
"""

import secrets
import hashlib
import frappe
from frappe import _
from frappe.utils import now_datetime, get_datetime
from typing import Optional
from functools import wraps

from .rate_limit import get_client_ip


# ===================
# Configuration
# ===================

TOKEN_LENGTH = 32  # 256 bits of entropy
TOKEN_EXPIRY_DAYS = 30  # Token valid for 30 days
AUTH_HEADER = "X-User-Contact-Token"


# ===================
# Honeypot Validation
# ===================


def check_honeypot(honeypot_value: str = None) -> None:
    """
    Check honeypot field to detect bot submissions.

    Bots typically fill all form fields, including hidden ones.
    If the honeypot field has a value, it's likely a bot.

    Args:
        honeypot_value: Value of the honeypot field (should be empty)

    Raises:
        frappe.ValidationError: If honeypot is filled (bot detected)
    """
    if honeypot_value:
        ip = get_client_ip()
        # Log potential bot activity
        frappe.log_error(
            title=_("Bot Detected (Honeypot)"),
            message=f"IP: {ip}, Honeypot value: {honeypot_value[:100]}",
        )
        # Return generic error to not reveal detection
        frappe.throw(_("Invalid request"), frappe.ValidationError)


# ===================
# Token Generation
# ===================


def generate_auth_token() -> str:
    """
    Generate a secure random authentication token.

    Uses Python's secrets module for cryptographically secure random generation.

    Returns:
        str: A secure random token (64 character hex string)
    """
    return secrets.token_hex(TOKEN_LENGTH)


def hash_token(token: str) -> str:
    """
    Hash a token for secure storage.

    Uses SHA-256 for fast verification (tokens are already high-entropy).

    Args:
        token: The plain token to hash

    Returns:
        str: The hashed token (64 character hex string)
    """
    return hashlib.sha256(token.encode()).hexdigest()


def verify_token(token: str, token_hash: str) -> bool:
    """
    Verify a token against its stored hash.

    Uses constant-time comparison to prevent timing attacks.

    Args:
        token: The plain token to verify
        token_hash: The stored hash to compare against

    Returns:
        bool: True if the token matches the hash
    """
    if not token or not token_hash:
        return False

    return secrets.compare_digest(hash_token(token), token_hash)


# ===================
# Token Management
# ===================


def create_user_contact_token(user_contact_name: str) -> str:
    """
    Generate and store a new authentication token for a User Contact.

    Creates a new token, hashes it, and stores the hash in the User Contact document.
    Previous tokens are automatically invalidated (only one active token per user).

    Args:
        user_contact_name: The name (ID) of the User Contact

    Returns:
        str: The plain token (to be sent to the user)

    Note:
        Caller must call frappe.db.commit() to persist the token.
    """
    token = generate_auth_token()
    token_hash = hash_token(token)

    # Update the User Contact with the hashed token
    frappe.db.set_value(
        "User contact",
        user_contact_name,
        {"auth_token_hash": token_hash, "token_created_at": now_datetime()},
        update_modified=False,
    )

    return token


def get_token_from_request() -> Optional[str]:
    """
    Extract the authentication token from the request.

    Looks for the token in:
    1. X-User-Contact-Token header (preferred)
    2. user_contact_token query parameter (for GET requests)

    Returns:
        str or None: The token if found
    """
    # Try header first
    token = frappe.request.headers.get(AUTH_HEADER)
    if token:
        return token.strip()

    # Try query parameter
    token = frappe.form_dict.get("user_contact_token")
    if token:
        return str(token).strip()

    return None


def get_current_user_contact() -> Optional[str]:
    """
    Get the authenticated User Contact from the current request.

    Validates the token from the request and returns the User Contact name
    if authentication is valid. Checks for token expiry.

    Returns:
        str or None: The User Contact name if authenticated, None otherwise
    """
    token = get_token_from_request()

    if not token:
        return None

    try:
        # Find User Contact with matching token hash
        token_hash = hash_token(token)

        user_contact = frappe.db.get_value(
            "User contact",
            {"auth_token_hash": token_hash},
            ["name", "token_created_at"],
            as_dict=True,
        )

        if not user_contact:
            return None

        # Check token expiry
        if user_contact.token_created_at:
            token_age = get_datetime(now_datetime()) - get_datetime(
                user_contact.token_created_at
            )
            if token_age.days > TOKEN_EXPIRY_DAYS:
                # Token expired - clear it
                frappe.db.set_value(
                    "User contact",
                    user_contact.name,
                    {"auth_token_hash": None, "token_created_at": None},
                    update_modified=False,
                )
                return None

        return user_contact.name

    except Exception as e:
        frappe.log_error(f"Error validating user contact token: {str(e)}")
        return None


# ===================
# Decorators
# ===================


def require_user_contact(allow_guest: bool = False):
    """
    Decorator to require a valid User Contact authentication.

    Validates the token from the request and stores the user_contact
    in frappe.local for access within the decorated function.

    Usage:
        ```python
        @frappe.whitelist(allow_guest=True)
        @require_user_contact()
        def my_endpoint():
            user_contact = frappe.local.user_contact
            # ... use user_contact
        ```

    Args:
        allow_guest: If True, allows requests without token (user_contact will be None)

    Raises:
        frappe.AuthenticationError: If token is invalid and allow_guest is False
    """

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            user_contact = get_current_user_contact()

            if not user_contact and not allow_guest:
                frappe.throw(
                    _("Authentication required. Please register or login first."),
                    frappe.AuthenticationError,
                )

            # Store user_contact in local for access in the function
            frappe.local.user_contact = user_contact

            return func(*args, **kwargs)

        return wrapper

    return decorator


# ===================
# Ownership Validation
# ===================


def validate_user_contact_ownership(
    user_contact: str, resource_type: str, resource_name: str
) -> bool:
    """
    Validate that a User Contact owns a specific resource.

    Used to ensure users can only access their own data.

    Args:
        user_contact: The User Contact name
        resource_type: DocType of the resource (e.g., "Appointment")
        resource_name: Name of the resource document

    Returns:
        bool: True if the user contact owns the resource

    Raises:
        frappe.PermissionError: If the user doesn't own the resource
    """
    if not user_contact:
        return False

    # Get the user_contact field from the resource
    owner_contact = frappe.db.get_value(resource_type, resource_name, "user_contact")

    if owner_contact != user_contact:
        frappe.throw(
            _("You don't have permission to access this resource."),
            frappe.PermissionError,
        )

    return True
