"""
Custom Exceptions for API Layer

Provides semantic exceptions for API error handling.
These map to appropriate HTTP status codes and Frappe exception types.
"""

import frappe
from frappe import _


class APIError(Exception):
    """
    Base API error.

    All custom API exceptions should inherit from this class.
    """
    status_code = 400
    message = "Error en la solicitud"
    frappe_exception = frappe.ValidationError

    def __init__(self, message: str = None):
        self.message = message or self.__class__.message
        super().__init__(self.message)

    def throw(self):
        """Raise as a Frappe exception."""
        frappe.throw(_(self.message), self.frappe_exception)


class ValidationError(APIError):
    """Invalid input data."""
    status_code = 400
    message = "Datos inválidos"
    frappe_exception = frappe.ValidationError


class NotFoundError(APIError):
    """Resource not found."""
    status_code = 404
    message = "Recurso no encontrado"
    frappe_exception = frappe.DoesNotExistError


class AuthenticationError(APIError):
    """Authentication required or failed."""
    status_code = 401
    message = "Autenticación requerida"
    frappe_exception = frappe.AuthenticationError


class PermissionError(APIError):
    """User doesn't have permission for this action."""
    status_code = 403
    message = "No tienes permiso para realizar esta acción"
    frappe_exception = frappe.PermissionError


class RateLimitError(APIError):
    """Too many requests."""
    status_code = 429
    message = "Demasiadas solicitudes. Por favor espera un momento."
    frappe_exception = frappe.TooManyRequestsError


class ConflictError(APIError):
    """Conflict with current state (e.g., duplicate entry)."""
    status_code = 409
    message = "Conflicto con el estado actual"
    frappe_exception = frappe.ValidationError
