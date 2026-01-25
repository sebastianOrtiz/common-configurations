# 🎨 Frontend Integration - Service Portal + Meet Scheduling

**Última actualización**: 2026-01-25

---

## 📋 Overview

Este documento explica cómo el **Service Portal** (Angular) se integra con **Meet Scheduling** (Backend Frappe) para crear un portal de agendamiento de citas completo.

---

## 🏗️ Arquitectura de Integración

```
┌─────────────────────────────────────────────────────────────┐
│                     SERVICE PORTAL (Angular)                 │
│                                                              │
│  ┌───────────────────────┐      ┌─────────────────────────┐│
│  │  Portal Configuration │      │   Tool: Meet Scheduling ││
│  │  (Service Portal)     │─────▶│   (Service Portal Tool) ││
│  │                       │      │                         ││
│  │  - Title              │      │  - tool_type            ││
│  │  - Logo               │      │  - calendar_resource    ││
│  │  - Colors             │      │  - label                ││
│  │  - Registration Form  │      │  - icon                 ││
│  └───────────────────────┘      └─────────────────────────┘│
│                                           │                  │
│                                           ▼                  │
│                              ┌──────────────────────────┐   │
│                              │ Meet Scheduling Widget   │   │
│                              │ (Angular Component)      │   │
│                              │                          │   │
│                              │ - Calendar Picker        │   │
│                              │ - Available Slots        │   │
│                              │ - Appointment Form       │   │
│                              └──────────────────────────┘   │
└──────────────────────────────────────┬───────────────────────┘
                                       │
                                       │ Frappe REST API
                                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   FRAPPE BACKEND (Python)                    │
│                                                              │
│  ┌──────────────────────────┐    ┌──────────────────────┐  │
│  │  Common Configurations   │    │   Meet Scheduling    │  │
│  │                          │    │                      │  │
│  │  - Service Portal        │    │  API Endpoints:      │  │
│  │  - Tool Type             │    │  ├─ get_available_   │  │
│  │  - User Contact          │    │  │   slots()         │  │
│  │                          │    │  ├─ validate_        │  │
│  │                          │    │  │   appointment()   │  │
│  │                          │    │  └─ create_          │  │
│  │                          │    │     appointment()    │  │
│  └──────────────────────────┘    └──────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔌 Integración Paso a Paso

### 1. Configuración en Backend (Frappe)

#### A. Crear Tool Type (Fixture)

**Archivo**: `meet_scheduling/fixtures/tool_type.json`

```json
[
  {
    "doctype": "Tool Type",
    "tool_name": "meet_scheduling",
    "tool_label": "Agendamiento de Citas",
    "app_name": "meet_scheduling",
    "icon": "calendar",
    "description": "Agenda citas con calendario y videollamadas",
    "is_active": 1
  }
]
```

#### B. Agregar Custom Fields a Service Portal Tool

**Archivo**: `meet_scheduling/fixtures/custom_field.json`

```json
[
  {
    "doctype": "Custom Field",
    "dt": "Service Portal Tool",
    "fieldname": "calendar_resource",
    "fieldtype": "Link",
    "options": "Calendar Resource",
    "label": "Calendar Resource",
    "insert_after": "tool_type",
    "depends_on": "eval:doc.tool_type=='meet_scheduling'",
    "description": "Recurso de calendario para agendamiento"
  },
  {
    "doctype": "Custom Field",
    "dt": "Service Portal Tool",
    "fieldname": "show_calendar_view",
    "fieldtype": "Check",
    "label": "Show Calendar View",
    "default": "1",
    "insert_after": "calendar_resource",
    "depends_on": "eval:doc.tool_type=='meet_scheduling'",
    "description": "Mostrar vista de calendario"
  },
  {
    "doctype": "Custom Field",
    "dt": "Service Portal Tool",
    "fieldname": "slot_duration_minutes",
    "fieldtype": "Int",
    "label": "Slot Duration (Minutes)",
    "default": "30",
    "insert_after": "show_calendar_view",
    "depends_on": "eval:doc.tool_type=='meet_scheduling'",
    "description": "Duración de cada slot en minutos"
  }
]
```

#### C. Registrar en hooks.py

**Archivo**: `meet_scheduling/hooks.py`

```python
# Fixtures
fixtures = [
    {
        "doctype": "Tool Type",
        "filters": [["app_name", "=", "meet_scheduling"]]
    },
    {
        "doctype": "Custom Field",
        "filters": [
            ["dt", "=", "Service Portal Tool"],
            ["fieldname", "in", ["calendar_resource", "show_calendar_view", "slot_duration_minutes"]]
        ]
    }
]
```

---

### 2. Configuración en Frappe UI

#### A. Crear Service Portal

1. Ir a: **Service Portal List** → **New**
2. Configurar:
   - **Portal Name**: `clinica_salud`
   - **Title**: `Clínica Salud - Portal de Citas`
   - **Request Contact User Data**: ✅ (checkbox)
   - **Registration Title**: `Ingresa tus datos`
   - **Primary Color**: `#2E86AB`
   - **Logo**: (Subir imagen)

#### B. Agregar Tool de Meet Scheduling

En el mismo Service Portal, sección "Tools":

1. Agregar fila:
   - **Tool Type**: `meet_scheduling`
   - **Label**: `Agendar cita médica` (auto-llenado)
   - **Icon**: `calendar` (auto-llenado)
   - **Calendar Resource**: `Dr. García` (seleccionar)
   - **Show Calendar View**: ✅
   - **Slot Duration**: `30`
   - **Button Color**: `#4CAF50`
   - **Display Order**: `1`
   - **Is Enabled**: ✅

2. Guardar Service Portal

---

### 3. Frontend Angular - Estructura

```
front_apps/service-portal/src/
├── app/
│   ├── core/                           # Servicios core
│   │   ├── services/
│   │   │   ├── frappe-api.service.ts  # Cliente HTTP para Frappe API
│   │   │   ├── portal.service.ts      # Servicio para Service Portal
│   │   │   └── auth.service.ts        # Autenticación (opcional)
│   │   └── models/
│   │       ├── service-portal.model.ts
│   │       ├── tool.model.ts
│   │       └── user-contact.model.ts
│   │
│   ├── features/
│   │   ├── portal/                     # Feature: Portal principal
│   │   │   ├── portal.component.ts
│   │   │   ├── portal.component.html
│   │   │   └── portal.component.scss
│   │   │
│   │   ├── registration/               # Feature: Formulario de registro
│   │   │   ├── registration.component.ts
│   │   │   ├── registration.component.html
│   │   │   └── registration.component.scss
│   │   │
│   │   └── tools/                      # Feature: Herramientas
│   │       ├── tool-grid/
│   │       │   ├── tool-grid.component.ts
│   │       │   ├── tool-grid.component.html
│   │       │   └── tool-grid.component.scss
│   │       │
│   │       └── meet-scheduling/        # Tool específico
│   │           ├── meet-scheduling.component.ts
│   │           ├── meet-scheduling.component.html
│   │           ├── meet-scheduling.component.scss
│   │           │
│   │           ├── calendar-picker/
│   │           │   ├── calendar-picker.component.ts
│   │           │   ├── calendar-picker.component.html
│   │           │   └── calendar-picker.component.scss
│   │           │
│   │           ├── slot-selector/
│   │           │   ├── slot-selector.component.ts
│   │           │   ├── slot-selector.component.html
│   │           │   └── slot-selector.component.scss
│   │           │
│   │           └── appointment-form/
│   │               ├── appointment-form.component.ts
│   │               ├── appointment-form.component.html
│   │               └── appointment-form.component.scss
│   │
│   ├── shared/                         # Componentes compartidos
│   │   ├── components/
│   │   │   ├── loading-spinner/
│   │   │   └── error-message/
│   │   └── pipes/
│   │       └── format-date.pipe.ts
│   │
│   ├── app.routes.ts
│   ├── app.config.ts
│   └── app.ts
│
├── environments/
│   ├── environment.ts
│   └── environment.prod.ts
│
└── styles.scss
```

---

## 🔗 API Integration

### 1. Frappe API Service

**Archivo**: `src/app/core/services/frappe-api.service.ts`

```typescript
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class FrappeApiService {
  private baseUrl = '/api'; // Frappe API base URL

  constructor(private http: HttpClient) {}

  // GET /api/resource/{doctype}/{name}
  getDoc(doctype: string, name: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/resource/${doctype}/${name}`);
  }

  // GET /api/resource/{doctype}
  getList(doctype: string, filters?: any, fields?: string[]): Observable<any> {
    const params: any = {};
    if (filters) params.filters = JSON.stringify(filters);
    if (fields) params.fields = JSON.stringify(fields);

    return this.http.get(`${this.baseUrl}/resource/${doctype}`, { params });
  }

  // POST /api/resource/{doctype}
  createDoc(doctype: string, data: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/resource/${doctype}`, data);
  }

  // PUT /api/resource/{doctype}/{name}
  updateDoc(doctype: string, name: string, data: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/resource/${doctype}/${name}`, data);
  }

  // DELETE /api/resource/{doctype}/{name}
  deleteDoc(doctype: string, name: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/resource/${doctype}/${name}`);
  }

  // POST /api/method/{method_path}
  callMethod(methodPath: string, args?: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/method/${methodPath}`, args);
  }
}
```

---

### 2. Portal Service

**Archivo**: `src/app/core/services/portal.service.ts`

```typescript
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { FrappeApiService } from './frappe-api.service';
import { ServicePortal } from '../models/service-portal.model';

@Injectable({
  providedIn: 'root'
})
export class PortalService {
  constructor(private frappeApi: FrappeApiService) {}

  // Obtener configuración del portal
  getPortal(portalName: string): Observable<ServicePortal> {
    return this.frappeApi.getDoc('Service Portal', portalName).pipe(
      map(response => response.data)
    );
  }

  // Crear User Contact
  createUserContact(data: any): Observable<any> {
    return this.frappeApi.createDoc('User Contact', data);
  }

  // Meet Scheduling API - Obtener slots disponibles
  getAvailableSlots(calendarResource: string, fromDate: string, toDate: string): Observable<any> {
    return this.frappeApi.callMethod('meet_scheduling.api.appointment_api.get_available_slots', {
      calendar_resource: calendarResource,
      from_date: fromDate,
      to_date: toDate
    });
  }

  // Meet Scheduling API - Validar appointment
  validateAppointment(data: any): Observable<any> {
    return this.frappeApi.callMethod('meet_scheduling.api.appointment_api.validate_appointment', data);
  }

  // Meet Scheduling API - Crear appointment
  createAppointment(data: any): Observable<any> {
    return this.frappeApi.createDoc('Appointment', data);
  }
}
```

---

### 3. Modelos TypeScript

**Archivo**: `src/app/core/models/service-portal.model.ts`

```typescript
export interface ServicePortal {
  name: string;
  portal_name: string;
  title: string;
  description?: string;
  is_active: boolean;

  // Registro
  request_contact_user_data: boolean;
  registration_title?: string;
  registration_description?: string;

  // Estilos
  primary_color?: string;
  secondary_color?: string;
  logo?: string;
  background_image?: string;
  custom_css?: string;

  // Herramientas
  tools: ServicePortalTool[];
}

export interface ServicePortalTool {
  tool_type: string;
  label: string;
  tool_description?: string;
  icon?: string;
  button_color?: string;
  display_order: number;
  is_enabled: boolean;

  // Custom fields de meet_scheduling
  calendar_resource?: string;
  show_calendar_view?: boolean;
  slot_duration_minutes?: number;
}
```

**Archivo**: `src/app/core/models/appointment.model.ts`

```typescript
export interface Appointment {
  name?: string;
  calendar_resource: string;
  user_contact?: string;
  start_datetime: string;
  end_datetime: string;
  status: 'Draft' | 'Confirmed' | 'Cancelled' | 'No-show' | 'Completed';

  // Video call
  video_call_profile?: string;
  call_link_mode?: 'inherit' | 'manual' | 'auto';
  manual_meeting_url?: string;
  meeting_url?: string;

  // Opcional
  party_type?: string;
  party?: string;
  service?: string;
  notes?: string;
  source?: 'Web' | 'Admin' | 'API';
}

export interface AvailableSlot {
  start: string;
  end: string;
  capacity_remaining: number;
  is_available: boolean;
}
```

---

## 🎨 Componentes Angular

### 1. Portal Component (Punto de entrada)

**Archivo**: `src/app/features/portal/portal.component.ts`

```typescript
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PortalService } from '../../core/services/portal.service';
import { ServicePortal } from '../../core/models/service-portal.model';

@Component({
  selector: 'app-portal',
  templateUrl: './portal.component.html',
  styleUrls: ['./portal.component.scss']
})
export class PortalComponent implements OnInit {
  portal?: ServicePortal;
  loading = true;
  userContactCreated = false;
  userContactId?: string;

  constructor(
    private route: ActivatedRoute,
    private portalService: PortalService
  ) {}

  ngOnInit(): void {
    // Obtener portal_name de URL o parámetro
    const portalName = this.route.snapshot.paramMap.get('portalName') || 'default_portal';

    this.portalService.getPortal(portalName).subscribe({
      next: (portal) => {
        this.portal = portal;
        this.applyCustomStyles(portal);
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading portal:', err);
        this.loading = false;
      }
    });
  }

  applyCustomStyles(portal: ServicePortal): void {
    if (portal.primary_color) {
      document.documentElement.style.setProperty('--primary-color', portal.primary_color);
    }
    if (portal.secondary_color) {
      document.documentElement.style.setProperty('--secondary-color', portal.secondary_color);
    }
    if (portal.custom_css) {
      const styleElement = document.createElement('style');
      styleElement.innerHTML = portal.custom_css;
      document.head.appendChild(styleElement);
    }
  }

  onUserContactCreated(userContactId: string): void {
    this.userContactId = userContactId;
    this.userContactCreated = true;
  }
}
```

**Archivo**: `src/app/features/portal/portal.component.html`

```html
<div class="portal-container" *ngIf="portal">
  <!-- Header -->
  <header class="portal-header">
    <img *ngIf="portal.logo" [src]="portal.logo" alt="Logo" class="portal-logo">
    <h1>{{ portal.title }}</h1>
    <p *ngIf="portal.description">{{ portal.description }}</p>
  </header>

  <!-- Formulario de registro (si está configurado) -->
  <app-registration
    *ngIf="portal.request_contact_user_data && !userContactCreated"
    [portal]="portal"
    (contactCreated)="onUserContactCreated($event)"
  ></app-registration>

  <!-- Herramientas (botones) -->
  <app-tool-grid
    *ngIf="!portal.request_contact_user_data || userContactCreated"
    [tools]="portal.tools"
    [userContactId]="userContactId"
  ></app-tool-grid>
</div>

<div *ngIf="loading" class="loading-spinner">
  Cargando portal...
</div>
```

---

### 2. Tool Grid Component (Muestra botones)

**Archivo**: `src/app/features/tools/tool-grid/tool-grid.component.ts`

```typescript
import { Component, Input } from '@angular/core';
import { ServicePortalTool } from '../../../core/models/service-portal.model';

@Component({
  selector: 'app-tool-grid',
  templateUrl: './tool-grid.component.html',
  styleUrls: ['./tool-grid.component.scss']
})
export class ToolGridComponent {
  @Input() tools: ServicePortalTool[] = [];
  @Input() userContactId?: string;

  selectedTool?: ServicePortalTool;

  selectTool(tool: ServicePortalTool): void {
    this.selectedTool = tool;
  }

  closeTool(): void {
    this.selectedTool = undefined;
  }

  getEnabledTools(): ServicePortalTool[] {
    return this.tools
      .filter(tool => tool.is_enabled)
      .sort((a, b) => a.display_order - b.display_order);
  }
}
```

**Archivo**: `src/app/features/tools/tool-grid/tool-grid.component.html`

```html
<div class="tool-grid">
  <button
    *ngFor="let tool of getEnabledTools()"
    class="tool-button"
    [style.background-color]="tool.button_color"
    (click)="selectTool(tool)"
  >
    <i class="icon" [ngClass]="'icon-' + tool.icon"></i>
    <span>{{ tool.label }}</span>
    <p *ngIf="tool.tool_description">{{ tool.tool_description }}</p>
  </button>
</div>

<!-- Modal para tool seleccionada -->
<div *ngIf="selectedTool" class="tool-modal">
  <div class="modal-content">
    <button class="close-btn" (click)="closeTool()">×</button>

    <!-- Meet Scheduling Tool -->
    <app-meet-scheduling
      *ngIf="selectedTool.tool_type === 'meet_scheduling'"
      [tool]="selectedTool"
      [userContactId]="userContactId"
      (appointmentCreated)="closeTool()"
    ></app-meet-scheduling>

    <!-- Otros tools aquí... -->
  </div>
</div>
```

---

### 3. Meet Scheduling Component (Widget principal)

**Archivo**: `src/app/features/tools/meet-scheduling/meet-scheduling.component.ts`

```typescript
import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { ServicePortalTool } from '../../../core/models/service-portal.model';
import { PortalService } from '../../../core/services/portal.service';
import { AvailableSlot, Appointment } from '../../../core/models/appointment.model';

@Component({
  selector: 'app-meet-scheduling',
  templateUrl: './meet-scheduling.component.html',
  styleUrls: ['./meet-scheduling.component.scss']
})
export class MeetSchedulingComponent implements OnInit {
  @Input() tool!: ServicePortalTool;
  @Input() userContactId?: string;
  @Output() appointmentCreated = new EventEmitter<void>();

  // Estados
  currentStep: 'calendar' | 'slot' | 'form' | 'confirmation' = 'calendar';

  // Datos
  selectedDate?: Date;
  availableSlots: AvailableSlot[] = [];
  selectedSlot?: AvailableSlot;
  appointmentData: Partial<Appointment> = {};

  loading = false;
  error?: string;

  constructor(private portalService: PortalService) {}

  ngOnInit(): void {
    this.appointmentData.calendar_resource = this.tool.calendar_resource;
    this.appointmentData.user_contact = this.userContactId;
    this.appointmentData.source = 'Web';
  }

  // Cuando se selecciona una fecha en el calendario
  onDateSelected(date: Date): void {
    this.selectedDate = date;
    this.loadAvailableSlots(date);
  }

  // Cargar slots disponibles para la fecha
  loadAvailableSlots(date: Date): void {
    if (!this.tool.calendar_resource) {
      this.error = 'No hay calendario configurado';
      return;
    }

    this.loading = true;
    this.error = undefined;

    const fromDate = this.formatDate(date);
    const toDate = fromDate; // Mismo día

    this.portalService.getAvailableSlots(
      this.tool.calendar_resource,
      fromDate,
      toDate
    ).subscribe({
      next: (response) => {
        this.availableSlots = response.message || [];
        this.currentStep = 'slot';
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading slots:', err);
        this.error = 'Error al cargar horarios disponibles';
        this.loading = false;
      }
    });
  }

  // Cuando se selecciona un slot
  onSlotSelected(slot: AvailableSlot): void {
    this.selectedSlot = slot;
    this.appointmentData.start_datetime = slot.start;
    this.appointmentData.end_datetime = slot.end;
    this.currentStep = 'form';
  }

  // Crear appointment
  createAppointment(formData: any): void {
    const appointmentData = {
      ...this.appointmentData,
      ...formData
    };

    this.loading = true;
    this.error = undefined;

    this.portalService.createAppointment(appointmentData).subscribe({
      next: (response) => {
        this.currentStep = 'confirmation';
        this.loading = false;
        setTimeout(() => {
          this.appointmentCreated.emit();
        }, 3000);
      },
      error: (err) => {
        console.error('Error creating appointment:', err);
        this.error = err.error?.message || 'Error al crear la cita';
        this.loading = false;
      }
    });
  }

  // Helpers
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  }
}
```

**Archivo**: `src/app/features/tools/meet-scheduling/meet-scheduling.component.html`

```html
<div class="meet-scheduling">
  <h2>{{ tool.label }}</h2>

  <!-- Paso 1: Seleccionar fecha -->
  <app-calendar-picker
    *ngIf="currentStep === 'calendar'"
    (dateSelected)="onDateSelected($event)"
  ></app-calendar-picker>

  <!-- Paso 2: Seleccionar slot -->
  <app-slot-selector
    *ngIf="currentStep === 'slot'"
    [slots]="availableSlots"
    [selectedDate]="selectedDate"
    (slotSelected)="onSlotSelected($event)"
    (back)="currentStep = 'calendar'"
  ></app-slot-selector>

  <!-- Paso 3: Formulario -->
  <app-appointment-form
    *ngIf="currentStep === 'form'"
    [appointmentData]="appointmentData"
    (submit)="createAppointment($event)"
    (back)="currentStep = 'slot'"
  ></app-appointment-form>

  <!-- Paso 4: Confirmación -->
  <div *ngIf="currentStep === 'confirmation'" class="confirmation">
    <h3>✅ Cita agendada exitosamente</h3>
    <p>Tu cita ha sido confirmada para:</p>
    <p><strong>{{ selectedSlot?.start | date:'short' }}</strong></p>
  </div>

  <!-- Loading -->
  <div *ngIf="loading" class="loading">Cargando...</div>

  <!-- Error -->
  <div *ngIf="error" class="error">{{ error }}</div>
</div>
```

---

## 🚀 Build y Deploy

### 1. Build del Frontend

```bash
cd /workspace/development/frappe-bench/apps/common_configurations/front_apps/service-portal

# Development
npm run build:dev

# Production
npm run build
```

**Output**:
- Archivos compilados → `common_configurations/public/service-portal/browser/`
- HTML entry point → `common_configurations/www/service-portal.html`

### 2. Acceso al Portal

**URL**: `http://[tu-sitio]/service-portal?portal=clinica_salud`

**Parámetros**:
- `portal`: Nombre del Service Portal (portal_name)

---

## 📋 Checklist de Implementación

### Backend (Frappe)
- [x] Tool Type fixture creado
- [x] Custom Fields creados
- [x] Hooks configurados
- [x] API endpoints funcionales
- [ ] Service Portal creado en UI
- [ ] Calendar Resource configurado
- [ ] Availability Plan creado

### Frontend (Angular)
- [ ] Estructura de componentes creada
- [ ] Servicios de API implementados
- [ ] Portal Component implementado
- [ ] Tool Grid Component implementado
- [ ] Meet Scheduling Component implementado
- [ ] Calendar Picker implementado
- [ ] Slot Selector implementado
- [ ] Appointment Form implementado
- [ ] Estilos y responsive design
- [ ] Testing
- [ ] Build y deploy

---

## 🔗 Referencias

- [Frappe API Reference](https://frappeframework.com/docs/user/en/api)
- [Angular Documentation](https://angular.dev)
- [Service Portal Documentation](../docs/SERVICE_PORTAL.md)
- [Meet Scheduling Project Status](../../meet_scheduling/PROJECT_STATUS.md)

---

**Última actualización**: 2026-01-25
