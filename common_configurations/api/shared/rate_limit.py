"""
Rate Limiting Utilities

Provides IP-based rate limiting using Frappe's cache (Redis).
"""

import frappe
from frappe import _
from frappe.utils import cint


def get_client_ip() -> str:
    """
    Get the real client IP address, handling proxies.

    Checks headers in order:
    1. X-Forwarded-For (first IP if multiple)
    2. X-Real-IP
    3. Remote address

    Returns:
        str: Client IP address
    """
    # Check for forwarded IP (behind proxy/load balancer)
    forwarded_for = frappe.request.headers.get("X-Forwarded-For", "")
    if forwarded_for:
        # X-Forwarded-For can contain multiple IPs, take the first one
        return forwarded_for.split(",")[0].strip()

    # Check for real IP header
    real_ip = frappe.request.headers.get("X-Real-IP", "")
    if real_ip:
        return real_ip.strip()

    # Fall back to remote address
    return frappe.request.remote_addr or "unknown"


def check_rate_limit(action: str, limit: int = 10, seconds: int = 60) -> None:
    """
    Check rate limit for an action by IP address.

    Uses Frappe's cache (Redis) to track request counts per IP.
    Raises TooManyRequestsError if limit is exceeded.

    Args:
        action: Identifier for the action being rate limited (e.g., "create_contact")
        limit: Maximum number of requests allowed in the time window
        seconds: Time window in seconds

    Raises:
        frappe.TooManyRequestsError: If rate limit exceeded

    Example:
        ```python
        check_rate_limit("create_contact", limit=10, seconds=60)
        # Allows 10 requests per minute per IP
        ```
    """
    ip = get_client_ip()
    cache_key = f"rate_limit:{action}:{ip}"

    # Get current count from cache
    current = cint(frappe.cache.get_value(cache_key) or 0)

    if current >= limit:
        # Log the rate limit hit
        frappe.log_error(
            title=_("Rate Limit Exceeded"),
            message=f"IP: {ip}, Action: {action}, Limit: {limit}/{seconds}s",
        )
        frappe.throw(
            _("Too many requests. Please wait a moment and try again."),
            frappe.TooManyRequestsError,
        )

    # Increment counter
    frappe.cache.set_value(cache_key, current + 1, expires_in_sec=seconds)
