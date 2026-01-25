# API Examples - Service Portal & Meet Scheduling

Ejemplos de llamadas API para testing y desarrollo.

## 🔑 Autenticación

### Login
```http
POST /api/method/login
Content-Type: application/json

{
  "usr": "usuario@test.com",
  "pwd": "usuario123"
}
```

**Response**:
```json
{
  "message": "Logged In",
  "home_page": "/app",
  "full_name": "Usuario Prueba"
}
```

### Get Current User
```http
GET /api/method/frappe.auth.get_logged_user
```

**Response**:
```json
{
  "message": "usuario@test.com"
}
```

### Logout
```http
POST /api/method/logout
```

---

## 📋 Service Portal APIs

### Get Active Portals
```http
GET /api/resource/Service Portal?fields=["*"]&filters=[["is_active","=",1]]
```

**Response**:
```json
{
  "data": [
    {
      "name": "portal-consultas",
      "portal_name": "portal-consultas",
      "title": "Portal de Consultas",
      "description": "Portal para agendar consultas",
      "is_active": 1,
      "primary_color": "#667eea",
      "tools": [...]
    }
  ]
}
```

### Get Specific Portal
```http
GET /api/resource/Service Portal/portal-consultas
```

**Response**:
```json
{
  "data": {
    "name": "portal-consultas",
    "title": "Portal de Consultas",
    "tools": [
      {
        "tool_type": "meet_scheduling",
        "label": "Agendar Cita",
        "calendar_resource": "Sala Consulta 1",
        "is_enabled": 1,
        "display_order": 1
      }
    ]
  }
}
```

### Get Tool Types
```http
GET /api/resource/Tool Type?fields=["*"]&filters=[["is_active","=",1]]
```

---

## 📅 Meet Scheduling APIs

### Get Available Slots
```http
POST /api/method/meet_scheduling.api.appointment_api.get_available_slots
Content-Type: application/json

{
  "calendar_resource": "Sala Consulta 1",
  "from_date": "2026-01-27",
  "to_date": "2026-01-27"
}
```

**Response**:
```json
{
  "message": [
    {
      "start": "2026-01-27 09:00:00",
      "end": "2026-01-27 09:30:00",
      "capacity_remaining": 1,
      "is_available": true
    },
    {
      "start": "2026-01-27 09:30:00",
      "end": "2026-01-27 10:00:00",
      "capacity_remaining": 1,
      "is_available": true
    }
  ]
}
```

### Validate Appointment
```http
POST /api/method/meet_scheduling.api.appointment_api.validate_appointment
Content-Type: application/json

{
  "calendar_resource": "Sala Consulta 1",
  "start_datetime": "2026-01-27 09:00:00",
  "end_datetime": "2026-01-27 09:30:00"
}
```

**Response**:
```json
{
  "message": {
    "valid": true,
    "errors": [],
    "warnings": [],
    "availability_ok": true,
    "capacity_ok": true
  }
}
```

### Create Appointment (Draft)
```http
POST /api/resource/Appointment
Content-Type: application/json

{
  "calendar_resource": "Sala Consulta 1",
  "user_contact": "UC-0001",
  "start_datetime": "2026-01-27 09:00:00",
  "end_datetime": "2026-01-27 09:30:00",
  "status": "Draft"
}
```

**Response**:
```json
{
  "data": {
    "name": "APP-2026-0001",
    "calendar_resource": "Sala Consulta 1",
    "start_datetime": "2026-01-27 09:00:00",
    "status": "Draft",
    "docstatus": 0
  }
}
```

### Submit Appointment (Confirm)
```http
PUT /api/resource/Appointment/APP-2026-0001
Content-Type: application/json

{
  "docstatus": 1
}
```

**Response**:
```json
{
  "data": {
    "name": "APP-2026-0001",
    "status": "Confirmed",
    "docstatus": 1,
    "meeting_url": "https://meet.google.com/xxx-yyyy-zzz"
  }
}
```

### Get User Appointments
```http
GET /api/resource/Appointment?fields=["*"]&filters=[["user_contact","=","UC-0001"]]
```

### Cancel Appointment
```http
PUT /api/resource/Appointment/APP-2026-0001
Content-Type: application/json

{
  "docstatus": 2
}
```

### Generate Meeting Manually
```http
POST /api/method/meet_scheduling.api.appointment_api.generate_meeting
Content-Type: application/json

{
  "appointment_name": "APP-2026-0001"
}
```

**Response**:
```json
{
  "message": {
    "success": true,
    "meeting_url": "https://meet.google.com/xxx-yyyy-zzz",
    "meeting_id": "xxx-yyyy-zzz"
  }
}
```

---

## 👤 User Contact APIs

### Create User Contact
```http
POST /api/resource/User Contact
Content-Type: application/json

{
  "email": "usuario@test.com",
  "first_name": "Usuario",
  "last_name": "Prueba",
  "phone": "+573001234567",
  "company": "Mi Empresa"
}
```

### Get User Contact by Email
```http
GET /api/resource/User Contact?fields=["*"]&filters=[["email","=","usuario@test.com"]]
```

### Update User Contact
```http
PUT /api/resource/User Contact/UC-0001
Content-Type: application/json

{
  "phone": "+573009876543",
  "company": "Nueva Empresa"
}
```

---

## 🗓️ Calendar Resource APIs

### Get Calendar Resource
```http
GET /api/resource/Calendar Resource/Sala Consulta 1
```

**Response**:
```json
{
  "data": {
    "name": "Sala Consulta 1",
    "resource_name": "Sala Consulta 1",
    "resource_type": "Room",
    "availability_plan": "Horario Oficina",
    "slot_duration": 30,
    "video_call_profile": "Google Meet"
  }
}
```

### Get Availability Plan
```http
GET /api/resource/Availability Plan/Horario Oficina
```

---

## 🧪 Testing con cURL

### Login
```bash
curl -X POST http://localhost:8000/api/method/login \
  -H "Content-Type: application/json" \
  -d '{"usr":"usuario@test.com","pwd":"usuario123"}' \
  -c cookies.txt
```

### Get Available Slots (con cookies)
```bash
curl -X POST http://localhost:8000/api/method/meet_scheduling.api.appointment_api.get_available_slots \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "calendar_resource": "Sala Consulta 1",
    "from_date": "2026-01-27",
    "to_date": "2026-01-27"
  }'
```

### Create Appointment
```bash
curl -X POST http://localhost:8000/api/resource/Appointment \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "calendar_resource": "Sala Consulta 1",
    "user_contact": "UC-0001",
    "start_datetime": "2026-01-27 09:00:00",
    "end_datetime": "2026-01-27 09:30:00",
    "status": "Draft"
  }'
```

---

## 🔐 API Token Authentication (Dev/Testing)

En lugar de login con cookies, puedes usar API tokens:

### Create API Token (Frappe Desk)
1. User → [tu usuario] → API Access
2. Click "Generate Keys"
3. Copia el API Key y API Secret

### Use API Token
```bash
curl -X GET http://localhost:8000/api/resource/Appointment \
  -H "Authorization: token [API_KEY]:[API_SECRET]"
```

---

## 📊 Postman Collection

### Variables de Entorno
```json
{
  "base_url": "http://localhost:8000",
  "email": "usuario@test.com",
  "password": "usuario123",
  "calendar_resource": "Sala Consulta 1"
}
```

### Pre-request Script (Login automático)
```javascript
// Postman Pre-request Script
const loginRequest = {
  url: pm.environment.get("base_url") + "/api/method/login",
  method: 'POST',
  header: {
    'Content-Type': 'application/json'
  },
  body: {
    mode: 'raw',
    raw: JSON.stringify({
      usr: pm.environment.get("email"),
      pwd: pm.environment.get("password")
    })
  }
};

pm.sendRequest(loginRequest, function (err, response) {
  if (err) {
    console.log(err);
  } else {
    console.log('Login successful');
  }
});
```

---

## 🧩 JavaScript/TypeScript Examples

### Get Available Slots
```typescript
async function getAvailableSlots(
  calendarResource: string,
  fromDate: string,
  toDate: string
) {
  const response = await fetch('/api/method/meet_scheduling.api.appointment_api.get_available_slots', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Frappe-CSRF-Token': getCookie('csrf_token')
    },
    body: JSON.stringify({
      calendar_resource: calendarResource,
      from_date: fromDate,
      to_date: toDate
    })
  });

  const data = await response.json();
  return data.message;
}
```

### Create and Submit Appointment
```typescript
async function createAppointment(
  calendarResource: string,
  userContact: string,
  startDatetime: string,
  endDatetime: string
) {
  // Create draft
  const createResponse = await fetch('/api/resource/Appointment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Frappe-CSRF-Token': getCookie('csrf_token')
    },
    body: JSON.stringify({
      calendar_resource: calendarResource,
      user_contact: userContact,
      start_datetime: startDatetime,
      end_datetime: endDatetime,
      status: 'Draft'
    })
  });

  const appointment = await createResponse.json();

  // Submit to confirm
  const submitResponse = await fetch(`/api/resource/Appointment/${appointment.data.name}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Frappe-CSRF-Token': getCookie('csrf_token')
    },
    body: JSON.stringify({
      docstatus: 1
    })
  });

  return await submitResponse.json();
}
```

---

## 🎯 Response Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 401 | Unauthorized (not logged in) |
| 403 | Forbidden (no permission) |
| 404 | Not Found |
| 417 | Validation Error |
| 500 | Server Error |

---

## 🔍 Debugging Tips

### Enable Debug Mode
```python
# En site_config.json
{
  "developer_mode": 1,
  "allow_tests": 1
}
```

### Check API Logs
```bash
tail -f logs/web.error.log
```

### Test in Frappe Console
```python
# bench --site site1.local console
from meet_scheduling.api.appointment_api import get_available_slots

slots = get_available_slots(
    calendar_resource="Sala Consulta 1",
    from_date="2026-01-27",
    to_date="2026-01-27"
)

print(slots)
```

---

Para más información, ver:
- [SETUP_GUIDE.md](./SETUP_GUIDE.md) - Guía completa de configuración
- [QUICK_SETUP.md](./QUICK_SETUP.md) - Setup rápido en 10 minutos
