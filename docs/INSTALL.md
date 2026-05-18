# Instalación de Common Configurations

Guía paso a paso para instalar la app `common_configurations` en un bench de Frappe Framework.

---

## Requisitos previos

- **Frappe Framework**: versión 15.x (gestionado por bench)
- **Python**: >= 3.10
- **Node.js**: >= 18 (para construir el frontend Angular)
- **npm**: 10.x (especificado en `front_apps/service-portal/package.json` → `packageManager: "npm@10.8.2"`)
- **Redis**: requerido por Frappe para cache y rate limit
- **Base de datos**: MariaDB 10.6+

---

## Dependencias Python

Definidas en `pyproject.toml`:

```toml
[project]
requires-python = ">=3.10"
dependencies = [
    "infobip-api-python-client~=6.0.0",  # SDK Infobip para SMS OTP
    "openai>=1.0.0",                      # SDK OpenAI
    "anthropic>=0.30.0",                  # SDK Anthropic (Claude)
    "google-generativeai>=0.5.0",         # SDK Google Gemini
]
```

> Estas dependencias se instalan automáticamente cuando se ejecuta `bench install-app common_configurations`. No es necesario hacer `pip install` manual.

---

## Paso 1: Obtener la app

Si la app aún no está en tu bench:

```bash
cd $PATH_TO_YOUR_BENCH

# Si la fuente es un git remoto
bench get-app common_configurations https://<repo-url>.git --branch main

# O si ya tienes el código local en apps/
bench get-app /path/to/common_configurations
```

Esto coloca el código en `apps/common_configurations/` y agrega la entrada en `sites/apps.txt`.

---

## Paso 2: Instalar dependencias Python

`bench get-app` ejecuta `pip install -e ./apps/common_configurations` automáticamente. Si necesitas reinstalar dependencias:

```bash
cd apps/common_configurations
pip install -e .
```

---

## Paso 3: Instalar la app en el site

```bash
bench --site <site-name> install-app common_configurations
```

Esto:

1. Crea las tablas de los DocTypes (User contact, Service Portal, Tool Type, etc.).
2. Aplica las **fixtures** declaradas en `hooks.py`:
   - Roles: `Common Config Manager`, `Portal API User`
   - Tool Types: `portal_redirect`, `portal_quick_links`
   - AI Providers: `OpenAI`, `Anthropic`, `Google` (con sus modelos)
3. Registra las rutas web (`website_route_rules`).

> Si después agregas nuevas fixtures o modificas existentes, ejecuta:
>
> ```bash
> bench --site <site-name> migrate
> ```

---

## Paso 4: Compilar el frontend Angular

Si vas a usar el Service Portal, compila el SPA:

```bash
cd apps/common_configurations/front_apps/service-portal
npm install
npm run build
```

O usando el comando bench dedicado:

```bash
bench build-service-portal           # producción
bench build-service-portal --watch   # modo desarrollo (hot reload)
```

El output va a `common_configurations/public/service-portal/` y el `index.html` se copia automáticamente a `common_configurations/www/service-portal.html` para que Frappe lo sirva.

---

## Paso 5: Configurar `nginx` (producción)

En producción, regenera la configuración de nginx para que Frappe sirva los assets del SPA:

```bash
bench setup nginx
sudo service nginx reload
```

---

## Paso 6: Verificar la instalación

### Verifica los DocTypes

En el desk Frappe (`/app`):

- `/app/user-contact`
- `/app/service-portal`
- `/app/tool-type`
- `/app/api-service`
- `/app/ai-configuration`
- `/app/otp-settings` (Single DocType)
- `/app/sms-provider`
- `/app/portal-quick-links`

### Verifica los roles

- `/app/role/Common%20Config%20Manager`
- `/app/role/Portal%20API%20User`

### Verifica los Tool Types instalados

```bash
bench --site <site-name> console
>>> import frappe
>>> frappe.get_all("Tool Type", filters={"app_name": "common_configurations"})
[{'name': 'portal_redirect'}, {'name': 'portal_quick_links'}]
```

### Verifica los AI Providers

```bash
>>> frappe.get_all("AI Provider", fields=["name", "provider_name"])
[
  {'name': 'OpenAI', 'provider_name': 'OpenAI'},
  {'name': 'Anthropic', 'provider_name': 'Anthropic'},
  {'name': 'Google', 'provider_name': 'Google'}
]
```

### Verifica el frontend

Visita: `https://<tu-site>/service-portal/`

Debe cargar la SPA Angular.

---

## Paso 7: Configuración inicial recomendada

### A. OTP Settings (opcional pero recomendado para MFA)

1. Crear un **SMS Provider** (`/app/sms-provider/new`):
   - `provider_name`: "Infobip Producción"
   - `provider_type`: Infobip
   - `api_url`: `https://XXXXX.api.infobip.com`
   - `api_key`: tu key
   - `sender_id`: "InfoSMS" (o un número)
2. Activar **OTP Settings** (`/app/otp-settings`):
   - `enable_otp_verification`: 1
   - `sms_provider_link`: el SMS Provider creado
   - Ajustar `otp_length`, `otp_expiry_minutes`, etc.

### B. AI Configurations

Por cada modelo de IA que quieras usar, crear una `AI Configuration`:

1. `/app/ai-configuration/new`
2. `config_name`: "OpenAI Producción"
3. `provider`: OpenAI
4. `model`: gpt-4.1
5. `api_key`: tu API key de OpenAI
6. `is_active`: 1

### C. Service Portals

1. Crear un **Service Portal** (`/app/service-portal/new`):
   - `portal_name`: "consultas-municipio" (kebab/snake_case, URL-safe)
   - `title`: "Portal de Consultas"
   - `is_active`: 1
2. Agregar tools en `tools[]` con `tool_type` apuntando a los Tool Types disponibles.

### D. API Services (para integraciones externas)

1. `/app/api-service/new`
2. `title`: "WhatsApp Chatbot"
3. Habilitar los Check fields `enable_lookup_contact`, `enable_register_contact`, etc.
4. Agregar filas en `api_keys` (al guardar se generarán automáticamente las keys).
5. Copiar las keys y entregarlas al integrador externo.

---

## Apps complementarias (opcionales)

El ecosistema fue diseñado para combinarse con estas apps. Cada una agrega sus propios `Tool Type` y custom fields:

| App | Provee | Tool Types | Custom fields en `API Service` |
|-----|--------|------------|-------------------------------|
| `meet_scheduling` | Agendamiento de citas, integración Google Meet/Teams | `meet_scheduling`, `my_appointments` | — |
| `logbook` | Bitácoras y trámites | `my_logbook`, `create_logbook`, `procedures` | `enable_create_logbook_entry`, `api_logbook_availability` |
| `lex_app` | Gestión de casos legales | `my_cases` | `enable_create_case_log`, `lawyer_availability`, `default_case_type`, `default_legal_area` |

Instalación (en este orden):

```bash
bench install-app common_configurations   # primero
bench install-app meet_scheduling
bench install-app logbook
bench install-app lex_app
```

> El orden es importante porque las apps siguientes pueden definir Custom Fields sobre DocTypes de `common_configurations`.

---

## Desinstalación

```bash
bench --site <site-name> uninstall-app common_configurations
bench remove-app common_configurations
```

> Atención: esto eliminará todos los datos asociados (User Contacts, Service Portals, etc.) si no haces backup previamente.

---

## Troubleshooting

### "Tool Type 'X' is not active or doesn't exist" al editar un Service Portal Tool

Verifica que las fixtures se hayan sincronizado:

```bash
bench --site <site-name> migrate
```

### El frontend muestra 404 en rutas internas (ej. `/service-portal/portal/xyz`)

Asegúrate de que `website_route_rules` esté aplicado:

1. Revisa `hooks.py:29-31`.
2. Reinicia el bench: `bench restart`.

### "No outgoing Email Account configured" al usar `send_email`

Configura al menos un Email Account con `enable_outgoing = 1` en `/app/email-account`. `send_email()` simplemente loggea un warning y devuelve False si no hay configuración (no rompe el flujo).

### Las API Keys generadas no funcionan

Verifica:

1. `API Service.is_active = 1`
2. `API Service Key.is_active = 1`
3. El endpoint específico está habilitado (ej. `enable_lookup_contact = 1`)
4. No se está enviando un rate limit excedido (`api_service:<service_name>` en Redis)

---

## Referencias cruzadas

- [hooks.md](hooks.md) — Detalle de fixtures y hooks.
- [README.md](README.md) — Índice general de la documentación.
- `pyproject.toml` — Dependencias.
- [features/SERVICE_PORTAL_FRONTEND.md](features/SERVICE_PORTAL_FRONTEND.md) — Build del frontend.
