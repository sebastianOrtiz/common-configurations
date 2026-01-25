# Service Portal - Sistema Completo de Agendamiento

Sistema modular de portales de servicios con agendamiento de citas, construido sobre Frappe Framework.

## 🎯 ¿Qué es esto?

Un sistema completo que permite:
- **Múltiples portales** configurables con diferentes herramientas
- **Agendamiento de citas** con calendarios y disponibilidad
- **Frontend PWA** moderno con Angular 21
- **API REST** completa para integraciones
- **Registro de usuarios** y gestión de contactos
- **Videoconferencias** automáticas (Google Meet, Jitsi, etc.)

## 📚 Documentación

### Para Empezar
- **[QUICK_SETUP.md](./QUICK_SETUP.md)** - ⚡ Setup rápido en 10 minutos
- **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** - 📖 Guía completa paso a paso

### Para Desarrolladores
- **[API_EXAMPLES.md](./API_EXAMPLES.md)** - 🔌 Ejemplos de APIs con cURL y código
- **[DYNAMIC_FORMS.md](./DYNAMIC_FORMS.md)** - 📝 Formularios dinámicos y campos personalizados
- **[FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md)** - 🎨 Integración frontend-backend
- **[PROJECT_STATUS.md](../meet_scheduling/PROJECT_STATUS.md)** - 📊 Estado del proyecto

## 🚀 Quick Start

### 1. Instalar Apps
```bash
# Si aún no están instaladas
bench get-app meet_scheduling
bench get-app common_configurations

# Instalar en tu sitio
bench --site site1.local install-app meet_scheduling
bench --site site1.local install-app common_configurations
```

### 2. Build Frontend
```bash
cd apps/common_configurations/front_apps/service-portal
npm install
npm run build
```

### 3. Configurar (5 minutos)
```bash
# Ver QUICK_SETUP.md para detalles
# Básicamente: Usuario → Calendar Resource → Tool Type → Service Portal
```

### 4. Acceder
```
http://localhost:8000/service-portal
```

## 🏗️ Arquitectura

### Backend (Frappe Python)
```
common_configurations/
├── doctypes/
│   ├── Service Portal          # Configuración del portal
│   ├── Tool Type               # Registro de herramientas
│   └── User Contact            # Datos de usuarios
└── api/
    └── portal_api.py           # APIs del portal

meet_scheduling/
├── doctypes/
│   ├── Calendar Resource       # Recursos agendables
│   ├── Availability Plan       # Horarios disponibles
│   ├── Appointment             # Citas
│   └── Video Call Profile      # Config videoconferencias
└── api/
    └── appointment_api.py      # APIs de agendamiento
```

### Frontend (Angular 21 PWA)
```
front_apps/service-portal/
├── features/
│   ├── auth/                   # Login
│   ├── portal/                 # Portal selector & view
│   └── tools/                  # Herramientas (lazy loaded)
│       └── meet-scheduling/    # Agendamiento
├── core/
│   ├── services/               # APIs & State management
│   ├── models/                 # TypeScript interfaces
│   └── guards/                 # Route protection
└── ngsw-config.json           # Service Worker (PWA)
```

## 🎨 Características

### Frontend
- ✅ **PWA Instalable** - Funciona offline con Service Worker
- ✅ **Lazy Loading** - Carga herramientas bajo demanda
- ✅ **Responsive Design** - Móvil, tablet, escritorio
- ✅ **Angular Signals** - Gestión de estado reactiva
- ✅ **Rutas Protegidas** - AuthGuard integrado
- ✅ **Persistencia Local** - Estado guardado en localStorage

### Backend
- ✅ **Multi-tenant** - Múltiples portales independientes
- ✅ **Extensible** - Sistema de plugins para herramientas
- ✅ **Capacity Management** - Control de aforo en slots
- ✅ **Validaciones** - Prevención de doble reserva
- ✅ **APIs REST** - Integración con cualquier cliente
- ✅ **Permisos** - Control de acceso granular

## 🔧 Configuración

### DocTypes Principales

| DocType | Descripción | Ejemplo |
|---------|-------------|---------|
| **Service Portal** | Portal configurado | "Portal Médico" |
| **Portal Tool** | Herramienta en un portal | "Agendar Consulta" |
| **Tool Type** | Tipo de herramienta registrada | "meet_scheduling" |
| **Calendar Resource** | Recurso agendable | "Dr. Smith", "Sala 1" |
| **Availability Plan** | Horarios disponibles | "Lun-Vie 9-17h" |
| **Appointment** | Cita creada | "27/01 09:00-09:30" |
| **User Contact** | Datos del usuario | Nombre, tel, empresa |

### Flujo de Datos

```
Usuario Frontend
    ↓ (login)
AuthService → FrappeAPI
    ↓ (get portals)
PortalService → Service Portal DocType
    ↓ (select portal)
StateService → localStorage
    ↓ (select tool)
MeetSchedulingService → Calendar Resource
    ↓ (get slots)
Availability Plan → AvailableSlot[]
    ↓ (book appointment)
Appointment (Draft) → Submit → Confirmed
    ↓ (if video profile)
Video Call Profile → Generate Meeting URL
```

## 📱 PWA Features

El frontend es una **Progressive Web App** completa:

### Instalación
- **Chrome/Edge**: Click en ícono de instalación en barra URL
- **Mobile**: "Agregar a pantalla de inicio"

### Offline
- ✅ App shell cacheada
- ✅ Lazy chunks cacheados
- ✅ API responses cacheadas (con estrategias)
- ✅ Funciona sin conexión

### Configuración Service Worker
```json
{
  "app": "prefetch",           // App shell
  "lazy-bundles": "lazy",      // Componentes lazy
  "api-fresh": "freshness",    // Auth (1 min cache)
  "api-performance": "performance" // Data (1h cache)
}
```

## 🛠️ Development

### Frontend Development
```bash
cd front_apps/service-portal

# Desarrollo con hot reload
npm start

# Build producción
npm run build

# Tests
npm test
```

### Backend Development
```bash
# Crear nueva herramienta (Tool Type)
bench new-doctype

# Migrar cambios
bench --site site1.local migrate

# Reiniciar
bench restart

# Ver logs
tail -f logs/web.error.log
```

### Agregar Nueva Herramienta

1. **Backend**: Crear DocType y APIs en tu app
2. **Registrar**: Crear Tool Type en Frappe
3. **Frontend**: Crear componente en `features/tools/`
4. **Routing**: Agregar ruta en `tools.routes.ts`
5. **Configurar**: Agregar custom fields al Service Portal Tool

## 🧪 Testing

### Manual Testing
```python
# bench --site site1.local console

# 1. Crear appointment de prueba
from meet_scheduling.api.appointment_api import validate_appointment

result = validate_appointment(
    calendar_resource="Sala Consulta 1",
    start_datetime="2026-01-27 09:00:00",
    end_datetime="2026-01-27 09:30:00"
)
print(result)

# 2. Ver slots disponibles
from meet_scheduling.api.appointment_api import get_available_slots

slots = get_available_slots(
    calendar_resource="Sala Consulta 1",
    from_date="2026-01-27",
    to_date="2026-01-27"
)
print(len(slots), "slots disponibles")
```

### API Testing
```bash
# Postman Collection
# Ver API_EXAMPLES.md para ejemplos completos

# cURL rápido
curl -X POST http://localhost:8000/api/method/login \
  -H "Content-Type: application/json" \
  -d '{"usr":"usuario@test.com","pwd":"usuario123"}' \
  -c cookies.txt
```

## 📊 Métricas del Proyecto

### Backend
- **meet_scheduling**: ~65% completo
  - ✅ Calendar Resources
  - ✅ Availability Plans
  - ✅ Appointments
  - ✅ Video Call Integration
  - 🟡 Notifications (pendiente)
  - 🟡 Recurring appointments (pendiente)

- **common_configurations**: ~95% completo
  - ✅ Service Portal
  - ✅ Tool Types
  - ✅ User Contacts
  - ✅ Custom Fields System

### Frontend
- **Angular App**: 100% completo
  - ✅ Authentication
  - ✅ Portal Selector
  - ✅ Portal View
  - ✅ Meet Scheduling Tool
  - ✅ PWA Configuration
  - ✅ State Management
  - ✅ Lazy Loading

## 🎯 Roadmap

### Corto Plazo
- [ ] Notificaciones por email
- [ ] Recordatorios automáticos
- [ ] Búsqueda de slots avanzada
- [ ] Filtros en calendario

### Mediano Plazo
- [ ] Citas recurrentes
- [ ] Múltiples participantes
- [ ] Integración con calendarios externos (Google Calendar, Outlook)
- [ ] Chat en tiempo real

### Largo Plazo
- [ ] Sistema de pagos
- [ ] Reportes y analytics
- [ ] Marketplace de herramientas
- [ ] App móvil nativa

## 🤝 Contribuir

### Estructura de Commits
```bash
git commit -m "tipo: descripción breve

Explicación detallada si es necesario

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

**Tipos**: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

### Branches
- `main` - Producción estable
- `develop` - Desarrollo
- `feature/*` - Nuevas características
- `fix/*` - Bug fixes

## 📝 Changelog

### v1.0.0 (Enero 2026)
- ✅ Sistema completo de Service Portal
- ✅ Frontend Angular PWA
- ✅ Integración meet_scheduling
- ✅ Sistema de herramientas extensible
- ✅ Documentación completa

## 📧 Soporte

**Problemas comunes**: Ver [SETUP_GUIDE.md](./SETUP_GUIDE.md) sección Troubleshooting

**APIs**: Ver [API_EXAMPLES.md](./API_EXAMPLES.md) para ejemplos completos

**Frontend**: Ver [FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md)

## 📄 Licencia

MIT License - Ver archivo LICENSE

---

**¿Nuevo en el proyecto?** → Empieza con [QUICK_SETUP.md](./QUICK_SETUP.md)

**¿Necesitas configurar?** → Lee [SETUP_GUIDE.md](./SETUP_GUIDE.md)

**¿Desarrollando?** → Consulta [API_EXAMPLES.md](./API_EXAMPLES.md)

---

Hecho con ❤️ usando Frappe Framework y Angular 21
