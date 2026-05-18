# Personalizacion del Portal

Cada Service Portal puede personalizarse desde el backend (DocType `Service Portal`). El frontend Angular lee la configuracion y la aplica dinamicamente. Este documento describe que se puede personalizar y como se consume.

---

## 1. Campos del Service Portal

Modelo TS: `src/app/core/models/service-portal.model.ts:5-29`.

```typescript
export interface ServicePortal {
  name: string;
  portal_name: string;
  title: string;
  description?: string;
  is_active: boolean;

  // Registration
  registration_title?: string;
  registration_description?: string;

  // Auth
  require_auth?: boolean;
  enable_mfa_otp?: boolean;

  // Styles
  primary_color?: string;
  secondary_color?: string;
  logo?: string;
  background_image?: string;
  custom_css?: string;

  // Tools
  tools: ServicePortalTool[];
}
```

---

## 2. Logo

Campo: `portal.logo` (URL al archivo subido en Frappe).

Se renderiza en:
- `PortalSelectorComponent` (con fallback a `assets/default-portal-logo.svg`):

```typescript
// portal-selector.component.ts:91-94
getPortalLogo(portal: ServicePortal): string {
  return portal.logo || 'assets/default-portal-logo.svg';
}
```

- `PortalLayoutComponent` (header del portal): muestra el logo o un fallback con icono.

```html
<!-- portal-layout.component.scss usa el portal-color y la imagen -->
<div class="portal-logo">
  @if (portal()?.logo) {
    <img [src]="portal()?.logo" [alt]="portal()?.title" />
  } @else {
    <!-- SVG fallback -->
  }
</div>
```

---

## 3. Colores

| Campo | Tipo | Uso |
|-------|------|-----|
| `primary_color` | hex string | Color principal del portal (header, botones primarios, gradientes) |
| `secondary_color` | hex string | Color secundario (acentos) |

### Inyeccion como CSS variable

En `PortalViewComponent` template (`portal-view.component.html:1`):

```html
<div class="portal-view-container" [style.--portal-color]="portal()?.primary_color || '#667eea'">
```

Y en `PortalLayoutComponent` (componentes hijos heredan la variable). Los SCSS usan:

```scss
.portal-logo {
  background: linear-gradient(135deg, var(--portal-color, #667eea) 0%, rgba(118, 75, 162, 0.8) 100%);
}
```

### Color por tool

Cada `ServicePortalTool` puede sobrescribir el color con `button_color`. Si no se especifica, hereda `primary_color`:

```typescript
// portal-view.component.ts:134-137
getToolColor(tool: ServicePortalTool): string {
  const portal = this.portal();
  return tool.button_color || portal?.primary_color || '#667eea';
}
```

---

## 4. Background image

Campo: `portal.background_image`.

Actualmente declarado en el modelo pero **no se vio usado activamente** en los componentes (`portal-layout`, `portal-view`). Posiblemente reservado para personalizacion futura o aplicacion via `custom_css`.

---

## 5. Custom CSS

Campo: `portal.custom_css` (textarea de Code).

El campo existe en el modelo (`service-portal.model.ts:25`), pero **no se vio inyeccion runtime** del CSS en los componentes principales. Para que tenga efecto deberia:

1. Leer `portal.custom_css` en `PortalLayoutComponent` o `App`.
2. Crear un `<style>` element y agregarlo al `document.head`.
3. Removerlo al salir del portal.

Patron de implementacion sugerido (no presente actualmente):

```typescript
private cssElement: HTMLStyleElement | null = null;

ngOnInit(): void {
  const portal = this.portal();
  if (portal?.custom_css) {
    this.cssElement = document.createElement('style');
    this.cssElement.textContent = portal.custom_css;
    document.head.appendChild(this.cssElement);
  }
}

ngOnDestroy(): void {
  if (this.cssElement) {
    this.cssElement.remove();
  }
}
```

> **Deuda tecnica**: el campo existe pero no parece aplicarse. Investigar o eliminar.

---

## 6. Tools habilitadas/deshabilitadas

Cada portal tiene una lista `tools: ServicePortalTool[]`. Cada tool tiene:

```typescript
// service-portal.model.ts:31-57
export interface ServicePortalTool {
  name?: string;
  tool_type: string;
  label: string;
  tool_description?: string;
  icon?: string;
  tool_image?: string;
  button_color?: string;
  display_order: number;
  is_enabled: boolean;

  // Custom fields por tool_type:
  calendar_resource?: string;
  show_calendar_view?: boolean;
  slot_duration_minutes?: number;
  target_portal?: string;
  quick_links?: string;
  quick_links_data?: PortalQuickLinksData;

  // Campos extra arbitrarios (custom fields agregados por apps externas)
  [key: string]: any;
}
```

### Filtrado y orden

`PortalViewComponent.loadPortal()` filtra y ordena (line 91-95):

```typescript
const enabledSorted = portal.tools
  .filter(tool => tool.is_enabled)
  .sort((a, b) => a.display_order - b.display_order);

this.enabledTools.set(enabledSorted);
```

Cada tool se renderiza como `tool-card` en un grid (`portal-view.component.html:29-52`):

```html
@for (tool of enabledTools(); track tool.tool_type) {
  <div class="tool-card" (click)="selectTool(tool)" [style.--tool-color]="getToolColor(tool)">
    <div class="tool-icon" [class.has-image]="tool.tool_image">
      @if (tool.tool_image) {
        <img [src]="tool.tool_image" [alt]="tool.label" />
      } @else {
        <app-icon [name]="tool.icon || 'Circle'" [size]="32" [strokeWidth]="2"></app-icon>
      }
    </div>
    <div class="tool-content">
      <h3>{{ tool.label }}</h3>
    </div>
    <div class="tool-arrow">
      <app-icon name="ChevronRight" [size]="24" [strokeWidth]="2"></app-icon>
    </div>
  </div>
}
```

Notar:
- `tool.tool_image` (URL a una imagen) tiene prioridad sobre `tool.icon` (nombre Lucide).
- `tool.label` es el titulo visible.
- `tool.tool_description` esta en el modelo pero NO se renderiza actualmente (deuda).

### Display order

`display_order` (Int) controla el orden visual. Tools con menor valor aparecen primero. Si dos tienen el mismo valor, el orden depende del backend.

---

## 7. Configuracion por tool_type

Algunas tools requieren **custom fields** adicionales en el child table `Service Portal Tool`. Estos se agregan via Custom Field con `depends_on` y `mandatory_depends_on`.

| `tool_type` | Custom fields requeridos | Origen |
|-------------|--------------------------|--------|
| `meet_scheduling` | `calendar_resource` (Link -> Calendar Resource) | meet_scheduling app |
| `meet_scheduling` | `show_calendar_view` (Check, opcional) | meet_scheduling |
| `create_logbook` | `logbook_availability` (Link -> Logbook Availability) | logbook app |
| `procedures` | `logbook_procedures_config` (Link -> Logbook Procedures Config) | logbook app |
| `portal_redirect` | `target_portal` (Link -> Service Portal) | common_configurations |
| `portal_quick_links` | `quick_links` (Link), `quick_links_data` (JSON inline) | common_configurations |

Como leer estos campos en una tool:

```typescript
// patron tipico
const portal = this.selectedPortal();
const tool = portal?.tools.find(t => t.tool_type === 'mi_tool');
if (tool && (tool as any).mi_campo) {
  this.config.set((tool as any).mi_campo);
}
```

Notar el cast `(tool as any).mi_campo` porque el modelo TS no conoce los campos custom dinamicos.

---

## 8. Auth y registro

Dos flags clave en el portal:

| Campo | Default | Efecto |
|-------|---------|--------|
| `require_auth` | (no especificado, asumido `true`) | Si `false`, el portal usa `ANONYMOUS_USER_CONTACT` automaticamente. |
| `enable_mfa_otp` | (asumido `true` si no se especifica) | Si `false`, salta la verificacion OTP en login/registro aunque OTP global este enabled. |

Logica en `ContactRegistrationComponent.onConnect()`:

```typescript
// contact-registration.component.ts:279
const portalRequiresMfa = portal?.enable_mfa_otp !== false;
if (contact.requires_otp && contact.otp_settings && portalRequiresMfa) {
  // OTP step
}
```

### Textos personalizables

| Campo | Donde se muestra |
|-------|------------------|
| `registration_title` | Header de la pagina de registro |
| `registration_description` | Texto descriptivo abajo del titulo |

---

## 9. Quick links (sub-personalizacion)

Cuando una tool es `portal_quick_links`, su data viene en `tool.quick_links_data`:

```typescript
// service-portal.model.ts:59-76
export interface PortalQuickLinksData {
  name: string;
  link_group_name: string;
  description?: string;
  icon?: string;
  image?: string;
  links: PortalQuickLinkItem[];
}

export interface PortalQuickLinkItem {
  label: string;
  icon?: string;
  image?: string;
  url: string;
  target: '_blank' | '_self';
  display_order: number;
  is_enabled: boolean;
}
```

Cada link tiene su propio orden y flag enabled.

---

## 10. Resumen de campos personalizables

| Categoria | Campos |
|-----------|--------|
| Identificacion | `name`, `portal_name`, `title`, `description`, `is_active` |
| Branding | `logo`, `primary_color`, `secondary_color`, `background_image`, `custom_css` |
| Registro | `require_auth`, `enable_mfa_otp`, `registration_title`, `registration_description` |
| Tools | `tools[]` con `is_enabled`, `display_order`, `tool_type`, `label`, `icon`, `tool_image`, `tool_description`, `button_color`, + custom fields por tipo |

---

## 11. Notas y deuda tecnica

- **`custom_css` no se inyecta**: campo existente pero sin implementacion runtime. Validar.
- **`background_image` no se aplica**: campo existente pero sin uso. Validar.
- **`tool_description` no se muestra**: el modelo lo tiene, pero `portal-view.component.html` solo renderiza `label` y opcionalmente la imagen/icono.
- **`secondary_color` poco usado**: solo `primary_color` se inyecta como variable CSS. El secundario no llega al DOM.
- **Custom fields tipados como `any`**: el modelo `ServicePortalTool` declara `[key: string]: any` lo que permite acceso pero pierde type safety. Considerar generar tipos por tool_type con discriminated unions.
- **`portal.name` vs `portal.portal_name`**: el modelo tiene ambos. En la practica son iguales (Frappe usa autoname con `portal_name`). Pero el codigo a veces usa uno u otro inconsistentemente.
