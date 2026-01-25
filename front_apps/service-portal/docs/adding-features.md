# Guía para Agregar Nuevas Funcionalidades

Esta guía te ayudará a extender el Service Portal con nuevas funcionalidades de manera organizada y consistente.

---

## Tabla de Contenidos

1. [Agregar Nueva Herramienta](#agregar-nueva-herramienta)
2. [Agregar Nuevo Servicio](#agregar-nuevo-servicio)
3. [Agregar Nuevo Componente](#agregar-nuevo-componente)
4. [Modificar Estilos Globales](#modificar-estilos-globales)
5. [Agregar Nueva Ruta](#agregar-nueva-ruta)
6. [Integrar con API de Frappe](#integrar-con-api-de-frappe)

---

## Agregar Nueva Herramienta

### Escenario

Quieres agregar una herramienta de "Tickets de Soporte" que permita a los usuarios ver y crear tickets.

### Paso 1: Planificación

Define:
- **Nombre del tool_type**: `support_tickets`
- **Funcionalidades**: Ver tickets, crear ticket, comentar
- **Configuración requerida**: ¿Qué categorías de tickets están disponibles?
- **Permisos**: ¿Todos los usuarios pueden ver/crear?

### Paso 2: Crear DocTypes en Frappe

```python
# 1. Crear Tool Type
frappe.get_doc({
    "doctype": "Tool Type",
    "tool_type_id": "support_tickets",
    "tool_label": "Tickets de Soporte",
    "description": "Sistema de tickets de soporte técnico",
    "icon": "MessageSquare"
}).insert()

# 2. Agregar campos de configuración a Service Portal Tool
# (si no existen ya)
frappe.get_doc("DocType", "Service Portal Tool").get({
    "fields": {
        "ticket_type": {
            "fieldtype": "Link",
            "options": "Ticket Type",
            "label": "Default Ticket Type",
            "depends_on": "eval:doc.tool_type=='support_tickets'"
        }
    }
})
```

### Paso 3: Crear Modelos TypeScript

```bash
cd src/app/core/models
touch ticket.model.ts
```

```typescript
// ticket.model.ts
export interface Ticket {
  name: string;
  subject: string;
  description: string;
  status: 'Open' | 'In Progress' | 'Resolved' | 'Closed';
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  created_by: string;
  assigned_to?: string;
  created_date: string;
  modified: string;
  comments: TicketComment[];
}

export interface TicketComment {
  name: string;
  comment: string;
  created_by: string;
  creation: string;
}

export interface CreateTicketRequest {
  subject: string;
  description: string;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  ticket_type?: string;
}
```

### Paso 4: Crear Servicio

```bash
cd src/app/core/services
touch ticket.service.ts
```

```typescript
// ticket.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Ticket, CreateTicketRequest } from '../models/ticket.model';

@Injectable({
  providedIn: 'root'
})
export class TicketService {
  private http = inject(HttpClient);

  getUserTickets(userEmail: string): Observable<Ticket[]> {
    return this.http.get<Ticket[]>(
      `/api/resource/Ticket?filters=[["created_by","=","${userEmail}"]]`
    );
  }

  getTicket(ticketId: string): Observable<Ticket> {
    return this.http.get<Ticket>(`/api/resource/Ticket/${ticketId}`);
  }

  createTicket(ticket: CreateTicketRequest): Observable<Ticket> {
    return this.http.post<Ticket>('/api/resource/Ticket', {
      doctype: 'Ticket',
      ...ticket
    });
  }

  addComment(ticketId: string, comment: string): Observable<void> {
    return this.http.post<void>(
      `/api/method/frappe.desk.form.utils.add_comment`,
      {
        reference_doctype: 'Ticket',
        reference_name: ticketId,
        content: comment,
        comment_type: 'Comment'
      }
    );
  }

  closeTicket(ticketId: string): Observable<Ticket> {
    return this.http.put<Ticket>(`/api/resource/Ticket/${ticketId}`, {
      status: 'Closed'
    });
  }
}
```

### Paso 5: Crear Componente de Herramienta

```bash
cd src/app/features/tools
ng generate component support-tickets --standalone
```

```typescript
// support-tickets-tool.component.ts
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { StateService } from '../../../core/services/state.service';
import { TicketService } from '../../../core/services/ticket.service';
import { Ticket, CreateTicketRequest } from '../../../core/models/ticket.model';

@Component({
  selector: 'app-support-tickets-tool',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './support-tickets-tool.component.html',
  styleUrls: ['./support-tickets-tool.component.scss']
})
export class SupportTicketsToolComponent implements OnInit {
  private stateService = inject(StateService);
  private ticketService = inject(TicketService);
  private router = inject(Router);

  // State
  protected tickets = signal<Ticket[]>([]);
  protected loading = signal<boolean>(false);
  protected error = signal<string | null>(null);
  protected activeTab = signal<'list' | 'create'>('list');

  // Form
  protected newTicket = signal<CreateTicketRequest>({
    subject: '',
    description: '',
    priority: 'Medium'
  });

  // Computed
  protected selectedPortal = this.stateService.selectedPortal;
  protected currentUser = this.stateService.currentUser;
  protected openTickets = computed(() =>
    this.tickets().filter(t => t.status !== 'Closed')
  );

  ngOnInit() {
    this.loadTickets();
  }

  private loadTickets(): void {
    const user = this.currentUser();
    if (!user?.email) return;

    this.loading.set(true);
    this.ticketService.getUserTickets(user.email).subscribe({
      next: (tickets) => {
        this.tickets.set(tickets);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading tickets:', err);
        this.error.set('Error al cargar tickets');
        this.loading.set(false);
      }
    });
  }

  createTicket(): void {
    const ticket = this.newTicket();
    if (!ticket.subject || !ticket.description) {
      this.error.set('Por favor completa todos los campos');
      return;
    }

    this.loading.set(true);
    this.ticketService.createTicket(ticket).subscribe({
      next: () => {
        this.activeTab.set('list');
        this.newTicket.set({
          subject: '',
          description: '',
          priority: 'Medium'
        });
        this.loadTickets();
      },
      error: (err) => {
        console.error('Error creating ticket:', err);
        this.error.set('Error al crear ticket');
        this.loading.set(false);
      }
    });
  }

  goBack(): void {
    const portal = this.selectedPortal();
    if (portal) {
      this.router.navigate(['/portal', portal.name]);
    }
  }
}
```

### Paso 6: Crear Template

```html
<!-- support-tickets-tool.component.html -->
<div class="tool-container">
  <div class="tool-header">
    <button class="btn-back" (click)="goBack()">
      <svg>...</svg>
      Volver
    </button>
    <h1>Tickets de Soporte</h1>
  </div>

  <div class="tabs">
    <button
      [class.active]="activeTab() === 'list'"
      (click)="activeTab.set('list')"
    >
      Mis Tickets
    </button>
    <button
      [class.active]="activeTab() === 'create'"
      (click)="activeTab.set('create')"
    >
      Crear Ticket
    </button>
  </div>

  @if (activeTab() === 'list') {
    <div class="tickets-list">
      @for (ticket of tickets(); track ticket.name) {
        <div class="ticket-card">
          <h3>{{ ticket.subject }}</h3>
          <p>{{ ticket.description }}</p>
          <span class="status">{{ ticket.status }}</span>
        </div>
      } @empty {
        <p>No tienes tickets</p>
      }
    </div>
  }

  @if (activeTab() === 'create') {
    <div class="create-ticket-form">
      <input
        [(ngModel)]="newTicket().subject"
        placeholder="Asunto"
      />
      <textarea
        [(ngModel)]="newTicket().description"
        placeholder="Descripción"
      ></textarea>
      <select [(ngModel)]="newTicket().priority">
        <option value="Low">Baja</option>
        <option value="Medium">Media</option>
        <option value="High">Alta</option>
        <option value="Urgent">Urgente</option>
      </select>
      <button (click)="createTicket()">Crear Ticket</button>
    </div>
  }
</div>
```

### Paso 7: Registrar en Tool Router

Editar `tool-router.component.ts`:

```typescript
switch (toolType) {
  case 'support_tickets':
    const supportTickets = await import('../support-tickets/support-tickets-tool.component');
    ComponentClass = supportTickets.SupportTicketsToolComponent;
    break;
  // ... otros cases
}
```

### Paso 8: Configurar en Frappe

1. Ir a Service Portal
2. Agregar herramienta en tabla Tools
3. Tool Type: support_tickets
4. Configurar label, icono, etc.
5. Guardar

### Paso 9: Build y Prueba

```bash
npm run build
```

---

## Agregar Nuevo Servicio

### Escenario

Necesitas un servicio para gestionar notificaciones del usuario.

### Paso 1: Crear el Servicio

```bash
cd src/app/core/services
touch notification.service.ts
```

```typescript
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, interval } from 'rxjs';

export interface Notification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  created: string;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private http = inject(HttpClient);

  // Estado reactivo
  notifications = signal<Notification[]>([]);
  unreadCount = signal<number>(0);

  getNotifications(): Observable<Notification[]> {
    return this.http.get<Notification[]>('/api/resource/Notification');
  }

  markAsRead(notificationId: string): Observable<void> {
    return this.http.put<void>(
      `/api/resource/Notification/${notificationId}`,
      { read: true }
    );
  }

  // Polling de notificaciones cada 30 segundos
  startPolling(): void {
    interval(30000).subscribe(() => {
      this.refreshNotifications();
    });
  }

  refreshNotifications(): void {
    this.getNotifications().subscribe({
      next: (notifications) => {
        this.notifications.set(notifications);
        this.unreadCount.set(
          notifications.filter(n => !n.read).length
        );
      }
    });
  }
}
```

### Paso 2: Usar en Componente

```typescript
export class MyComponent {
  private notificationService = inject(NotificationService);

  notifications = this.notificationService.notifications;
  unreadCount = this.notificationService.unreadCount;

  ngOnInit() {
    this.notificationService.refreshNotifications();
    this.notificationService.startPolling();
  }
}
```

---

## Agregar Nuevo Componente

### Escenario

Necesitas un componente reutilizable de "Card" para mostrar información.

### Paso 1: Crear Componente

```bash
cd src/app/shared/components
ng generate component card --standalone
```

### Paso 2: Implementar

```typescript
// card.component.ts
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card" [class]="variant">
      @if (title) {
        <div class="card-header">
          <h3>{{ title }}</h3>
        </div>
      }
      <div class="card-body">
        <ng-content></ng-content>
      </div>
      @if (footer) {
        <div class="card-footer">
          <ng-content select="[footer]"></ng-content>
        </div>
      }
    </div>
  `,
  styleUrls: ['./card.component.scss']
})
export class CardComponent {
  @Input() title?: string;
  @Input() variant: 'default' | 'outlined' | 'elevated' = 'default';
  @Input() footer = false;
}
```

### Paso 3: Usar en Otros Componentes

```typescript
import { CardComponent } from '../../shared/components/card/card.component';

@Component({
  imports: [CommonModule, CardComponent]
})
export class MyComponent {
  // ...
}
```

```html
<app-card title="Mi Tarjeta" variant="elevated">
  <p>Contenido de la tarjeta</p>

  <div footer>
    <button>Acción</button>
  </div>
</app-card>
```

---

## Modificar Estilos Globales

### Escenario

Quieres agregar una nueva variable CSS y utilidades para spacing.

### Paso 1: Editar styles.scss

```scss
// styles.scss
:root {
  // ... variables existentes

  // Nuevas variables
  --spacing-3xl: 4rem;
  --spacing-4xl: 6rem;
}

// Nuevas utilidades
.mt-xl { margin-top: var(--spacing-xl); }
.mb-xl { margin-bottom: var(--spacing-xl); }
.px-lg { padding-left: var(--spacing-lg); padding-right: var(--spacing-lg); }
.py-lg { padding-top: var(--spacing-lg); padding-bottom: var(--spacing-lg); }
```

### Paso 2: Usar en Templates

```html
<div class="mt-xl px-lg">
  Contenido con spacing
</div>
```

---

## Agregar Nueva Ruta

### Escenario

Quieres agregar una página de "Ayuda" accesible globalmente.

### Paso 1: Crear Componente

```bash
ng generate component features/help --standalone
```

### Paso 2: Agregar Ruta

```typescript
// app.routes.ts
export const routes: Routes = [
  // ... rutas existentes
  {
    path: 'help',
    component: HelpComponent,
    canActivate: [authGuard]  // Si requiere autenticación
  }
];
```

### Paso 3: Agregar Link en Navigation

```html
<!-- En algún componente de navegación -->
<a routerLink="/help">Ayuda</a>
```

---

## Integrar con API de Frappe

### Escenario

Necesitas integrar con un método whitelisted de Frappe.

### Paso 1: Crear Método en Frappe

```python
# common_configurations/api/my_custom_api.py
import frappe

@frappe.whitelist()
def get_custom_data(user_email):
    """Obtiene datos personalizados para un usuario"""
    return frappe.db.get_all(
        "Custom DocType",
        filters={"user": user_email},
        fields=["name", "field1", "field2"]
    )

@frappe.whitelist()
def create_custom_record(data):
    """Crea un registro personalizado"""
    doc = frappe.get_doc({
        "doctype": "Custom DocType",
        "field1": data.get("field1"),
        "field2": data.get("field2")
    })
    doc.insert()
    return doc.as_dict()
```

### Paso 2: Registrar en hooks.py

```python
# hooks.py
doc_events = {
    # ... eventos existentes
}

# Exponer métodos
api_methods = {
    "common_configurations.api.my_custom_api.get_custom_data": {
        "allow_guest": False
    }
}
```

### Paso 3: Crear Servicio Angular

```typescript
// custom.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CustomService {
  private http = inject(HttpClient);

  getCustomData(userEmail: string): Observable<any[]> {
    return this.http.post<any[]>(
      '/api/method/common_configurations.api.my_custom_api.get_custom_data',
      { user_email: userEmail }
    );
  }

  createCustomRecord(data: any): Observable<any> {
    return this.http.post<any>(
      '/api/method/common_configurations.api.my_custom_api.create_custom_record',
      { data }
    );
  }
}
```

### Paso 4: Usar en Componente

```typescript
export class MyComponent implements OnInit {
  private customService = inject(CustomService);
  private currentUser = inject(StateService).currentUser;

  data = signal<any[]>([]);

  ngOnInit() {
    const user = this.currentUser();
    if (user?.email) {
      this.customService.getCustomData(user.email).subscribe({
        next: (data) => this.data.set(data),
        error: (err) => console.error(err)
      });
    }
  }

  createRecord() {
    this.customService.createCustomRecord({
      field1: 'value1',
      field2: 'value2'
    }).subscribe({
      next: (record) => console.log('Created:', record),
      error: (err) => console.error(err)
    });
  }
}
```

---

## Checklist de Desarrollo

Usa este checklist al agregar nuevas funcionalidades:

### Pre-desarrollo
- [ ] Definir claramente los requisitos
- [ ] Identificar DocTypes/APIs de Frappe necesarios
- [ ] Diseñar la UI/UX
- [ ] Planear estructura de componentes

### Durante Desarrollo
- [ ] Crear/actualizar modelos TypeScript
- [ ] Implementar servicio si es necesario
- [ ] Crear componentes standalone
- [ ] Implementar lógica de negocio
- [ ] Agregar estilos SCSS
- [ ] Manejar estados de loading y error
- [ ] Implementar navegación

### Testing
- [ ] Probar funcionalidad básica
- [ ] Probar casos edge
- [ ] Probar en mobile
- [ ] Verificar performance
- [ ] Verificar accesibilidad

### Deployment
- [ ] Build sin errores
- [ ] Actualizar documentación
- [ ] Commit con mensaje descriptivo
- [ ] Push a repositorio
- [ ] Verificar en producción

---

## Mejores Prácticas

1. **Modularidad**: Mantén componentes pequeños y enfocados
2. **Reusabilidad**: Crea componentes compartidos para UI común
3. **Type Safety**: Usa interfaces TypeScript para todos los datos
4. **Error Handling**: Siempre maneja errores gracefully
5. **Loading States**: Proporciona feedback visual durante operaciones
6. **Signals**: Usa signals para estado reactivo local
7. **Services**: Mantén lógica de negocio en servicios
8. **Standalone**: Todos los componentes deben ser standalone
9. **Lazy Loading**: Usa dynamic imports para código no crítico
10. **Documentation**: Documenta funcionalidades complejas

---

## Recursos Adicionales

- [Angular Documentation](https://angular.dev/)
- [Frappe Framework Docs](https://frappeframework.com/docs)
- [RxJS Documentation](https://rxjs.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
