"""
Shared utilities for API layer.

This module provides common functionality used across all API domains:
- Security utilities (rate limiting, honeypot)
- Input validation and sanitization
- Token authentication for User Contacts
- Custom exceptions
"""

from .rate_limit import check_rate_limit, get_client_ip
from .validators import (
    sanitize_string,
    validate_document_number,
    validate_email,
    validate_phone,
    validate_name,
)
from .security import (
    check_honeypot,
    generate_auth_token,
    hash_token,
    verify_token,
    create_user_contact_token,
    get_token_from_request,
    get_current_user_contact,
    require_user_contact,
    validate_user_contact_ownership,
    AUTH_HEADER,
    TOKEN_EXPIRY_DAYS,
)
from .email import (
    has_outgoing_email,
    send_email,
)
from .exceptions import (
    APIError,
    ValidationError,
    NotFoundError,
    AuthenticationError,
    PermissionError,
    RateLimitError,
)
from .api_key import (
    get_api_key_from_request,
    get_api_service_from_key,
    authenticate_api_key,
    require_api_key,
    API_KEY_HEADER,
)

__all__ = [
    # Rate limiting
    "check_rate_limit",
    "get_client_ip",
    # Validators
    "sanitize_string",
    "validate_document_number",
    "validate_email",
    "validate_phone",
    "validate_name",
    # Security
    "check_honeypot",
    "generate_auth_token",
    "hash_token",
    "verify_token",
    "create_user_contact_token",
    "get_token_from_request",
    "get_current_user_contact",
    "require_user_contact",
    "validate_user_contact_ownership",
    "AUTH_HEADER",
    "TOKEN_EXPIRY_DAYS",
    # Email
    "has_outgoing_email",
    "send_email",
    # Exceptions
    "APIError",
    "ValidationError",
    "NotFoundError",
    "AuthenticationError",
    "PermissionError",
    "RateLimitError",
    # API Key
    "get_api_key_from_request",
    "get_api_service_from_key",
    "authenticate_api_key",
    "require_api_key",
    "API_KEY_HEADER",
]
