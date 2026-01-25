# Integración con Frappe Framework

## Visión General

El Service Portal se integra completamente con Frappe Framework a través de su REST API y sistema de autenticación basado en cookies.

---

## Autenticación

### Sistema de Sesiones

Frappe usa **cookies HTTP-only** para mantener sesiones de usuario:

- Cookie `sid`: Session ID
- Cookie `user_id`: ID del usuario
- Cookie `full_name`: Nombre completo

**Ventajas**:
- Más seguro que tokens JWT en LocalStorage
- HTTP-only previene acceso desde JavaScript malicioso
- Gestión automática por el navegador

### Flow de Autenticación

```
1. Usuario envía credentials → POST /api/method/login
2. Frappe valida y crea sesión
3. Frappe envía cookies en response headers
4. Navegador guarda cookies automáticamente
5. Requests subsecuentes incluyen cookies
6. Frappe valida sesión en cada request
```

### Login

**Endpoint**: `POST /api/method/login`

**Request**:
```json
{
  "usr": "user@example.com",
  "pwd": "password123"
}
```

**Response**:
```json
{
  "message": "Logged In",
  "full_name": "John Doe",
  "email": "user@example.com"
}
```

**Headers** (automáticos):
```
Set-Cookie: sid=abc123...; HttpOnly; Secure
Set-Cookie: user_id=user@example.com
Set-Cookie: full_name=John Doe
```

**Implementación Angular**:

```typescript
login(email: string, password: string): Observable<LoginResponse> {
  return this.http.post<LoginResponse>(
    '/api/method/login',
    {
      usr: email,
      pwd: password
    },
    { withCredentials: true }  // ← Importante
  );
}
```

### Logout

**Endpoint**: `POST /api/method/logout`

**Response**:
```json
{
  "message": "Logged Out"
}
```

Headers automáticos limpian las cookies.

### Verificar Sesión

**Endpoint**: `GET /api/method/frappe.auth.get_logged_user`

**Response**:
```json
{
  "message": {
    "name": "user@example.com",
    "email": "user@example.com",
    "full_name": "John Doe",
    "user_image": "/files/avatar.jpg",
    "roles": ["System User", "Customer"]
  }
}
```

Usado para:
- Verificar si hay sesión activa
- Obtener información completa del usuario
- Recuperar sesión después de refresh

---

## REST API

### Estructura de URLs

Frappe expone recursos a través de:

1. **REST Resources**: `/api/resource/{doctype}/{name}`
2. **Methods**: `/api/method/{module}.{file}.{function}`

### REST Resources

#### GET - Listar Documentos

```
GET /api/resource/{DocType}?fields=["field1","field2"]&filters=[["field","=","value"]]&limit_page_length=20
```

**Ejemplo**:
```typescript
getPortals(): Observable<ServicePortal[]> {
  return this.http.get<ServicePortal[]>(
    '/api/resource/Service Portal?fields=["name","portal_name","description"]&filters=[["is_enabled","=","1"]]'
  );
}
```

**Response**:
```json
{
  "data": [
    {
      "name": "portal-1",
      "portal_name": "Portal 1",
      "description": "..."
    }
  ]
}
```

#### GET - Obtener Documento

```
GET /api/resource/{DocType}/{name}
```

**Ejemplo**:
```typescript
getPortal(name: string): Observable<ServicePortal> {
  return this.http.get<ServicePortal>(
    `/api/resource/Service Portal/${name}`
  );
}
```

**Response**:
```json
{
  "data": {
    "name": "portal-1",
    "portal_name": "Portal 1",
    "description": "...",
    "tools": [
      {
        "tool_type": "meet_scheduling",
        "label": "Agendar Cita",
        ...
      }
    ]
  }
}
```

#### POST - Crear Documento

```
POST /api/resource/{DocType}
```

**Ejemplo**:
```typescript
createContact(contact: CreateContactRequest): Observable<Contact> {
  return this.http.post<Contact>(
    '/api/resource/Contact',
    {
      doctype: 'Contact',
      first_name: contact.firstName,
      last_name: contact.lastName,
      email_ids: [
        {
          email_id: contact.email,
          is_primary: 1
        }
      ]
    }
  );
}
```

#### PUT - Actualizar Documento

```
PUT /api/resource/{DocType}/{name}
```

**Ejemplo**:
```typescript
updateAppointment(name: string, data: Partial<Appointment>): Observable<Appointment> {
  return this.http.put<Appointment>(
    `/api/resource/Appointment/${name}`,
    data
  );
}
```

#### DELETE - Eliminar Documento

```
DELETE /api/resource/{DocType}/{name}
```

**Ejemplo**:
```typescript
deleteAppointment(name: string): Observable<void> {
  return this.http.delete<void>(
    `/api/resource/Appointment/${name}`
  );
}
```

### Custom Methods

Para lógica más compleja, crea métodos whitelisted en Python.

#### Definir Método en Frappe

```python
# common_configurations/api/appointment.py
import frappe

@frappe.whitelist()
def create_and_confirm_appointment(
    calendar_resource,
    contact,
    start_time,
    end_time
):
    """Crea y confirma una cita en un solo paso"""

    # Validar disponibilidad
    if not is_slot_available(calendar_resource, start_time, end_time):
        frappe.throw("Slot no disponible")

    # Crear cita
    appointment = frappe.get_doc({
        "doctype": "Appointment",
        "calendar_resource": calendar_resource,
        "contact": contact,
        "start_datetime": start_time,
        "end_datetime": end_time,
        "status": "Draft"
    })
    appointment.insert()

    # Confirmar automáticamente
    appointment.status = "Confirmed"
    appointment.save()

    # Generar meeting URL si configurado
    if appointment.generate_meeting_url:
        appointment.create_meeting()

    return appointment.as_dict()
```

#### Registrar en hooks.py

```python
# hooks.py
doc_events = {
    # ...
}
```

No es necesario registrar en hooks si el método está en un archivo Python del módulo.

#### Llamar desde Angular

```typescript
createAndConfirmAppointment(
  resource: string,
  contact: string,
  startTime: string,
  endTime: string
): Observable<Appointment> {
  return this.http.post<Appointment>(
    '/api/method/common_configurations.api.appointment.create_and_confirm_appointment',
    {
      calendar_resource: resource,
      contact: contact,
      start_time: startTime,
      end_time: endTime
    }
  );
}
```

---

## Filters y Queries

### Sintaxis de Filtros

```
filters=[["field","operator","value"]]
```

**Operadores disponibles**:
- `=`: Igual
- `!=`: Diferente
- `>`: Mayor que
- `<`: Menor que
- `>=`: Mayor o igual
- `<=`: Menor o igual
- `like`: Contiene texto
- `in`: En lista
- `not in`: No en lista
- `is`: Es (para null)

**Ejemplos**:

```typescript
// Simple
filters=[["status","=","Open"]]

// Múltiples condiciones (AND)
filters=[["status","=","Open"],["priority","=","High"]]

// OR conditions (usar OR en array)
filters=[["status","in",["Open","In Progress"]]]

// Like (búsqueda de texto)
filters=[["subject","like","%soporte%"]]

// Null check
filters=[["assigned_to","is","not set"]]
```

### Ordenamiento

```
order_by=field asc|desc
```

**Ejemplo**:
```
/api/resource/Appointment?order_by=start_datetime desc
```

### Paginación

```
limit_page_length=20
limit_start=0
```

**Ejemplo**:
```typescript
getAppointments(page: number = 1, pageSize: number = 20): Observable<Appointment[]> {
  const start = (page - 1) * pageSize;
  return this.http.get<Appointment[]>(
    `/api/resource/Appointment?limit_page_length=${pageSize}&limit_start=${start}`
  );
}
```

### Campos Específicos

```
fields=["field1","field2","field3"]
```

**Ejemplo**:
```
/api/resource/Contact?fields=["name","email_id","first_name","last_name"]
```

---

## DocTypes Utilizados

### Service Portal

```json
{
  "doctype": "Service Portal",
  "fields": {
    "name": "Unique ID",
    "portal_name": "Display name",
    "description": "Text",
    "color": "Color hex",
    "logo": "Attach Image",
    "is_enabled": "Check",
    "contacts": "Table - Link to Contact",
    "tools": "Table - Service Portal Tool"
  }
}
```

### Service Portal Tool (Child Table)

```json
{
  "doctype": "Service Portal Tool",
  "fields": {
    "tool_type": "Link to Tool Type",
    "label": "Data",
    "tool_description": "Small Text",
    "icon": "Select (lucide icons)",
    "button_color": "Color",
    "display_order": "Int",
    "is_enabled": "Check",
    "calendar_resource": "Link to Calendar Resource",
    "show_calendar_view": "Check"
  }
}
```

### Tool Type

```json
{
  "doctype": "Tool Type",
  "fields": {
    "tool_type_id": "Data (unique)",
    "tool_label": "Data",
    "description": "Text",
    "icon": "Select"
  }
}
```

### Contact

DocType estándar de Frappe con campos adicionales:

```json
{
  "doctype": "Contact",
  "fields": {
    "email_id": "Data",
    "first_name": "Data",
    "last_name": "Data",
    "phone": "Data",
    "portals": "Calculated from Service Portal"
  }
}
```

### Appointment

```json
{
  "doctype": "Appointment",
  "fields": {
    "calendar_resource": "Link",
    "contact": "Link to Contact",
    "start_datetime": "Datetime",
    "end_datetime": "Datetime",
    "status": "Select",
    "meeting_url": "Data"
  }
}
```

---

## Interceptores HTTP

### AuthInterceptor

Configura todas las requests para enviar credentials:

```typescript
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authReq = req.clone({
    withCredentials: true  // ← Envía cookies
  });
  return next(authReq);
};
```

**Aplicado globalmente en app.config.ts**.

### ErrorInterceptor

Maneja errores HTTP centralizadamente:

```typescript
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        // Sesión expirada
        inject(Router).navigate(['/login']);
      } else if (error.status === 403) {
        // Sin permisos
        console.error('Forbidden:', error);
      }
      return throwError(() => error);
    })
  );
};
```

---

## Manejo de Errores

### Errores Comunes de API

**401 Unauthorized**:
- Sesión expirada o no autenticado
- Redireccionar a login

**403 Forbidden**:
- Usuario no tiene permisos
- Mostrar mensaje de error

**404 Not Found**:
- Recurso no existe
- Verificar ID/nombre del documento

**500 Internal Server Error**:
- Error en el servidor
- Revisar logs de Frappe

**ValidationError**:
- Datos inválidos
- Mostrar mensaje de validación al usuario

### Estructura de Error de Frappe

```json
{
  "_server_messages": "[{\"message\": \"Error message\"}]",
  "exc_type": "ValidationError",
  "exception": "...",
  "exc": "..."
}
```

**Parse en Angular**:

```typescript
private handleFrappeError(error: HttpErrorResponse): string {
  if (error.error?._server_messages) {
    try {
      const messages = JSON.parse(error.error._server_messages);
      const firstMessage = JSON.parse(messages[0]);
      return firstMessage.message || 'Error desconocido';
    } catch {
      return 'Error al procesar respuesta del servidor';
    }
  }
  return error.message || 'Error desconocido';
}
```

---

## Permisos y Seguridad

### Permisos de DocType

Frappe valida permisos automáticamente en API:

- **Read**: Permiso para GET
- **Write**: Permiso para PUT
- **Create**: Permiso para POST
- **Delete**: Permiso para DELETE

**Configurar en DocType**:
```python
# En Service Portal DocType
permissions = [
    {
        "role": "System User",
        "read": 1,
        "write": 1,
        "create": 1,
        "delete": 1
    },
    {
        "role": "Guest",
        "read": 0,
        "write": 0,
        "create": 0,
        "delete": 0
    }
]
```

### Row-Level Permissions

Limitar acceso basado en datos del documento:

```python
# En Contact DocType, solo ver propios contactos
def has_permission(doc, ptype, user):
    if doc.email == user:
        return True
    return False
```

### Validaciones Personalizadas

```python
# En Appointment DocType
def validate(self):
    # No permitir agendar en el pasado
    if self.start_datetime < now():
        frappe.throw("No se puede agendar en el pasado")

    # No permitir overlapping
    existing = frappe.db.exists(
        "Appointment",
        {
            "calendar_resource": self.calendar_resource,
            "start_datetime": ["between", [self.start_datetime, self.end_datetime]]
        }
    )
    if existing:
        frappe.throw("Ya existe una cita en este horario")
```

---

## Testing de API

### Usar Postman/Insomnia

**Login primero**:
```
POST http://localhost:8000/api/method/login
Body: { "usr": "user@example.com", "pwd": "password" }
```

Guarda las cookies de la respuesta.

**Hacer requests**:
```
GET http://localhost:8000/api/resource/Service Portal
Headers:
  Cookie: sid=abc123...
```

### Usar curl

```bash
# Login y guardar cookies
curl -c cookies.txt \
  -X POST http://localhost:8000/api/method/login \
  -H "Content-Type: application/json" \
  -d '{"usr":"user@example.com","pwd":"password"}'

# Hacer request con cookies
curl -b cookies.txt \
  http://localhost:8000/api/resource/Service Portal
```

### DevTools del Navegador

1. Abrir DevTools (F12)
2. Tab "Network"
3. Hacer acción en la app
4. Ver requests/responses
5. Inspeccionar cookies en "Application" tab

---

## Mejores Prácticas

### 1. Siempre Usar withCredentials

```typescript
// ✅ CORRECTO
this.http.get(url, { withCredentials: true })

// ❌ INCORRECTO
this.http.get(url)  // No enviará cookies
```

### 2. Manejar Errores

```typescript
// ✅ CORRECTO
this.service.getData().subscribe({
  next: (data) => { /* ... */ },
  error: (err) => {
    console.error(err);
    this.error.set(this.handleFrappeError(err));
  }
});
```

### 3. Type-Safe Responses

```typescript
// ✅ CORRECTO
interface ApiResponse {
  data: MyData;
}

this.http.get<ApiResponse>(url).pipe(
  map(response => response.data)
);
```

### 4. Usar Filtros Correctamente

```typescript
// ✅ CORRECTO: Escapar valores
const filters = JSON.stringify([
  ["email", "=", email.replace(/"/g, '\\"')]
]);

// ❌ INCORRECTO: Inyección de código posible
const filters = `[["email","=","${email}"]]`;
```

### 5. Pagination para Listas Grandes

```typescript
// ✅ CORRECTO: Paginar
getAppointments(page: number): Observable<Appointment[]> {
  return this.http.get<Appointment[]>(
    `/api/resource/Appointment?limit_page_length=20&limit_start=${(page-1)*20}`
  );
}

// ❌ INCORRECTO: Traer todo
getAppointments(): Observable<Appointment[]> {
  return this.http.get<Appointment[]>('/api/resource/Appointment');
}
```

---

## Troubleshooting

### Cookies no se guardan

**Problema**: Requests no incluyen cookies

**Solución**:
1. Verificar `withCredentials: true`
2. Verificar que AuthInterceptor está configurado
3. Verificar CORS si frontend y backend en diferentes hosts

### 401 en requests autenticados

**Problema**: Usuario está logueado pero recibe 401

**Solución**:
1. Verificar que cookies se están enviando (DevTools)
2. Verificar que sesión no expiró
3. Re-login si es necesario

### CORS Errors

**Problema**: Error de CORS en navegador

**Solución** (solo desarrollo):
```python
# En site_config.json
"allow_cors": "*",
"cors_headers": [
    "Content-Type",
    "Authorization"
]
```

**Producción**: Servir desde mismo origen que Frappe

### Permisos Denegados

**Problema**: 403 Forbidden en API calls

**Solución**:
1. Verificar permisos del DocType
2. Verificar roles del usuario
3. Verificar row-level permissions si aplican
