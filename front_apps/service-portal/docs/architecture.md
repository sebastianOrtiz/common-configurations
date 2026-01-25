# Arquitectura del Sistema

## Visión General

El Service Portal sigue una arquitectura de aplicación web moderna con separación clara entre frontend y backend:

- **Frontend**: Angular 21 SPA (Single Page Application)
- **Backend**: Frappe Framework con API REST
- **Comunicación**: HTTP/HTTPS con JWT para autenticación

## Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                    NAVEGADOR                             │
│  ┌───────────────────────────────────────────────────┐  │
│  │           Angular 21 Application                   │  │
│  │                                                     │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────┐ │  │
│  │  │   Guards    │  │  Interceptors │  │  Services│ │  │
│  │  └─────────────┘  └──────────────┘  └──────────┘ │  │
│  │                                                     │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │         Components (Standalone)              │  │  │
│  │  │  - Auth   - Portal   - Tools                 │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │ HTTP/REST API
                          ▼
┌─────────────────────────────────────────────────────────┐
│               FRAPPE FRAMEWORK (Backend)                 │
│  ┌───────────────────────────────────────────────────┐  │
│  │                  REST API                          │  │
│  │  /api/method/...                                   │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │              DocTypes (Database)                   │  │
│  │  - Service Portal                                  │  │
│  │  - Service Portal Tool                             │  │
│  │  - Tool Type                                       │  │
│  │  - Contact                                         │  │
│  │  - Appointment                                     │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Capas de la Aplicación

### 1. Capa de Presentación (Components)

Los componentes se organizan por funcionalidad:

```
features/
├── auth/                    # Autenticación
│   ├── login/              # Componente de login
│   └── contact-registration/ # Registro de contactos
├── portal/                  # Portal principal
│   ├── portal-selector/    # Selector de portales
│   ├── portal-layout/      # Layout del portal
│   └── portal-view/        # Vista de herramientas
└── tools/                   # Herramientas dinámicas
    ├── tool-router/        # Router de herramientas
    └── meet-scheduling/    # Herramienta de citas
```

**Características**:
- Componentes standalone (sin NgModules)
- Uso de Signals para reactividad
- Lazy loading de herramientas
- Routing modular

### 2. Capa de Lógica de Negocio (Services)

```
core/services/
├── auth.service.ts          # Autenticación
├── state.service.ts         # Estado global
├── portal.service.ts        # Gestión de portales
├── meet-scheduling.service.ts # Agendamiento de citas
└── frappe-api.service.ts    # Cliente API genérico
```

**Responsabilidades**:
- Comunicación con API
- Gestión de estado
- Lógica de negocio
- Transformación de datos

### 3. Capa de Datos (Models)

```
core/models/
├── portal.model.ts          # Service Portal, Portal Tool
├── user.model.ts            # User, Contact
├── appointment.model.ts     # Appointment, Slot
└── api-response.model.ts    # Respuestas de API
```

**Características**:
- Interfaces TypeScript
- Mapeo de DocTypes de Frappe
- Tipos fuertemente tipados

### 4. Capa de Infraestructura (Core)

```
core/
├── guards/
│   └── auth.guard.ts        # Protección de rutas
├── interceptors/
│   ├── auth.interceptor.ts  # Inyección de tokens
│   └── error.interceptor.ts # Manejo de errores
└── config/
    └── api.config.ts        # Configuración de API
```

## Patrones de Diseño Implementados

### 1. Singleton Pattern
- **StateService**: Estado global único
- **AuthService**: Sesión única de autenticación

### 2. Observer Pattern
- **RxJS Observables**: Para comunicación asíncrona
- **Signals**: Para reactividad de estado

### 3. Dependency Injection
- Todos los servicios usan DI de Angular
- `inject()` function para standalone components

### 4. Lazy Loading
- Herramientas se cargan bajo demanda
- Optimización de bundle size

### 5. Route Guards
- `AuthGuard`: Protege rutas autenticadas
- Redirección automática a login

### 6. Interceptors
- `AuthInterceptor`: Inyecta tokens automáticamente
- `ErrorInterceptor`: Manejo centralizado de errores

## Flujo de Datos

### Flujo de Autenticación

```
┌──────────┐
│  Login   │
│Component │
└────┬─────┘
     │ credentials
     ▼
┌──────────┐
│  Auth    │
│ Service  │
└────┬─────┘
     │ HTTP POST
     ▼
┌──────────┐
│  Frappe  │
│   API    │
└────┬─────┘
     │ sid cookie + user data
     ▼
┌──────────┐
│  State   │
│ Service  │ ──▶ currentUser signal
└──────────┘
```

### Flujo de Carga de Portal

```
┌──────────────┐
│ Portal View  │
│  Component   │
└──────┬───────┘
       │ portal name
       ▼
┌──────────────┐
│   Portal     │
│   Service    │
└──────┬───────┘
       │ HTTP GET
       ▼
┌──────────────┐
│   Frappe     │
│   DocType    │
└──────┬───────┘
       │ portal config + tools
       ▼
┌──────────────┐
│    State     │
│   Service    │ ──▶ selectedPortal signal
└──────────────┘
```

### Flujo de Herramienta Dinámica

```
┌──────────────┐
│ Tool Router  │
│  Component   │
└──────┬───────┘
       │ tool type
       ▼
┌──────────────┐
│   Dynamic    │
│   Import     │ ──▶ import('tool.component')
└──────┬───────┘
       │ Component class
       ▼
┌──────────────┐
│ ViewContainer│
│     Ref      │ ──▶ createComponent()
└──────────────┘
       │
       ▼
   Tool Loaded
```

## Gestión de Estado

### Señales (Signals)

El estado se maneja con Signals de Angular para reactividad:

```typescript
// StateService
currentUser = signal<User | null>(null);
selectedPortal = signal<ServicePortal | null>(null);
userContact = signal<Contact | null>(null);

// Computed signals
isAuthenticated = computed(() => this.currentUser() !== null);
```

**Ventajas**:
- Reactividad automática
- Performance optimizada
- Menos boilerplate que RxJS
- Change detection eficiente

### Observables (RxJS)

Para operaciones asíncronas se usa RxJS:

```typescript
// API calls
login(email: string, password: string): Observable<LoginResponse>
getPortal(name: string): Observable<ServicePortal>
```

**Ventajas**:
- Operaciones asíncronas complejas
- Cancelación de peticiones
- Operadores poderosos (map, filter, etc.)

## Sistema de Routing

### Configuración de Rutas

```typescript
export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: ContactRegistrationComponent },
  {
    path: 'portal-selector',
    component: PortalSelectorComponent,
    canActivate: [authGuard]
  },
  {
    path: 'portal/:portalName',
    component: PortalLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', component: PortalViewComponent },
      {
        path: 'tool/:toolType',
        loadChildren: () => import('./features/tools/tools.routes')
      }
    ]
  }
];
```

**Características**:
- Protección con guards
- Lazy loading de herramientas
- Rutas anidadas
- Parámetros de ruta

## Integración con Frappe

### API Endpoints Utilizados

```
POST   /api/method/login                     # Login
POST   /api/method/logout                    # Logout
GET    /api/method/frappe.auth.get_logged_user  # Usuario actual
GET    /api/resource/Service Portal/:name    # Obtener portal
GET    /api/resource/Contact/:email          # Obtener contacto
POST   /api/resource/Contact                 # Crear contacto
GET    /api/resource/Appointment             # Obtener citas
POST   /api/method/custom_appointment_method # Crear cita
```

### Autenticación

Frappe usa **cookies de sesión**:
- Cookie `sid` se envía automáticamente
- No se requiere token JWT
- `withCredentials: true` en HTTP requests

## Build y Deployment

### Proceso de Build

```bash
npm run build
├─ Compilación TypeScript → JavaScript
├─ Optimización de bundles
├─ Minificación
├─ Tree shaking
└─ Output: common_configurations/public/service-portal/
```

### Deployment

1. Build se copia automáticamente a Frappe public
2. `index.html` se copia a `www/service-portal.html`
3. Frappe sirve la aplicación en `/service-portal`
4. Assets se sirven desde `/assets/common_configurations/service-portal/`

## Consideraciones de Performance

### Bundle Splitting
- Initial bundle: ~250 KB
- Lazy chunks para cada herramienta
- Vendor chunks separados

### Change Detection
- OnPush strategy donde sea posible
- Signals para minimizar change detection
- `detectChanges()` manual cuando necesario

### Optimizaciones
- Lazy loading de rutas
- Preconnect a Google Fonts
- Tree shaking automático
- Minificación y compresión
