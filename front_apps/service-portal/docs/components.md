# Componentes del Service Portal

## Árbol de Componentes

```
App
├── LoginComponent
├── ContactRegistrationComponent
├── PortalSelectorComponent
└── PortalLayoutComponent
    ├── PortalViewComponent
    └── ToolRouterComponent
        └── [Dynamic Tool Components]
            └── MeetSchedulingToolComponent
```

## Componentes de Autenticación

### LoginComponent

**Ruta**: `/login`
**Archivo**: `src/app/features/auth/login/login.component.ts`

**Propósito**: Gestionar el inicio de sesión de usuarios.

**Signals**:
```typescript
email = signal<string>('');
password = signal<string>('');
loading = signal<boolean>(false);
error = signal<string>('');
```

**Métodos principales**:
```typescript
onSubmit(): void
  // 1. Valida credenciales
  // 2. Llama a authService.login()
  // 3. Guarda usuario en state
  // 4. Navega a portal-selector o portal específico
```

**Flujo**:
1. Usuario ingresa credenciales
2. Click en "Iniciar Sesión"
3. Validación de campos
4. Petición POST a `/api/method/login`
5. Si exitoso: navegación a portal
6. Si falla: muestra error

**Template Features**:
- Formulario reactivo con signals
- Validación en tiempo real
- Estados de loading
- Mensajes de error
- Link a registro

---

### ContactRegistrationComponent

**Ruta**: `/register`
**Archivo**: `src/app/features/auth/contact-registration/contact-registration.component.ts`

**Propósito**: Registrar nuevos contactos/usuarios.

**Signals**:
```typescript
firstName = signal<string>('');
lastName = signal<string>('');
email = signal<string>('');
phone = signal<string>('');
password = signal<string>('');
confirmPassword = signal<string>('');
loading = signal<boolean>(false);
error = signal<string>('');
successMessage = signal<string>('');
```

**Validaciones**:
- Email válido
- Password mínimo 8 caracteres
- Confirmación de password coincide
- Campos requeridos

**Flujo**:
1. Usuario completa formulario
2. Validación de campos
3. POST a `/api/resource/Contact`
4. Si exitoso: muestra mensaje y navega a login
5. Si falla: muestra error específico

---

## Componentes de Portal

### PortalSelectorComponent

**Ruta**: `/portal-selector`
**Archivo**: `src/app/features/portal/portal-selector/portal-selector.component.ts`

**Propósito**: Permitir al usuario seleccionar entre múltiples portales disponibles.

**Signals**:
```typescript
portals = signal<ServicePortal[]>([]);
loading = signal<boolean>(true);
error = signal<string>('');
```

**Métodos principales**:
```typescript
ngOnInit(): void
  // Carga portales del contacto actual

selectPortal(portal: ServicePortal): void
  // 1. Guarda portal en state
  // 2. Navega a /portal/:portalName
```

**Características**:
- Grid responsive de tarjetas
- Muestra logo, nombre y descripción
- Color personalizado por portal
- Botón de logout

**Comportamiento**:
- Si solo hay 1 portal: redirección automática
- Si hay múltiples: muestra selector
- Si no hay portales: muestra mensaje

---

### PortalLayoutComponent

**Ruta**: `/portal/:portalName`
**Archivo**: `src/app/features/portal/portal-layout/portal-layout.component.ts`

**Propósito**: Layout principal del portal con header y contenido.

**Estructura**:
```html
<div class="portal-layout">
  <!-- Header con logo y usuario -->
  <div class="portal-header">
    <div class="portal-info">
      <div class="portal-logo">...</div>
      <div class="portal-text">
        <h1>{{ portal name }}</h1>
        <p>{{ portal description }}</p>
      </div>
    </div>
    <div class="user-menu">
      <div class="user-info">
        <span>{{ user name }}</span>
        <div class="user-avatar">...</div>
      </div>
      <button class="btn-logout">...</button>
    </div>
  </div>

  <!-- Contenido (router-outlet) -->
  <div class="portal-main">
    <router-outlet />
  </div>
</div>
```

**Signals**:
```typescript
portal = computed(() => this.stateService.selectedPortal());
user = computed(() => this.stateService.currentUser());
contact = computed(() => this.stateService.userContact());
portalColor = signal<string>('#667eea');
```

**Características del Header**:
- **Logo del portal**: Imagen o icono de fallback
- **Información del portal**: Nombre y descripción
- **Usuario**: Nombre, avatar/iniciales
- **Botón de logout**: Con animación hover
- **Sticky**: Se mantiene visible al hacer scroll
- **Responsive**: Se adapta a mobile

**Estilos Dinámicos**:
```typescript
ngOnInit() {
  const portal = this.portal();
  if (portal?.color) {
    document.documentElement.style.setProperty('--portal-color', portal.color);
  }
}
```

---

### PortalViewComponent

**Ruta**: `/portal/:portalName` (vista por defecto)
**Archivo**: `src/app/features/portal/portal-view/portal-view.component.ts`

**Propósito**: Mostrar las herramientas disponibles en el portal.

**Template**:
```html
<div class="portal-view">
  <div class="welcome-section">
    <h1>Bienvenido, {{ userName }}</h1>
    <p>Selecciona una herramienta para comenzar</p>
  </div>

  <div class="tools-grid">
    @for (tool of tools(); track tool.name) {
      <button class="tool-card" (click)="openTool(tool)">
        <div class="tool-icon">
          <!-- Lucide icon -->
        </div>
        <h3>{{ tool.label }}</h3>
        <p>{{ tool.tool_description }}</p>
      </button>
    }
  </div>
</div>
```

**Signals**:
```typescript
portal = computed(() => this.stateService.selectedPortal());
tools = computed(() => this.portal()?.tools || []);
userName = computed(() => {
  const contact = this.stateService.userContact();
  return contact?.first_name || 'Usuario';
});
```

**Características**:
- Grid responsive de tarjetas
- Iconos lucide-angular
- Navegación a herramientas
- Ordenamiento por display_order
- Filtra herramientas habilitadas

---

## Sistema de Herramientas

### ToolRouterComponent

**Ruta**: `/portal/:portalName/tool/:toolType`
**Archivo**: `src/app/features/tools/tool-router/tool-router.component.ts`

**Propósito**: Cargar dinámicamente componentes de herramientas.

**Implementación**:
```typescript
async ngOnInit() {
  this.toolType = this.route.snapshot.paramMap.get('toolType') || '';
  await this.loadToolComponent(this.toolType);
}

private async loadToolComponent(toolType: string) {
  this.loading = true;

  try {
    let ComponentClass: Type<any> | null = null;

    switch (toolType) {
      case 'meet_scheduling':
        const meetScheduling = await import('../meet-scheduling/meet-scheduling-tool.component');
        ComponentClass = meetScheduling.MeetSchedulingToolComponent;
        break;

      // Agregar más herramientas aquí

      default:
        this.error = true;
        this.loading = false;
        this.cdr.detectChanges();
        return;
    }

    if (ComponentClass) {
      this.viewContainerRef.clear();
      this.componentRef = this.viewContainerRef.createComponent(ComponentClass);
      this.loading = false;
      this.cdr.detectChanges();
    }
  } catch (error) {
    this.error = true;
    this.loading = false;
    this.cdr.detectChanges();
  }
}
```

**Template**:
```typescript
template: `
  @if (loading) {
    <div style="padding: 20px; text-align: center;">
      <p>Cargando herramienta...</p>
    </div>
  } @else if (error) {
    <div style="padding: 20px; text-align: center;">
      <h2>Herramienta No Encontrada</h2>
      <p>La herramienta "{{ toolType }}" no está disponible.</p>
      <button (click)="goBack()">Volver</button>
    </div>
  }
`
```

**Características Importantes**:
- **Dynamic Import**: Lazy loading de componentes
- **ViewContainerRef**: Creación dinámica de componentes
- **ChangeDetectorRef**: Forzar detección de cambios
- **Error Handling**: Manejo de herramientas no encontradas
- **Cleanup**: Destruye componente en ngOnDestroy

**⚠️ Importante para agregar nuevas herramientas**:
1. Crear componente de herramienta
2. Agregar case en switch de loadToolComponent
3. Agregar import dinámico
4. Actualizar tools.routes.ts si usa routing propio

---

## Herramientas Implementadas

### MeetSchedulingToolComponent

**Tipo**: `meet_scheduling`
**Archivo**: `src/app/features/tools/meet-scheduling/meet-scheduling-tool.component.ts`

**Propósito**: Sistema completo de agendamiento de citas con calendario mensual.

**Signals principales**:
```typescript
// State
calendarResource = signal<string>('');
currentMonth = signal<Date>(new Date());
calendarDays = signal<CalendarDay[]>([]);
availabilityMap = signal<Map<string, AvailableSlot[]>>(new Map());

// UI
loading = signal<boolean>(false);
error = signal<string | null>(null);
activeTab = signal<'book' | 'appointments'>('book');
showConfirmModal = signal<boolean>(false);

// Selection
selectedDate = signal<string>('');
selectedSlot = signal<AvailableSlot | null>(null);
availableSlots = signal<AvailableSlot[]>([]);
userAppointments = signal<Appointment[]>([]);
```

**Estructura de Tabs**:
1. **Tab "Agendar Cita"**:
   - Calendario mensual con disponibilidad
   - Selector de horarios disponibles
   - Botón de confirmación

2. **Tab "Mis Citas"**:
   - Lista de citas agendadas
   - Estado de cada cita
   - Links a reuniones virtuales
   - Botón de cancelación

**Características del Calendario**:
```typescript
interface CalendarDay {
  date: Date;
  dateStr: string;        // 'YYYY-MM-DD'
  isCurrentMonth: boolean;
  isToday: boolean;
  hasAvailability: boolean;
  isPast: boolean;
}
```

- Grid de 6 semanas × 7 días
- Indicador visual de disponibilidad
- Días del mes anterior/siguiente deshabilitados
- Días pasados deshabilitados
- Botones de navegación mes anterior/siguiente

**Flujo de Agendamiento**:
1. Usuario selecciona fecha del calendario
2. Se cargan horarios disponibles del día
3. Usuario selecciona horario
4. Click en "Confirmar Cita"
5. POST a API de Frappe
6. Modal de confirmación con detalles
7. Recarga de "Mis Citas"

**Métodos principales**:
```typescript
loadCalendarMonth(monthDate: Date): void
  // Carga slots del mes completo

generateCalendarDays(monthDate: Date): void
  // Genera estructura del calendario

updateCalendarAvailability(): void
  // Actualiza días con disponibilidad

onDaySelected(day: CalendarDay): void
  // Maneja selección de día

bookAppointment(): void
  // Crea y confirma cita

loadUserAppointments(): void
  // Carga citas del usuario

cancelAppointment(appointment: Appointment): void
  // Cancela una cita existente
```

**Modal de Confirmación**:
- Muestra fecha, horario y link de reunión
- Botones: "Agendar otra cita" / "Ver mis citas"
- Animación de entrada/salida
- Click fuera para cerrar

**Estados de Citas**:
- **Draft**: Borrador
- **Confirmed**: Confirmada (puede cancelarse)
- **Cancelled**: Cancelada
- **Completed**: Completada

---

## Patrones Comunes en Componentes

### 1. Uso de Signals

```typescript
// Definir signal
protected loading = signal<boolean>(false);

// Leer valor
if (this.loading()) { }

// Actualizar valor
this.loading.set(true);

// Computed signal
protected isValid = computed(() =>
  this.email().length > 0 && this.password().length > 0
);
```

### 2. Inyección de Dependencias

```typescript
// Standalone components usan inject()
private authService = inject(AuthService);
private router = inject(Router);
private route = inject(ActivatedRoute);
```

### 3. Navegación

```typescript
// Navegación absoluta
this.router.navigate(['/portal', portalName]);

// Navegación relativa
this.router.navigate(['tool', toolType], { relativeTo: this.route });

// Con query params
this.router.navigate(['/login'], { queryParams: { returnUrl: '/portal' } });
```

### 4. Manejo de Errores

```typescript
this.service.getData().subscribe({
  next: (data) => {
    // Procesar datos
    this.loading.set(false);
  },
  error: (err) => {
    console.error('Error:', err);
    this.error.set('Mensaje de error para el usuario');
    this.loading.set(false);
  }
});
```

### 5. Cleanup

```typescript
ngOnDestroy() {
  // Limpiar subscripciones, timers, etc.
  if (this.componentRef) {
    this.componentRef.destroy();
  }
}
```

## Mejores Prácticas

1. **Signals para UI State**: Usa signals para estado local de componentes
2. **Services para Business Logic**: Mantén lógica compleja en servicios
3. **Computed para Derived State**: Usa computed() en lugar de recalcular manualmente
4. **Standalone Components**: Todos los componentes son standalone
5. **Change Detection**: Usa `detectChanges()` cuando sea necesario
6. **Error Handling**: Siempre maneja errores de observables
7. **Loading States**: Muestra feedback visual durante operaciones asíncronas
8. **Accessibility**: Usa semantic HTML y ARIA labels
