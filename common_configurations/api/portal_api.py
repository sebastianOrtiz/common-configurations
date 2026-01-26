"""
Portal API

Public API endpoints for Service Portal operations.
These endpoints are accessible by guest users with security protections.
"""

import json
import frappe
from frappe import _

from common_configurations.api.security import (
    check_rate_limit,
    check_honeypot,
    validate_document_number,
    validate_user_contact_data,
    sanitize_string,
    get_client_ip
)


# ===================
# Portal Configuration
# ===================

@frappe.whitelist(allow_guest=True, methods=['GET'])
def get_portals():
    """
    Get list of active Service Portals.

    Rate limited: 30 requests per minute per IP.

    Returns:
        list: List of active portals with basic info
    """
    check_rate_limit("get_portals", limit=30, seconds=60)

    try:
        portals = frappe.get_all(
            'Service Portal',
            filters={'is_active': 1},
            fields=['name', 'portal_name', 'title', 'description', 'logo', 'primary_color']
        )
        return portals

    except Exception as e:
        frappe.log_error(f"Error getting portals: {str(e)}")
        frappe.throw(_("Error loading portals"))


@frappe.whitelist(allow_guest=True, methods=['GET'])
def get_portal(portal_name: str):
    """
    Get a specific Service Portal with its tools.

    Rate limited: 30 requests per minute per IP.

    Args:
        portal_name: The portal_name identifier

    Returns:
        dict: Portal configuration with tools
    """
    check_rate_limit("get_portal", limit=30, seconds=60)

    if not portal_name:
        frappe.throw(_("Portal name is required"))

    portal_name = sanitize_string(portal_name, 140)

    try:
        # Check if portal exists and is active
        if not frappe.db.exists('Service Portal', {'portal_name': portal_name, 'is_active': 1}):
            frappe.throw(_("Portal not found"), frappe.DoesNotExistError)

        # Get portal document
        portal = frappe.get_doc('Service Portal', portal_name)

        # Build response
        result = {
            'name': portal.name,
            'portal_name': portal.portal_name,
            'title': portal.title,
            'description': portal.description,
            'is_active': portal.is_active,
            'registration_title': portal.registration_title,
            'registration_description': portal.registration_description,
            'primary_color': portal.primary_color,
            'secondary_color': portal.secondary_color,
            'logo': portal.logo,
            'background_image': portal.background_image,
            'custom_css': portal.custom_css,
            'tools': []
        }

        # Add tools
        for tool in portal.tools:
            result['tools'].append({
                'name': tool.name,
                'tool_type': tool.tool_type,
                'label': tool.label,
                'tool_description': tool.tool_description,
                'icon': tool.icon,
                'button_color': tool.button_color,
                'display_order': tool.display_order,
                'is_enabled': tool.is_enabled,
                'calendar_resource': tool.calendar_resource if hasattr(tool, 'calendar_resource') else None,
                'show_calendar_view': tool.show_calendar_view if hasattr(tool, 'show_calendar_view') else None,
                'slot_duration_minutes': tool.slot_duration_minutes if hasattr(tool, 'slot_duration_minutes') else None
            })

        return result

    except frappe.DoesNotExistError:
        raise
    except Exception as e:
        frappe.log_error(f"Error getting portal {portal_name}: {str(e)}")
        frappe.throw(_("Error loading portal"))


# ===================
# User Contact
# ===================

@frappe.whitelist(allow_guest=True, methods=['GET', 'POST'])
def get_user_contact_by_document(document: str, honeypot: str = None):
    """
    Get User Contact by document number.

    Rate limited: 10 requests per minute per IP.
    Protected by honeypot field.

    Args:
        document: Document number to search
        honeypot: Honeypot field (should be empty)

    Returns:
        dict: User Contact data or None
    """
    # Security checks
    check_honeypot(honeypot)
    check_rate_limit("get_contact", limit=10, seconds=60)

    # Validate input
    document = validate_document_number(document)

    try:
        contacts = frappe.get_all(
            'User contact',
            filters={'document': document},
            fields=['name', 'full_name', 'document_type', 'document', 'phone_number', 'email', 'gender'],
            limit=1
        )

        if contacts and len(contacts) > 0:
            return contacts[0]

        return None

    except frappe.ValidationError:
        raise
    except Exception as e:
        frappe.log_error(f"Error getting user contact by document: {str(e)}")
        frappe.throw(_("Error searching for contact"))


@frappe.whitelist(allow_guest=True, methods=['POST'])
def create_user_contact(data, honeypot: str = None):
    """
    Create a new User Contact.

    Rate limited: 5 requests per minute per IP (stricter for writes).
    Protected by honeypot field.
    All data is validated and sanitized.

    Args:
        data: User Contact data (dict or JSON string)
        honeypot: Honeypot field (should be empty)

    Returns:
        dict: Created User Contact document
    """
    # Security checks
    check_honeypot(honeypot)
    check_rate_limit("create_contact", limit=5, seconds=60)

    try:
        # Parse data if it's a string (from JSON)
        if isinstance(data, str):
            data = json.loads(data)

        # Validate and sanitize all data
        validated_data = validate_user_contact_data(data)

        # Check if contact with same document already exists
        existing = frappe.db.exists('User contact', {'document': validated_data.get('document')})
        if existing:
            # Return existing contact instead of creating duplicate
            return frappe.get_doc('User contact', existing).as_dict()

        # Create new document with ignore_permissions for guest users
        doc = frappe.get_doc({
            'doctype': 'User contact',
            **validated_data
        })

        doc.insert(ignore_permissions=True)
        frappe.db.commit()

        # Log creation for audit
        frappe.logger().info(
            f"User contact created: {doc.name} from IP: {get_client_ip()}"
        )

        return doc.as_dict()

    except frappe.ValidationError:
        raise
    except json.JSONDecodeError:
        frappe.throw(_("Invalid data format"), frappe.ValidationError)
    except Exception as e:
        frappe.log_error(f"Error creating user contact: {str(e)}")
        frappe.throw(_("Error creating contact"))


@frappe.whitelist(allow_guest=True, methods=['POST'])
def update_user_contact(name: str, data, honeypot: str = None):
    """
    Update an existing User Contact.

    Rate limited: 5 requests per minute per IP.
    Protected by honeypot field.

    Args:
        name: Name/ID of the User Contact document
        data: Fields to update (dict or JSON string)
        honeypot: Honeypot field (should be empty)

    Returns:
        dict: Updated User Contact document
    """
    # Security checks
    check_honeypot(honeypot)
    check_rate_limit("update_contact", limit=5, seconds=60)

    if not name:
        frappe.throw(_("Contact ID is required"), frappe.ValidationError)

    name = sanitize_string(name, 140)

    try:
        # Parse data if it's a string
        if isinstance(data, str):
            data = json.loads(data)

        # Validate and sanitize data
        validated_data = validate_user_contact_data(data)

        # Check if document exists
        if not frappe.db.exists('User contact', name):
            frappe.throw(_("Contact not found"), frappe.DoesNotExistError)

        # Get and update document
        doc = frappe.get_doc('User contact', name)

        for key, value in validated_data.items():
            if hasattr(doc, key):
                setattr(doc, key, value)

        doc.save(ignore_permissions=True)
        frappe.db.commit()

        # Log update for audit
        frappe.logger().info(
            f"User contact updated: {doc.name} from IP: {get_client_ip()}"
        )

        return doc.as_dict()

    except frappe.ValidationError:
        raise
    except frappe.DoesNotExistError:
        raise
    except json.JSONDecodeError:
        frappe.throw(_("Invalid data format"), frappe.ValidationError)
    except Exception as e:
        frappe.log_error(f"Error updating user contact: {str(e)}")
        frappe.throw(_("Error updating contact"))


@frappe.whitelist(allow_guest=True, methods=['GET', 'POST'])
def get_user_contact_fields():
    """
    Get User Contact DocType fields metadata for dynamic form generation.

    Rate limited: 30 requests per minute per IP.

    Returns:
        list: List of field definitions
    """
    check_rate_limit("get_fields", limit=30, seconds=60)

    try:
        meta = frappe.get_meta('User contact')

        fields = []
        for field in meta.fields:
            # Only include data entry fields (exclude Section Break, Column Break, etc.)
            if field.fieldtype in [
                'Data', 'Select', 'Int', 'Float', 'Currency',
                'Date', 'Datetime', 'Time', 'Check', 'Text',
                'Small Text', 'Long Text', 'Link', 'Dynamic Link',
                'Phone', 'Email'
            ] and not field.hidden and not field.read_only:
                fields.append({
                    'fieldname': field.fieldname,
                    'fieldtype': field.fieldtype,
                    'label': field.label,
                    'reqd': field.reqd,
                    'options': field.options,
                    'default': field.default,
                    'description': field.description,
                    'read_only': field.read_only,
                    'hidden': field.hidden,
                    'length': field.length,
                    'precision': field.precision,
                })

        return fields

    except Exception as e:
        frappe.log_error(f"Error getting user contact fields: {str(e)}")
        frappe.throw(_("Error loading form fields"))
