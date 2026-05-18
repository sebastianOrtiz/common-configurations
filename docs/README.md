# Documentación de Common Configurations

Aplicación de Frappe Framework que provee infraestructura compartida para el ecosistema de apps: Service Portal (frontend Angular), gestión de User Contacts con autenticación por token, API Service con autenticación por API Key, proveedores de IA, OTP por SMS y más.

> **Autor:** Sebastian Ortiz Valencia — **Licencia:** MIT — **Framework:** Frappe + Angular

---

## Índice general

### Documentos transversales

| Documento | Descripción |
|-----------|-------------|
| [HOW_TO_CREATE_A_PORTAL_TOOL.md](HOW_TO_CREATE_A_PORTAL_TOOL.md) | Guía paso a paso para registrar una nueva herramienta del Service Portal desde otra app. |
| [SERVICE_PORTAL.md](SERVICE_PORTAL.md) | Especificación funcional del Service Portal. |
| [arquitectura-acceso-externo-frappe.md](arquitectura-acceso-externo-frappe.md) | Decisiones de arquitectura sobre el acceso externo a Frappe. |
| [INSTALL.md](INSTALL.md) | Proceso de instalación de la app. |
| [hooks.md](hooks.md) | Documentación de `hooks.py` (fixtures, eventos, scheduler). |

---

### DocTypes

Documentación exhaustiva de los DocTypes definidos por la app. Cada archivo describe todos los campos uno por uno (tipo, label, valor por defecto, validaciones, permisos por rol y eventos).

| DocType | Tipo | Documento |
|---------|------|-----------|
| `User contact` | Standard | [doctypes/USER_CONTACT.md](doctypes/USER_CONTACT.md) |
| `Service Portal Tool` | Child | [doctypes/SERVICE_PORTAL_TOOL.md](doctypes/SERVICE_PORTAL_TOOL.md) |
| `Tool Type` | Standard | [doctypes/TOOL_TYPE.md](doctypes/TOOL_TYPE.md) |
| `API Service` + `API Service Key` | Standard + Child | [doctypes/API_SERVICE.md](doctypes/API_SERVICE.md) |
| `AI Provider` + `AI Model` + `AI Configuration` | Standard + Child + Standard | [doctypes/AI_CONFIGURATION.md](doctypes/AI_CONFIGURATION.md) |
| `OTP Settings` + `SMS Provider` | Single + Standard | [doctypes/OTP_SETTINGS.md](doctypes/OTP_SETTINGS.md) |
| `Portal Quick Links` + `Portal Quick Link Item` | Standard + Child | [doctypes/PORTAL_QUICK_LINKS.md](doctypes/PORTAL_QUICK_LINKS.md) |

> El DocType `Service Portal` se documenta en [SERVICE_PORTAL.md](SERVICE_PORTAL.md).

---

### APIs (módulo `common_configurations.api`)

Cada archivo describe los endpoints disponibles, parámetros, rate limits, autenticación y ejemplos `curl`.

| Dominio | Documento | Endpoints principales |
|---------|-----------|------------------------|
| Contacts | [api/CONTACTS.md](api/CONTACTS.md) | `get_user_contact_by_document`, `create_user_contact`, `update_user_contact`, `get_user_contact_fields` |
| Auth | [api/AUTH.md](api/AUTH.md) | `get_csrf_token`, `get_authenticated_user_contact`, `logout_user_contact` |
| Portals | [api/PORTALS.md](api/PORTALS.md) | `get_portals`, `get_portal` |
| OTP | [api/OTP.md](api/OTP.md) | `request_otp`, `verify_otp`, `request_registration_otp`, `verify_registration_otp`, etc. |
| AI | [api/AI.md](api/AI.md) | `get_ai_client` (Python helper para OpenAI / Anthropic / Google) |
| External (API Key) | [api/EXTERNAL.md](api/EXTERNAL.md) | `lookup_contact`, `register_contact` |
| Shared utilities | [api/SHARED.md](api/SHARED.md) | `security.py`, `rate_limit.py`, `validators.py`, `api_key.py`, `email.py`, `exceptions.py` |

---

### Features

Documentación de los sistemas transversales que combinan varios módulos.

| Feature | Documento |
|---------|-----------|
| Autenticación de User Contact por token | [features/USER_CONTACT_AUTH.md](features/USER_CONTACT_AUTH.md) |
| Sistema de API Key para integraciones externas | [features/API_KEY_SYSTEM.md](features/API_KEY_SYSTEM.md) |
| Frontend Angular del Service Portal | [features/SERVICE_PORTAL_FRONTEND.md](features/SERVICE_PORTAL_FRONTEND.md) |

---

### Hooks / Install

| Documento | Descripción |
|-----------|-------------|
| [hooks.md](hooks.md) | Detalle de `hooks.py`: fixtures, doc_events, website_route_rules, scheduler. |
| [INSTALL.md](INSTALL.md) | Pasos de instalación, dependencias y configuración inicial. |

---

## Filosofía de diseño

La API y los DocTypes siguen estos principios:

1. **SOLID** — Cada módulo tiene una sola responsabilidad. Agregar un dominio nuevo = nueva carpeta, no modificar las existentes.
2. **KISS** — Solo 3–4 archivos por dominio: `endpoints.py`, `service.py`, `validators.py`, `__init__.py`.
3. **Extensibilidad por fixtures** — Otras apps (logbook, meet_scheduling, lex_app) extienden `Service Portal Tool`, `Tool Type` y `API Service` agregando custom fields y registrando tipos vía fixtures.
4. **Seguridad por defecto** — Rate limit, honeypot, sanitización Unicode NFC, hashing SHA-256, `permlevel: 1` en campos sensibles.

---

## Contacto

- Desarrollador: Sebastian Ortiz Valencia
- Email: sebastianortiz989@gmail.com
- Licencia: MIT
