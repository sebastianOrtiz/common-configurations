# API: Auth

Endpoints HTTP de autenticación para el frontend del Service Portal.

**Base path:** `common_configurations.api.auth.*`
**Archivo:** `common_configurations/api/auth/endpoints.py`

---

## Resumen

| Endpoint | Método | Auth | Rate limit |
|----------|--------|------|------------|
| `get_csrf_token` | GET | Guest | 30 req/min/IP |
| `get_authenticated_user_contact` | GET | Guest (lee token opcional) | 30 req/min/IP |
| `logout_user_contact` | POST | Guest (lee token) | 20 req/min/IP |

> Estos endpoints son **complementarios** a los de `contacts`: gestionan CSRF, devuelven el usuario actual y cierran sesión.

---

## 1. `get_csrf_token`

Devuelve el **CSRF token** de la sesión actual. Necesario para que un SPA (Angular) pueda hacer POSTs sin estar embebido en una página del desk.

### Firma

```python
@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_csrf_token():
    check_rate_limit("get_csrf", limit=30, seconds=60)
    return AuthService.get_csrf_token()
```

Internamente: `return frappe.local.session.data.csrf_token`.

### Sin parámetros.

### Respuesta

```json
{
  "message": "abc123def456..."
}
```

> Frappe envuelve la respuesta en `message` por defecto.

### Ejemplo curl

```bash
curl -X GET "https://tu-bench.com/api/method/common_configurations.api.auth.get_csrf_token" \
  -H "Accept: application/json" \
  --cookie-jar cookies.txt
```

> Es importante mantener las cookies entre requests (Frappe usa cookies de sesión). El SPA Angular ya maneja esto automáticamente.

### Uso típico

El frontend lo llama al iniciar la app y guarda el token. Después lo incluye en cada POST como:

```http
X-Frappe-CSRF-Token: abc123...
```

---

## 2. `get_authenticated_user_contact`

Devuelve los datos del **User Contact actualmente autenticado** (validando el header `X-User-Contact-Token` de la request).

### Firma

```python
@frappe.whitelist(allow_guest=True, methods=["GET"])
def get_authenticated_user_contact():
    check_rate_limit("get_auth_user", limit=30, seconds=60)
    user_contact_name = get_current_user_contact()
    return AuthService.get_authenticated_contact(user_contact_name)
```

### Sin parámetros explícitos.

Lee el token de:

1. Header `X-User-Contact-Token` (preferido)
2. Query param `?user_contact_token=...` (fallback)

### Respuestas

#### Token válido

```json
{
  "name": "USER-1",
  "full_name": "Juan Pérez",
  "document_type": "Cedula de ciudadania",
  "document": "12345678",
  "phone_number": "+573001234567",
  "email": "juan@example.com",
  "gender": "Masculino"
}
```

#### Token ausente, inválido o expirado

Devuelve `null` (no lanza error). Las expiraciones (> 30 días) son detectadas en `get_current_user_contact()` que **limpia automáticamente** el `auth_token_hash` del documento.

### Ejemplo curl

```bash
curl -X GET "https://tu-bench.com/api/method/common_configurations.api.auth.get_authenticated_user_contact" \
  -H "X-User-Contact-Token: 7c2b3a..." \
  -H "Accept: application/json"
```

### Uso típico

El frontend lo llama al cargar para reconocer al usuario si tiene token guardado en localStorage. Si devuelve `null`, redirige al flujo de login/registro.

---

## 3. `logout_user_contact`

Invalida el token actual limpiando `auth_token_hash` y `token_created_at` del User Contact.

### Firma

```python
@frappe.whitelist(allow_guest=True, methods=["POST"])
def logout_user_contact(honeypot: str = None):
    check_honeypot(honeypot)
    check_rate_limit("logout", limit=20, seconds=60)
    user_contact_name = get_current_user_contact()
    success = AuthService.logout(user_contact_name) if user_contact_name else True
    return {"success": success}
```

### Parámetros

| Param | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `honeypot` | string | No | Debe llegar vacío |

Identifica al usuario por el header `X-User-Contact-Token`.

### Respuesta

```json
{
  "success": true
}
```

Siempre devuelve `success: true` aunque no haya sesión activa (idempotente).

### Ejemplo curl

```bash
curl -X POST "https://tu-bench.com/api/method/common_configurations.api.auth.logout_user_contact" \
  -H "X-User-Contact-Token: 7c2b3a..." \
  -H "Content-Type: application/json" \
  -H "X-Frappe-CSRF-Token: $CSRF_TOKEN" \
  -d '{"honeypot": ""}'
```

### Efecto

Tras el logout:

- `auth_token_hash` y `token_created_at` quedan `NULL` en el `User contact`.
- Cualquier nuevo request con el token viejo devolverá `null` en `get_authenticated_user_contact()`.
- El usuario debe volver a hacer "login" por documento (o por OTP) para obtener un nuevo token.

---

## Capa de servicio (`api/auth/service.py`)

`AuthService` contiene 3 métodos:

```python
class AuthService:
    @classmethod
    def get_csrf_token(cls) -> str:
        return frappe.local.session.data.csrf_token

    @classmethod
    def get_authenticated_contact(cls, user_contact_name: str) -> Optional[Dict[str, Any]]:
        if not user_contact_name:
            return None
        contacts = frappe.get_all(
            "User contact",
            filters={"name": user_contact_name},
            fields=["name", "full_name", "document_type", "document",
                    "phone_number", "email", "gender"],
            limit=1,
        )
        return contacts[0] if contacts else None

    @classmethod
    def logout(cls, user_contact_name: str) -> bool:
        if not user_contact_name:
            return False
        frappe.db.set_value(
            "User contact",
            user_contact_name,
            {"auth_token_hash": None, "token_created_at": None},
            update_modified=False,
        )
        frappe.db.commit()
        return True
```

> Cabe destacar que el servicio **filtra explícitamente** los campos devueltos (no incluye `auth_token_hash`, `otp_*`, etc.). Esto es clave para no filtrar campos sensibles.

---

## Referencias cruzadas

- [CONTACTS.md](CONTACTS.md) — Generación de tokens al hacer login/registro.
- [../features/USER_CONTACT_AUTH.md](../features/USER_CONTACT_AUTH.md) — Flujo completo.
- [SHARED.md](SHARED.md) — `get_current_user_contact()` y otros helpers.
