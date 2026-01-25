# Servicios y Modelos

## Arquitectura de Servicios

Los servicios en el Service Portal se organizan en dos categorías principales:
1. **Servicios de Infraestructura**: AuthService, StateService
2. **Servicios de Dominio**: PortalService, MeetSchedulingService

Todos los servicios son **Singleton** con `providedIn: 'root'`.

---

## Servicios de Infraestructura

### AuthService

**Archivo**: `src/app/core/services/auth.service.ts`

**Propósito**: Gestionar autenticación y sesión de usuario.

**API Methods**:

```typescript
login(email: string, password: string): Observable<{
  message: string;
  full_name: string;
  email: string;
}>
```
- POST a `/api/method/login`
- Recibe cookie `sid` automáticamente
- Retorna información básica del usuario

```typescript
logout(): Observable<{ message: string }>
```
- POST a `/api/method/logout`
- Limpia cookie de sesión
- Limpia estado global

```typescript
getCurrentUser(): Observable<User>
```
- GET a `/api/method/frappe.auth.get_logged_user`
- Obtiene información completa del usuario actual
- Usado para verificar sesión

```typescript
checkAuthStatus(): void
```
- Verifica si hay sesión activa al cargar app
- Carga usuario si está autenticado
- Útil para refresh de página

**Uso en Componentes**:

```typescript
// Login
this.authService.login(email, password).subscribe({
  next: (response) => {
    // Guardar usuario en state
    this.stateService.setCurrentUser(response);
    // Navegar a portal
    this.router.navigate(['/portal-selector']);
  },
  error: (err) => {
    this.error.set('Credenciales inválidas');
  }
});

// Logout
this.authService.logout().subscribe({
  next: () => {
    this.stateService.clearState();
    this.router.navigate(['/login']);
  }
});
```

---

### StateService

**Archivo**: `src/app/core/services/state.service.ts`

**Propósito**: Gestión centralizada de estado global de la aplicación.

**Signals de Estado**:

```typescript
// Usuario autenticado
currentUser = signal<User | null>(null);

// Portal seleccionado
selectedPortal = signal<ServicePortal | null>(null);

// Contacto del usuario
userContact = signal<Contact | null>(null);

// Computed: estado de autenticación
isAuthenticated = computed(() => this.currentUser() !== null);
```

**Métodos**:

```typescript
setCurrentUser(user: User): void
setSelectedPortal(portal: ServicePortal): void
setUserContact(contact: Contact): void
clearState(): void  // Limpia todo el estado
```

**Características**:
- **Singleton**: Una única instancia en toda la app
- **Reactividad**: Componentes reaccionan automáticamente a cambios
- **Type-safe**: Interfaces TypeScript
- **Computed values**: Derivados automáticos

**Uso en Componentes**:

```typescript
export class MyComponent {
  private stateService = inject(StateService);

  // Leer estado
  user = this.stateService.currentUser;
  portal = this.stateService.selectedPortal;
  isAuth = this.stateService.isAuthenticated;

  // En template
  // {{ user()?.name }}
  // {{ portal()?.portal_name }}

  // Actualizar estado
  someMethod() {
    this.stateService.setSelectedPortal(newPortal);
  }
}
```

**⚠️ Importante**:
- Nunca modificar signals directamente: `currentUser.set(...)`
- Siempre usar métodos del servicio: `setCurrentUser(...)`

---

## Servicios de Dominio

### PortalService

**Archivo**: `src/app/core/services/portal.service.ts`

**Propósito**: Gestionar operaciones relacionadas con portales.

**API Methods**:

```typescript
getPortal(portalName: string): Observable<ServicePortal>
```
- GET a `/api/resource/Service Portal/${portalName}`
- Obtiene configuración completa del portal
- Incluye herramientas (tools) configuradas

```typescript
getUserPortals(contactEmail: string): Observable<ServicePortal[]>
```
- Obtiene lista de portales asignados al contacto
- Filtra por campo `contacts` del portal
- Usado en portal-selector

```typescript
getContact(email: string): Observable<Contact>
```
- GET a `/api/resource/Contact/${email}`
- Obtiene información del contacto
- Incluye portales asignados

**Modelo de Datos**:

```typescript
interface ServicePortal {
  name: string;              // ID del portal
  portal_name: string;       // Nombre para mostrar
  description?: string;
  color?: string;            // Color hexadecimal
  logo?: string;             // URL del logo
  tools: PortalTool[];       // Herramientas configuradas
  contacts?: string[];       // Emails de contactos
  is_enabled: boolean;
}

interface PortalTool {
  name: string;              // ID de la herramienta
  tool_type: string;         // Tipo (ej: 'meet_scheduling')
  label: string;             // Título para mostrar
  tool_description?: string;
  icon?: string;             // Icono lucide
  button_color?: string;
  display_order: number;
  is_enabled: boolean;
  // Configuración específica de la herramienta
  calendar_resource?: string;
  show_calendar_view?: boolean;
}
```

**Flujo de Carga de Portal**:

```typescript
ngOnInit() {
  const portalName = this.route.snapshot.paramMap.get('portalName');

  this.portalService.getPortal(portalName).subscribe({
    next: (portal) => {
      this.stateService.setSelectedPortal(portal);
      // Portal cargado y disponible globalmente
    },
    error: (err) => {
      console.error('Error loading portal:', err);
      this.router.navigate(['/portal-selector']);
    }
  });
}
```

---

### MeetSchedulingService

**Archivo**: `src/app/core/services/meet-scheduling.service.ts`

**Propósito**: Gestionar citas y disponibilidad de calendario.

**API Methods**:

```typescript
getAvailableSlots(
  resource: string,
  fromDate: string,
  toDate: string
): Observable<AvailableSlot[]>
```
- Obtiene slots disponibles en un rango de fechas
- `resource`: ID del Calendar Resource de Frappe
- Formato de fechas: `YYYY-MM-DD`
- Retorna array de slots con horarios

```typescript
createAndConfirmAppointment(
  resource: string,
  contact: string,
  startTime: string,
  endTime: string
): Observable<Appointment>
```
- Crea y confirma una cita en un solo paso
- `startTime/endTime`: `YYYY-MM-DD HH:mm:ss`
- Retorna la cita creada con todos los detalles

```typescript
getUserAppointments(contactEmail: string): Observable<Appointment[]>
```
- Obtiene todas las citas de un contacto
- Incluye pasadas y futuras
- Ordenadas por fecha

```typescript
cancelAppointment(appointmentName: string): Observable<void>
```
- Cancela una cita existente
- Actualiza status a 'Cancelled'

**Modelos de Datos**:

```typescript
interface AvailableSlot {
  start: string;           // 'YYYY-MM-DD HH:mm:ss'
  end: string;
  is_available: boolean;
  calendar_resource: string;
}

interface Appointment {
  name: string;            // ID del documento
  start_datetime: string;
  end_datetime: string;
  status: 'Draft' | 'Confirmed' | 'Cancelled' | 'Completed';
  contact: string;         // Email del contacto
  meeting_url?: string;    // URL de videollamada
  calendar_resource: string;
}
```

**Ejemplo de Uso**:

```typescript
// Cargar slots del mes
const firstDay = new Date(2026, 0, 1);
const lastDay = new Date(2026, 0, 31);

this.meetSchedulingService.getAvailableSlots(
  'CALENDAR-RESOURCE-001',
  '2026-01-01',
  '2026-01-31'
).subscribe({
  next: (slots) => {
    // Procesar y mostrar slots
    const map = new Map<string, AvailableSlot[]>();
    slots.forEach(slot => {
      const dateStr = slot.start.split(' ')[0];
      if (!map.has(dateStr)) {
        map.set(dateStr, []);
      }
      map.get(dateStr)!.push(slot);
    });
    this.availabilityMap.set(map);
  }
});

// Crear cita
this.meetSchedulingService.createAndConfirmAppointment(
  'CALENDAR-RESOURCE-001',
  'user@example.com',
  '2026-01-15 10:00:00',
  '2026-01-15 11:00:00'
).subscribe({
  next: (appointment) => {
    console.log('Cita creada:', appointment);
    this.showConfirmModal.set(true);
  },
  error: (err) => {
    this.error.set('Error al crear la cita');
  }
});
```

---

## Interceptores

### AuthInterceptor

**Archivo**: `src/app/core/interceptors/auth.interceptor.ts`

**Propósito**: Interceptar requests HTTP para configurar credenciales.

**Implementación**:

```typescript
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Clonar request con credenciales
  const authReq = req.clone({
    withCredentials: true
  });

  return next(authReq);
};
```

**Características**:
- **withCredentials**: Permite envío de cookies
- **Automático**: Se aplica a todos los requests
- **Cookie sid**: Frappe gestiona autenticación con cookies

**Configuración**:

```typescript
// app.config.ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(
      withInterceptors([authInterceptor])
    )
  ]
};
```

---

### ErrorInterceptor

**Archivo**: `src/app/core/interceptors/error.interceptor.ts`

**Propósito**: Manejo centralizado de errores HTTP.

**Implementación**:

```typescript
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        // No autenticado - redirigir a login
        inject(Router).navigate(['/login']);
      } else if (error.status === 403) {
        // Sin permisos
        console.error('Forbidden:', error);
      } else if (error.status === 500) {
        // Error del servidor
        console.error('Server error:', error);
      }

      return throwError(() => error);
    })
  );
};
```

**Manejo de Errores Comunes**:
- **401**: Sesión expirada → redirect a login
- **403**: Sin permisos → mensaje de error
- **404**: Recurso no encontrado
- **500**: Error del servidor

---

## Guards

### authGuard

**Archivo**: `src/app/core/guards/auth.guard.ts`

**Propósito**: Proteger rutas que requieren autenticación.

**Implementación**:

```typescript
export const authGuard: CanActivateFn = (route, state) => {
  const stateService = inject(StateService);
  const router = inject(Router);

  if (stateService.isAuthenticated()) {
    return true;
  }

  // No autenticado - redirigir a login
  router.navigate(['/login'], {
    queryParams: { returnUrl: state.url }
  });
  return false;
};
```

**Uso en Rutas**:

```typescript
{
  path: 'portal-selector',
  component: PortalSelectorComponent,
  canActivate: [authGuard]  // ← Requiere autenticación
}
```

**Características**:
- **Verifica estado**: Usa `isAuthenticated()` computed signal
- **Redirección**: Guarda URL de retorno
- **Return URL**: Después de login, vuelve a la página solicitada

---

## Configuración HTTP

### API Base URL

**Archivo**: `src/app/core/config/api.config.ts`

```typescript
export const API_CONFIG = {
  baseUrl: '',  // Mismo origen que Frappe
  endpoints: {
    login: '/api/method/login',
    logout: '/api/method/logout',
    currentUser: '/api/method/frappe.auth.get_logged_user',
    // ... más endpoints
  }
};
```

**Características**:
- **Same Origin**: No requiere CORS
- **Relative URLs**: Funciona en dev y prod
- **Centralizado**: Fácil de mantener

---

## Mejores Prácticas

### 1. Manejo de Observables

```typescript
// ✅ CORRECTO: Unsubscribe automático
this.service.getData().subscribe({
  next: (data) => { /* ... */ },
  error: (err) => { /* ... */ }
});

// ❌ INCORRECTO: Memory leak
const subscription = this.service.getData().subscribe(...);
// Olvidó unsubscribe en ngOnDestroy
```

### 2. Error Handling

```typescript
// ✅ CORRECTO: Maneja errores
this.service.getData().subscribe({
  next: (data) => { /* ... */ },
  error: (err) => {
    console.error('Error:', err);
    this.error.set('Mensaje amigable para usuario');
    this.loading.set(false);
  }
});

// ❌ INCORRECTO: No maneja errores
this.service.getData().subscribe({
  next: (data) => { /* ... */ }
});
```

### 3. Transformación de Datos

```typescript
// ✅ CORRECTO: Transforma en el servicio
getFormattedData(): Observable<FormattedData[]> {
  return this.http.get<RawData[]>(url).pipe(
    map(data => data.map(item => this.transform(item)))
  );
}

// ❌ INCORRECTO: Transforma en el componente
// El componente no debería conocer formato de API
```

### 4. Estado Loading

```typescript
// ✅ CORRECTO: Maneja loading en todos los casos
this.loading.set(true);
this.service.getData().subscribe({
  next: (data) => {
    // procesar
    this.loading.set(false);
  },
  error: (err) => {
    // error
    this.loading.set(false);  // ← No olvidar
  }
});
```

### 5. Type Safety

```typescript
// ✅ CORRECTO: Tipado fuerte
interface User {
  name: string;
  email: string;
}

getUser(): Observable<User> {
  return this.http.get<User>(url);
}

// ❌ INCORRECTO: any
getUser(): Observable<any> {
  return this.http.get(url);
}
```
