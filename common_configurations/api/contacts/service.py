"""
Contact Service

Business logic for User Contact operations.
This layer contains pure business logic without HTTP concerns.
"""

import frappe
from frappe import _
from typing import Dict, Any, Optional, List

from ..shared.security import create_user_contact_token
from ..shared.rate_limit import get_client_ip


class ContactService:
    """
    Service class for User Contact operations.

    All methods are classmethods to avoid unnecessary instantiation.
    This is a stateless service.
    """

    @classmethod
    def get_by_document(cls, document: str) -> Optional[Dict[str, Any]]:
        """
        Find a User Contact by document number.

        Args:
            document: Document number to search

        Returns:
            dict or None: Contact data if found, None otherwise
        """
        contacts = frappe.get_all(
            "User contact",
            filters={"document": document},
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
    def get_by_name(cls, name: str) -> Optional[Dict[str, Any]]:
        """
        Get a User Contact by name/ID.

        Args:
            name: User Contact name (e.g., "USER-001")

        Returns:
            dict or None: Contact data if found, None otherwise
        """
        if not frappe.db.exists("User contact", name):
            return None

        contacts = frappe.get_all(
            "User contact",
            filters={"name": name},
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
    def create(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new User Contact.

        Args:
            data: Validated contact data

        Returns:
            dict: Created contact with auth_token

        Raises:
            frappe.ValidationError: If document already exists
        """
        # Check if contact with same document already exists
        existing = frappe.db.exists(
            "User contact", {"document": data.get("document")}
        )
        if existing:
            frappe.throw(
                _(
                    "Ya existe un usuario registrado con este número de documento. "
                    "Por favor usa la opción 'Estoy registrado' para conectarte."
                ),
                frappe.ValidationError,
            )

        # Create new document
        doc = frappe.get_doc({"doctype": "User contact", **data})

        doc.insert(ignore_permissions=True)
        frappe.db.commit()

        # Generate auth token
        auth_token = create_user_contact_token(doc.name)
        frappe.db.commit()

        # Log creation
        frappe.logger().info(
            f"User contact created: {doc.name} from IP: {get_client_ip()}"
        )

        result = doc.as_dict()
        result["auth_token"] = auth_token
        return result

    @classmethod
    def update(cls, name: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update an existing User Contact.

        Args:
            name: User Contact name
            data: Validated update data

        Returns:
            dict: Updated contact data

        Raises:
            frappe.DoesNotExistError: If contact not found
        """
        if not frappe.db.exists("User contact", name):
            frappe.throw(_("Contact not found"), frappe.DoesNotExistError)

        doc = frappe.get_doc("User contact", name)

        for key, value in data.items():
            if hasattr(doc, key):
                setattr(doc, key, value)

        doc.save(ignore_permissions=True)
        frappe.db.commit()

        # Log update
        frappe.logger().info(
            f"User contact updated: {doc.name} from IP: {get_client_ip()}"
        )

        return doc.as_dict()

    @classmethod
    def authenticate(cls, document: str) -> Optional[Dict[str, Any]]:
        """
        Authenticate a User Contact by document number.

        Finds the contact and generates a new auth token.

        Args:
            document: Document number

        Returns:
            dict or None: Contact data with auth_token, or None if not found
        """
        contact = cls.get_by_document(document)

        if not contact:
            return None

        # Generate new auth token
        auth_token = create_user_contact_token(contact["name"])
        frappe.db.commit()

        # Log authentication
        frappe.logger().info(
            f"User contact authenticated: {contact['name']} from IP: {get_client_ip()}"
        )

        return {**contact, "auth_token": auth_token}

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

    @classmethod
    def get_fields_metadata(cls) -> List[Dict[str, Any]]:
        """
        Get User Contact DocType fields metadata for dynamic form generation.

        Returns:
            list: List of field definitions suitable for form generation
        """
        meta = frappe.get_meta("User contact")

        fields = []
        for field in meta.fields:
            # Only include data entry fields
            if (
                field.fieldtype
                in [
                    "Data",
                    "Select",
                    "Int",
                    "Float",
                    "Currency",
                    "Date",
                    "Datetime",
                    "Time",
                    "Check",
                    "Text",
                    "Small Text",
                    "Long Text",
                    "Link",
                    "Dynamic Link",
                    "Phone",
                    "Email",
                ]
                and not field.hidden
                and not field.read_only
            ):
                fields.append(
                    {
                        "fieldname": field.fieldname,
                        "fieldtype": field.fieldtype,
                        "label": field.label,
                        "reqd": field.reqd,
                        "options": field.options,
                        "default": field.default,
                        "description": field.description,
                        "read_only": field.read_only,
                        "hidden": field.hidden,
                        "length": field.length,
                        "precision": field.precision,
                    }
                )

        return fields
