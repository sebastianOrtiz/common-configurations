# Quick Setup - Service Portal + Meet Scheduling

Guía rápida para configurar un portal funcional en 10 minutos.

## 🚀 Setup Rápido

### 1. Usuario (Frappe Desk)
```
User → New
├─ Email: usuario@test.com
├─ Password: usuario123
└─ Role: Portal API User
```

### 2. Availability Plan
```
Availability Plan → New
├─ Plan Name: Horario Oficina
├─ Timezone: America/Bogota
└─ Weekly Slots:
    Lunes-Viernes
    ├─ 09:00-12:00 (Capacity: 1)
    └─ 14:00-17:00 (Capacity: 1)
```

### 3. Calendar Resource
```
Calendar Resource → New
├─ Resource Name: Sala Consulta 1
├─ Availability Plan: Horario Oficina
└─ Slot Duration: 30 min
```

### 4. Tool Type
```
Tool Type → New
├─ Tool Name: meet_scheduling
├─ Tool Label: Agendamiento de Citas
├─ App Name: meet_scheduling
└─ Is Active: ✓
```

### 5. Service Portal
```
Service Portal → New
├─ Portal Name: portal-consultas
├─ Title: Portal de Consultas
├─ Is Active: ✓
├─ Request Contact User Data: ✓
└─ Portal Tools:
    └─ Row 1:
        ├─ Tool Type: meet_scheduling
        ├─ Label: Agendar Cita
        ├─ Calendar Resource: Sala Consulta 1
        └─ Is Enabled: ✓
```

### 6. Build Frontend
```bash
cd apps/common_configurations/front_apps/service-portal
npm install
npm run build
```

### 7. Acceder
```
URL: http://localhost:8000/service-portal
Login: usuario@test.com / usuario123
```

## 📝 Estructura de Datos

### Relaciones Clave
```
User ─────────────┐
                  ├──→ User Contact ──→ Appointment
Service Portal ───┘                         │
    │                                       │
    └──→ Portal Tool ──→ Tool Type         │
             │                              │
             └──→ Calendar Resource ────────┘
                       │
                       └──→ Availability Plan
                       └──→ Video Call Profile
```

### DocTypes Importantes

| DocType | Propósito |
|---------|-----------|
| **Service Portal** | Configuración del portal |
| **Tool Type** | Registro de herramientas disponibles |
| **Calendar Resource** | Recurso agendable (sala, persona) |
| **Availability Plan** | Horarios disponibles |
| **Appointment** | Cita agendada |
| **User Contact** | Datos de contacto del usuario |
| **Video Call Profile** | Config para generar URLs de reunión |

## 🔧 Comandos Rápidos

### Frontend
```bash
# Desarrollo
npm start

# Build producción
npm run build

# Limpiar caché después de build
bench --site site1.local clear-cache
```

### Frappe
```bash
# Migrar cambios
bench --site site1.local migrate

# Reiniciar
bench restart

# Consola Python
bench --site site1.local console

# Ver logs
tail -f logs/web.error.log
```

## 🐛 Debugging Rápido

### No hay slots disponibles
```python
# En bench console
slots = frappe.get_all('Availability Plan Slot',
    filters={'parent': 'Horario Oficina'})
print(slots)
```

### Ver appointments
```python
# En bench console
apps = frappe.get_all('Appointment',
    fields=['*'],
    filters={'calendar_resource': 'Sala Consulta 1'})
for a in apps:
    print(f"{a.name}: {a.start_datetime} - {a.status}")
```

### Limpiar data de prueba
```python
# CUIDADO: Borra todas las citas y contactos
frappe.db.delete('Appointment')
frappe.db.delete('User Contact')
frappe.db.commit()
```

## 📊 Verificación Rápida

### Checklist Pre-Producción

- [ ] Usuario tiene rol `Portal API User`
- [ ] Availability Plan tiene slots configurados
- [ ] Calendar Resource está activo
- [ ] Tool Type está activo
- [ ] Service Portal está activo
- [ ] Portal Tool está enabled
- [ ] Frontend está construido (`npm run build`)
- [ ] Se puede acceder a `/service-portal`
- [ ] Login funciona correctamente
- [ ] Se muestran slots disponibles
- [ ] Se puede crear una cita
- [ ] La cita aparece en Frappe Desk

## 🎨 Personalización Rápida

### Colores del Portal
```python
# Actualizar colores
portal = frappe.get_doc('Service Portal', 'portal-consultas')
portal.primary_color = '#667eea'
portal.secondary_color = '#764ba2'
portal.save()
```

### Agregar Tool al Portal
```python
portal = frappe.get_doc('Service Portal', 'portal-consultas')
portal.append('tools', {
    'tool_type': 'meet_scheduling',
    'label': 'Nueva Herramienta',
    'display_order': 2,
    'is_enabled': 1,
    'calendar_resource': 'Sala Consulta 2'
})
portal.save()
```

## 🔄 Flujo de Usuario (Frontend)

```
1. /service-portal
   ↓ (redirect si no autenticado)
2. /service-portal/login
   ↓ (login exitoso)
3. /service-portal/portals
   ↓ (selecciona portal)
4. /service-portal/portal/portal-consultas
   ↓ (si requiere registro)
5. /service-portal/portal/portal-consultas/register
   ↓ (después de registrar o si ya está registrado)
6. /service-portal/portal/portal-consultas
   ↓ (click en herramienta)
7. /service-portal/portal/portal-consultas/tool/meet_scheduling
```

## 📱 PWA - Instalación

El frontend es una PWA, se puede instalar:

**Escritorio (Chrome/Edge)**:
- Click en icono de instalación en la barra de URL
- O Menu → Instalar Portal de Servicios

**Móvil (Chrome Android)**:
- Menu → Agregar a pantalla de inicio

**Características PWA**:
- ✓ Funciona offline (con Service Worker)
- ✓ Instalable como app nativa
- ✓ Caché de API requests
- ✓ Lazy loading de componentes

## 🎯 Testing Rápido

### Script de Prueba Completo
```python
import frappe

# 1. Crear usuario de prueba
user = frappe.get_doc({
    'doctype': 'User',
    'email': 'test@example.com',
    'first_name': 'Test',
    'new_password': 'test123',
    'send_welcome_email': 0
})
user.insert()
user.add_roles('Portal API User')

# 2. Crear availability plan
plan = frappe.get_doc({
    'doctype': 'Availability Plan',
    'plan_name': 'Test Plan',
    'timezone': 'America/Bogota',
    'slots': [{
        'day_of_week': 'Monday',
        'from_time': '09:00:00',
        'to_time': '17:00:00',
        'capacity': 1
    }]
})
plan.insert()

# 3. Crear calendar resource
resource = frappe.get_doc({
    'doctype': 'Calendar Resource',
    'resource_name': 'Test Room',
    'availability_plan': plan.name,
    'slot_duration': 30
})
resource.insert()

# 4. Crear portal
portal = frappe.get_doc({
    'doctype': 'Service Portal',
    'portal_name': 'test-portal',
    'title': 'Test Portal',
    'is_active': 1,
    'tools': [{
        'tool_type': 'meet_scheduling',
        'label': 'Test Tool',
        'is_enabled': 1,
        'calendar_resource': resource.name
    }]
})
portal.insert()

frappe.db.commit()
print('Setup completo!')
```

## 📦 Exports/Fixtures

### Exportar Configuración
```bash
# Exportar Service Portal
bench --site site1.local export-fixtures "Service Portal"

# Exportar Tool Types
bench --site site1.local export-fixtures "Tool Type"
```

Esto crea archivos JSON en `fixtures/` que se pueden versionar en git.

---

**Tiempo estimado**: 10-15 minutos para setup básico funcional.

¿Problemas? Ver [SETUP_GUIDE.md](./SETUP_GUIDE.md) para documentación completa.
