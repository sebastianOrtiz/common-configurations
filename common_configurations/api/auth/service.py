"""
Auth Service

Business logic for authentication operations.
"""

import frappe
from typing import Dict, Any, Optional

from ..shared.rate_limit import get_client_ip


class AuthService:
    """
    Service class for authentication operations.

    All methods are classmethods for stateless operation.
    """

    @classmethod
    def get_csrf_token(cls) -> str:
        """
        Get the CSRF token for the current session.

        Returns:
            str: CSRF token
        """
        return frappe.local.session.data.csrf_token

    @classmethod
    def get_authenticated_contact(
        cls, user_contact_name: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get User Contact data for an authenticated user.

        Args:
            user_contact_name: The authenticated User Contact name

        Returns:
            dict or None: Contact data if found
        """
        if not user_contact_name:
            return None

        contacts = frappe.get_all(
            "User contact",
            filters={"name": user_contact_name},
            fields=[
                "name",
                "full_name",
                "document_type",
                "document",
                "phone_number",
                "email",
                "gender",
            ],
            limit=1,
        )

        return contacts[0] if contacts else None

    @classmethod
    def logout(cls, user_contact_name: str) -> bool:
        """
        Logout a User Contact by clearing their token.

        Args:
            user_contact_name: User Contact name

        Returns:
            bool: True if successful
        """
        if not user_contact_name:
            return False

        frappe.db.set_value(
            "User contact",
            user_contact_name,
            {"auth_token_hash": None, "token_created_at": None},
            update_modified=False,
        )
        frappe.db.commit()

        frappe.logger().info(
            f"User contact logged out: {user_contact_name} from IP: {get_client_ip()}"
        )

        return True
