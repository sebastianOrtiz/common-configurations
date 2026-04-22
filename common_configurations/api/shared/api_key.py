"""
API Key Authentication

Provides authentication and authorization for external API services
using API keys sent via X-API-Key header.
"""

import frappe
from frappe import _
from typing import Optional, Dict, Any
from functools import wraps

from .rate_limit import check_rate_limit

API_KEY_HEADER = "X-API-Key"


def get_api_key_from_request() -> Optional[str]:
	"""
	Extract the API key from the request.

	Looks for the key in:
	1. X-API-Key header (preferred)
	2. api_key query parameter (fallback for GET requests)

	Returns:
		str or None: The API key if found
	"""
	key = frappe.request.headers.get(API_KEY_HEADER)
	if key:
		return key.strip()

	key = frappe.form_dict.get("api_key")
	if key:
		return str(key).strip()

	return None


def get_api_service_from_key(api_key: str) -> Optional[Dict[str, Any]]:
	"""
	Find the API Service associated with an API key.

	Searches across all API Service Key child tables to find
	the parent API Service that owns this key.

	Args:
		api_key: The plain API key to look up

	Returns:
		dict with service_name and key_name, or None
	"""
	key_row = frappe.db.get_value(
		"API Service Key",
		{"api_key": api_key, "is_active": 1},
		["name", "key_name", "parent"],
		as_dict=True,
	)

	if not key_row:
		return None

	service = frappe.db.get_value(
		"API Service",
		{"name": key_row.parent, "is_active": 1},
		["name", "title", "rate_limit"],
		as_dict=True,
	)

	if not service:
		return None

	return {
		"service_name": service.name,
		"service_title": service.title,
		"key_name": key_row.key_name,
		"rate_limit": service.rate_limit or 60,
	}


def authenticate_api_key() -> Dict[str, Any]:
	"""
	Authenticate the current request using API key.

	Reads the API key from the request, validates it against
	API Service configurations, and applies rate limiting.

	Returns:
		dict: API Service info (service_name, service_title, key_name, rate_limit)

	Raises:
		frappe.AuthenticationError: If API key is missing or invalid
		frappe.TooManyRequestsError: If rate limit exceeded
	"""
	api_key = get_api_key_from_request()

	if not api_key:
		frappe.throw(
			_("API key is required. Send it via {0} header.").format(API_KEY_HEADER),
			frappe.AuthenticationError,
		)

	service_info = get_api_service_from_key(api_key)

	if not service_info:
		frappe.throw(
			_("Invalid or inactive API key."),
			frappe.AuthenticationError,
		)

	# Apply rate limit per service
	check_rate_limit(
		f"api_service:{service_info['service_name']}",
		limit=service_info["rate_limit"],
		seconds=60,
	)

	return service_info


def require_api_key(endpoint_field: str = None):
	"""
	Decorator to require API key authentication and optionally
	check that a specific endpoint is enabled on the API Service.

	Usage:
		@frappe.whitelist(allow_guest=True, methods=["GET"])
		@require_api_key("enable_lookup_contact")
		def lookup_contact(document):
			service = frappe.local.api_service
			# ...

	Args:
		endpoint_field: Name of the Check field on API Service that
			enables this endpoint (e.g. "enable_lookup_contact").
			If None, only authenticates without checking endpoint permissions.

	Raises:
		frappe.AuthenticationError: If API key is invalid
		frappe.PermissionError: If endpoint is not enabled for this service
	"""
	def decorator(func):
		@wraps(func)
		def wrapper(*args, **kwargs):
			service_info = authenticate_api_key()

			# Check endpoint permission if field specified
			if endpoint_field:
				service_doc = frappe.get_doc("API Service", service_info["service_name"])
				enabled = getattr(service_doc, endpoint_field, 0)

				if not enabled:
					frappe.throw(
						_("This endpoint is not enabled for your API service."),
						frappe.PermissionError,
					)

			# Store service info in local for access in the function
			frappe.local.api_service = service_info

			return func(*args, **kwargs)

		return wrapper

	return decorator
