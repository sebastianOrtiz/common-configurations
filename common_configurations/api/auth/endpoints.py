"""
Auth API Endpoints

HTTP endpoints for authentication operations.
"""

import frappe

from ..shared.rate_limit import check_rate_limit
from ..shared.security import check_honeypot, get_current_user_contact
from .service import AuthService


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_csrf_token():
    """
    Get CSRF token for the current session.

    This endpoint is needed for frontend SPAs that need to make POST requests
    but don't have access to the CSRF token from the page.

    Rate limited: 30 requests per minute per IP.

    Returns:
        str: CSRF token
    """
    check_rate_limit("get_csrf", limit=30, seconds=60)

    return AuthService.get_csrf_token()


@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_authenticated_user_contact():
    """
    Get the currently authenticated User Contact.

    Validates the auth token from the request header and returns the User Contact
    if authenticated. Use this endpoint to verify if the user is still authenticated.

    Rate limited: 30 requests per minute per IP.

    Returns:
        dict: User Contact data if authenticated, None otherwise
    """
    check_rate_limit("get_auth_user", limit=30, seconds=60)

    try:
        user_contact_name = get_current_user_contact()
        return AuthService.get_authenticated_contact(user_contact_name)

    except Exception as e:
        frappe.log_error(f"Error getting authenticated user contact: {str(e)}")
        return None


@frappe.whitelist(allow_guest=True, methods=["POST"])
def logout_user_contact(honeypot: str = None):
    """
    Logout current User Contact by invalidating their token.

    Rate limited: 20 requests per minute per IP.
    Protected by honeypot field.

    Args:
        honeypot: Honeypot field (should be empty)

    Returns:
        dict: Success status
    """
    check_honeypot(honeypot)
    check_rate_limit("logout", limit=20, seconds=60)

    try:
        user_contact_name = get_current_user_contact()
        success = AuthService.logout(user_contact_name) if user_contact_name else True

        return {"success": success}

    except Exception as e:
        frappe.log_error(f"Error logging out user contact: {str(e)}")
        return {"success": False}
