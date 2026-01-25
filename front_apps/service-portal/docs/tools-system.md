# Sistema de Herramientas

## Visión General

El **Sistema de Herramientas** permite cargar dinámicamente componentes de herramientas basados en la configuración del portal. Es un sistema extensible y modular que facilita agregar nuevas funcionalidades sin modificar el código core.

---

## Arquitectura del Sistema

```
Service Portal (DocType)
├── Portal Tools (Child Table)
│   ├── Tool Type (Link)
│   ├── Label (Data)
│   ├── Description (Small Text)
│   ├── Icon (Select)
│   ├── Display Order (Int)
│   ├── Is Enabled (Check)
│   └── Configuration Fields
│       ├── calendar_resource
│       ├── show_calendar_view
│       └── ...más campos según la herramienta
```

###Flujo de Datos

```
1. Usuario entra al portal
   ↓
2. Se carga configuración del portal
   ↓
3. Portal View muestra tarjetas de herramientas
   ↓
4. Usuario hace click en una herramienta
   ↓
5. Navegación a /portal/:portalName/tool/:toolType
   ↓
6. ToolRouterComponent intercepta
   ↓
7. Import dinámico del componente
   ↓
8. ViewContainerRef crea el componente
   ↓
9. Herramienta se renderiza
```

---

## Componentes del Sistema

### 1. Tool Router Component

**Responsabilidad**: Cargar dinámicamente componentes de herramientas.

**Ubicación**: `src/app/features/tools/tool-router/tool-router.component.ts`

**Código Core**:

```typescript
export class ToolRouterComponent implements OnInit, OnDestroy {
  private viewContainerRef = inject(ViewContainerRef);
  private cdr = inject(ChangeDetectorRef);

  toolType: string = '';
  loading = true;
  error = false;
  private componentRef: ComponentRef<any> | null = null;

  async ngOnInit() {
    this.toolType = this.route.snapshot.paramMap.get('toolType') || '';
    await this.loadToolComponent(this.toolType);
  }

  private async loadToolComponent(toolType: string) {
    this.loading = true;
    this.error = false;

    try {
      let ComponentClass: Type<any> | null = null;

      switch (toolType) {
        case 'meet_scheduling':
          const meetScheduling = await import('../meet-scheduling/meet-scheduling-tool.component');
          ComponentClass = meetScheduling.MeetSchedulingToolComponent;
          break;

        // AGREGAR NUEVAS HERRAMIENTAS AQUÍ
        // case 'mi_herramienta':
        //   const miHerramienta = await import('../mi-herramienta/mi-herramienta.component');
        //   ComponentClass = miHerramienta.MiHerramientaComponent;
        //   break;

        default:
          console.warn('[ToolRouter] Unknown tool type:', toolType);
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
      console.error('[ToolRouter] Error loading component:', error);
      this.error = true;
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  ngOnDestroy() {
    if (this.componentRef) {
      this.componentRef.destroy();
    }
  }
}
```

**Puntos Clave**:
- **Dynamic Import**: `import('../path/component')` - Lazy loading
- **ViewContainerRef**: Crea componentes programáticamente
- **ChangeDetectorRef**: Fuerza detección de cambios
- **Cleanup**: Destruye componente en ngOnDestroy

### 2. Portal View Component

**Responsabilidad**: Mostrar tarjetas de herramientas disponibles.

**Ubicación**: `src/app/features/portal/portal-view/portal-view.component.ts`

**Template**:

```html
<div class="tools-grid">
  @for (tool of tools(); track tool.name) {
    <button
      class="tool-card"
      (click)="openTool(tool)"
      [style.--tool-color]="tool.button_color || '#667eea'"
    >
      <div class="tool-icon">
        <!-- Icono dinámico -->
        <lucide-angular [name]="tool.icon || 'Circle'" />
      </div>
      <h3>{{ tool.label }}</h3>
      <p>{{ tool.tool_description }}</p>
    </button>
  }
</div>
```

**Método de Navegación**:

```typescript
openTool(tool: PortalTool): void {
  const portalName = this.portal()?.name;
  if (portalName && tool.tool_type) {
    this.router.navigate(['/portal', portalName, 'tool', tool.tool_type]);
  }
}
```

---

## Configuración en Frappe

### DocType: Service Portal Tool

**Campos Principales**:

```python
{
  "name": "Service Portal Tool",
  "istable": 1,  # Child table
  "fields": [
    {
      "fieldname": "tool_type",
      "fieldtype": "Link",
      "options": "Tool Type",
      "label": "Tool Type",
      "reqd": 1
    },
    {
      "fieldname": "label",
      "fieldtype": "Data",
      "label": "Label",
      "reqd": 1
    },
    {
      "fieldname": "tool_description",
      "fieldtype": "Small Text",
      "label": "Description"
    },
    {
      "fieldname": "icon",
      "fieldtype": "Select",
      "label": "Icon",
      "options": "Calendar\nCalendarCheck\n..."
    },
    {
      "fieldname": "button_color",
      "fieldtype": "Color",
      "label": "Button Color"
    },
    {
      "fieldname": "display_order",
      "fieldtype": "Int",
      "label": "Display Order",
      "default": "0"
    },
    {
      "fieldname": "is_enabled",
      "fieldtype": "Check",
      "label": "Is Enabled",
      "default": "1"
    },
    # Campos específicos de herramienta
    {
      "fieldname": "calendar_resource",
      "fieldtype": "Link",
      "options": "Calendar Resource",
      "label": "Calendar Resource",
      "depends_on": "eval:doc.tool_type=='meet_scheduling'"
    }
  ]
}
```

### DocType: Tool Type

**Propósito**: Catálogo de tipos de herramientas disponibles.

```python
{
  "name": "Tool Type",
  "fields": [
    {
      "fieldname": "tool_type_id",
      "fieldtype": "Data",
      "label": "Tool Type ID",
      "reqd": 1,
      "unique": 1
    },
    {
      "fieldname": "tool_label",
      "fieldtype": "Data",
      "label": "Tool Label",
      "reqd": 1
    },
    {
      "fieldname": "description",
      "fieldtype": "Text",
      "label": "Description"
    },
    {
      "fieldname": "icon",
      "fieldtype": "Select",
      "label": "Default Icon",
      "options": "Calendar\nFile\n..."
    }
  ]
}
```

**Ejemplo de Registro**:

```json
{
  "tool_type_id": "meet_scheduling",
  "tool_label": "Agendamiento de Citas",
  "description": "Sistema de reserva de citas con calendario mensual",
  "icon": "Calendar"
}
```

---

## Herramientas Implementadas

### Meet Scheduling

**Tool Type**: `meet_scheduling`
**Archivo**: `src/app/features/tools/meet-scheduling/meet-scheduling-tool.component.ts`

**Configuración Requerida**:
```typescript
interface MeetSchedulingConfig {
  calendar_resource: string;      // ID del Calendar Resource
  show_calendar_view?: boolean;   // Mostrar vista de calendario
}
```

**Acceso a Configuración**:

```typescript
ngOnInit() {
  const portal = this.selectedPortal();
  const tool = portal?.tools.find(t => t.tool_type === 'meet_scheduling');

  if (tool && tool.calendar_resource) {
    this.calendarResource.set(tool.calendar_resource);
    this.showCalendarView.set(tool.show_calendar_view ?? true);
    this.loadCalendarMonth(this.currentMonth());
  }
}
```

**Características**:
- Calendario mensual interactivo
- Vista de disponibilidad en tiempo real
- Agendamiento de citas
- Gestión de citas del usuario
- Modal de confirmación
- Integración con Calendar Resource de Frappe

---

## Crear Nueva Herramienta

### Paso 1: Crear DocType en Frappe

```python
# 1. Crear Tool Type
frappe.get_doc({
    "doctype": "Tool Type",
    "tool_type_id": "document_viewer",
    "tool_label": "Visor de Documentos",
    "description": "Visualiza y descarga documentos",
    "icon": "FileText"
}).insert()

# 2. No requiere cambios en Service Portal Tool (es genérico)
```

### Paso 2: Crear Componente Angular

```bash
cd src/app/features/tools
ng generate component document-viewer --standalone
```

**Estructura de archivos**:
```
document-viewer/
├── document-viewer-tool.component.ts
├── document-viewer-tool.component.html
├── document-viewer-tool.component.scss
└── document-viewer-tool.component.spec.ts
```

### Paso 3: Implementar Componente

```typescript
// document-viewer-tool.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { StateService } from '../../../core/services/state.service';

@Component({
  selector: 'app-document-viewer-tool',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './document-viewer-tool.component.html',
  styleUrls: ['./document-viewer-tool.component.scss']
})
export class DocumentViewerToolComponent implements OnInit {
  private stateService = inject(StateService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  protected selectedPortal = this.stateService.selectedPortal;

  ngOnInit() {
    // Obtener configuración de la herramienta
    const portal = this.selectedPortal();
    const tool = portal?.tools.find(t => t.tool_type === 'document_viewer');

    if (tool) {
      // Acceder a campos de configuración
      console.log('Tool config:', tool);
    }
  }

  goBack(): void {
    const portal = this.selectedPortal();
    if (portal) {
      this.router.navigate(['/portal', portal.name]);
    }
  }
}
```

### Paso 4: Registrar en Tool Router

Editar `tool-router.component.ts`:

```typescript
switch (toolType) {
  case 'meet_scheduling':
    const meetScheduling = await import('../meet-scheduling/meet-scheduling-tool.component');
    ComponentClass = meetScheduling.MeetSchedulingToolComponent;
    break;

  case 'document_viewer':  // ← AGREGAR AQUÍ
    const docViewer = await import('../document-viewer/document-viewer-tool.component');
    ComponentClass = docViewer.DocumentViewerToolComponent;
    break;

  default:
    console.warn('[ToolRouter] Unknown tool type:', toolType);
    this.error = true;
    this.loading = false;
    this.cdr.detectChanges();
    return;
}
```

### Paso 5: Agregar Campos de Configuración (Opcional)

Si la herramienta necesita configuración específica:

```python
# En Service Portal Tool DocType
frappe.get_doc({
    "doctype": "DocType",
    "name": "Service Portal Tool",
    "fields": [
        # ... campos existentes ...
        {
            "fieldname": "document_folder",
            "fieldtype": "Link",
            "options": "File",
            "label": "Document Folder",
            "depends_on": "eval:doc.tool_type=='document_viewer'"
        },
        {
            "fieldname": "allowed_extensions",
            "fieldtype": "Small Text",
            "label": "Allowed Extensions",
            "depends_on": "eval:doc.tool_type=='document_viewer'",
            "description": "pdf, doc, docx, xls, xlsx"
        }
    ]
}).save()
```

### Paso 6: Configurar en Portal

1. Ir a Service Portal en Frappe
2. En la tabla "Tools", agregar fila
3. Seleccionar Tool Type: "document_viewer"
4. Configurar label, descripción, icono
5. Configurar campos específicos (document_folder, etc.)
6. Guardar

### Paso 7: Build y Prueba

```bash
cd front_apps/service-portal
npm run build
```

Verificar que:
1. La herramienta aparece en el portal
2. Click en la tarjeta navega correctamente
3. El componente se carga sin errores
4. La funcionalidad trabaja como esperado

---

## Consideraciones Importantes

### 1. Lazy Loading

```typescript
// ✅ CORRECTO: Import dinámico
const module = await import('../my-tool/my-tool.component');
ComponentClass = module.MyToolComponent;

// ❌ INCORRECTO: Import estático
import { MyToolComponent } from '../my-tool/my-tool.component';
// Esto NO es lazy loading
```

### 2. Change Detection

```typescript
// Siempre forzar detección de cambios después de crear componente
this.componentRef = this.viewContainerRef.createComponent(ComponentClass);
this.loading = false;
this.cdr.detectChanges();  // ← IMPORTANTE
```

### 3. Cleanup

```typescript
ngOnDestroy() {
  // Siempre limpiar referencias
  if (this.componentRef) {
    this.componentRef.destroy();
  }
}
```

### 4. Acceso a Configuración

```typescript
// Siempre verificar que la configuración existe
const portal = this.selectedPortal();
const tool = portal?.tools.find(t => t.tool_type === 'mi_herramienta');

if (tool && tool.required_config_field) {
  // Usar configuración
} else {
  this.error.set('Configuración no encontrada');
}
```

### 5. Navegación

```typescript
// Siempre proporcionar botón "Volver"
goBack(): void {
  const portal = this.selectedPortal();
  if (portal) {
    this.router.navigate(['/portal', portal.name]);
  }
}
```

---

## Patrón de Diseño

### Interface para Herramientas

Aunque no es obligatorio, se recomienda seguir un patrón común:

```typescript
interface ToolComponent {
  // Estado
  loading: WritableSignal<boolean>;
  error: WritableSignal<string | null>;

  // Configuración
  selectedPortal: Signal<ServicePortal | null>;

  // Métodos
  ngOnInit(): void;
  goBack(): void;
}
```

### Template Común

```html
<div class="tool-container">
  <!-- Header con botón volver -->
  <div class="tool-header">
    <button class="btn-back" (click)="goBack()">
      <svg>...</svg>
      Volver
    </button>
    <h1>Nombre de la Herramienta</h1>
  </div>

  <!-- Contenido de la herramienta -->
  <div class="tool-content">
    <!-- Tu contenido aquí -->
  </div>
</div>
```

### Estilos Comunes

```scss
.tool-container {
  min-height: 100vh;
  padding: 2rem;
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;

  .btn-back {
    // Estilos del botón volver
  }

  h1 {
    margin: 0;
  }
}

.tool-content {
  // Contenido de la herramienta
}
```

---

## Debugging

### Console Logs

El Tool Router incluye logs útiles:

```
[ToolRouter] Component initialized
[ToolRouter] Tool type: meet_scheduling
[ToolRouter] Loading component for: meet_scheduling
[ToolRouter] Loaded meet_scheduling component: class MeetSchedulingToolComponent
[ToolRouter] Component created successfully
```

### Errores Comunes

**Error**: "Cannot read property 'clear' of undefined"
- **Causa**: ViewContainerRef no está inicializado
- **Solución**: Asegurar que el componente esté creado antes de usar ViewContainerRef

**Error**: "Unknown tool type: xyz"
- **Causa**: Tool type no registrado en switch
- **Solución**: Agregar case en loadToolComponent()

**Error**: Component se carga pero no se muestra
- **Causa**: Loading state no se limpia
- **Solución**: Llamar `detectChanges()` después de crear componente

---

## Mejores Prácticas

1. **Nombres Consistentes**: Usa el mismo nombre para tool_type_id, carpeta del componente, y case en router

2. **Documentación**: Documenta campos de configuración específicos de cada herramienta

3. **Validación**: Valida que la configuración requerida esté presente

4. **Error Handling**: Maneja gracefully errores de carga y configuración

5. **Testing**: Prueba que la herramienta funcione en diferentes portales

6. **Performance**: Usa lazy loading para mantener bundle inicial pequeño

7. **UX**: Proporciona feedback visual durante operaciones (loading, errores, éxito)
