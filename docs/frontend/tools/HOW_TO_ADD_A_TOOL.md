# Como agregar una Tool nueva (Frontend)

Esta guia describe paso a paso como crear una nueva tool en el frontend Angular del Service Portal. Cubre la creacion del componente, su registro en el `tool-router` y los patrones a seguir.

Para el lado backend (registrar el `Tool Type`, crear el endpoint, custom fields, fixtures) ver la documentacion del backend de `common_configurations` (especificamente `HOW_TO_CREATE_A_PORTAL_TOOL.md`).

---

## 1. Asumimos que ya esta lo siguiente

- El backend de tu app expone un `Tool Type` con `name = 'mi_herramienta'`.
- (Opcional) Hay custom fields en `Service Portal Tool` con `depends_on = "eval:doc.tool_type=='mi_herramienta'"`.
- (Opcional) Hay un endpoint backend `mi_app.api.modulo.metodo`.

Ahora solo falta el componente Angular.

---

## 2. Crear el directorio del componente

Ubicacion convencional: `src/app/features/tools/<kebab-case>/`.

```bash
cd /workspace/development/frappe-bench/apps/common_configurations/front_apps/service-portal/src/app/features/tools
mkdir mi-herramienta
cd mi-herramienta
```

Crear tres archivos:

```
mi-herramienta-tool.component.ts
mi-herramienta-tool.component.html
mi-herramienta-tool.component.scss
```

---

## 3. Esqueleto del componente TypeScript

```typescript
// mi-herramienta-tool.component.ts
import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { StateService } from '../../../core/services/state.service';
import { FrappeApiService } from '../../../core/services/frappe-api.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
// Opcional: si quieres dictado por voz
// import { VoiceInputComponent } from '../../../shared/components/voice-input/voice-input.component';

interface MyItem {
  name: string;
  title: string;
  // ... mas campos
}

@Component({
  selector: 'app-mi-herramienta-tool',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IconComponent,
    // VoiceInputComponent,  // si lo necesitas
  ],
  templateUrl: './mi-herramienta-tool.component.html',
  styleUrls: ['./mi-herramienta-tool.component.scss']
})
export class MiHerramientaToolComponent implements OnInit {
  private frappeApi = inject(FrappeApiService);
  private stateService = inject(StateService);
  private router = inject(Router);

  // Estado global
  protected selectedPortal = this.stateService.selectedPortal;
  protected userContact = this.stateService.userContact;
  protected isAnonymousUser = this.stateService.isAnonymousUser;

  // Estado local
  protected loading = signal<boolean>(false);
  protected error = signal<string | null>(null);
  protected items = signal<MyItem[]>([]);
  protected hasItems = computed(() => this.items().length > 0);

  // Config (de custom fields del Service Portal Tool, si aplica)
  private myConfig: string = '';

  ngOnInit(): void {
    // 1) Manejar usuario anonimo
    if (this.isAnonymousUser()) {
      return;
    }

    // 2) Leer custom fields del tool (si tu tool los necesita)
    const portal = this.selectedPortal();
    const tool = portal?.tools.find(t => t.tool_type === 'mi_herramienta');

    if (tool && (tool as any).mi_config_field) {
      this.myConfig = (tool as any).mi_config_field;
    } else {
      this.error.set('Configuracion no encontrada');
      return;
    }

    // 3) Cargar datos
    this.loadItems();
  }

  private loadItems(): void {
    this.loading.set(true);
    this.error.set(null);

    this.frappeApi.callMethod<MyItem[]>(
      'mi_app.api.modulo.get_items',
      { config: this.myConfig },
      true  // useGet para read-only
    ).subscribe({
      next: (response) => {
        this.items.set(response?.message || []);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading items:', err);
        this.error.set(err.message || 'Error al cargar items');
        this.loading.set(false);
      }
    });
  }

  goBack(): void {
    const portal = this.selectedPortal();
    if (portal) {
      this.router.navigate(['/portal', portal.portal_name]);
    }
  }

  goToRegistration(): void {
    const portal = this.selectedPortal();
    if (portal) {
      this.router.navigate(['/portal', portal.portal_name, 'register']);
    }
  }
}
```

---

## 4. Template HTML (patrones)

```html
<!-- mi-herramienta-tool.component.html -->
<div class="mi-herramienta-tool">

  <!-- Header con boton volver -->
  <div class="tool-header">
    <button class="btn-back" (click)="goBack()">
      <app-icon name="ChevronLeft" [size]="20" [strokeWidth]="2"></app-icon>
      Volver
    </button>
    <h1>Mi Herramienta</h1>
  </div>

  <!-- Estado: usuario anonimo -->
  @if (isAnonymousUser()) {
    <div class="auth-required-state">
      <app-icon name="UserCheck" [size]="64" [strokeWidth]="1.5"></app-icon>
      <h3>Acceso restringido</h3>
      <p>Para usar esta herramienta necesitas iniciar sesion.</p>
      <button class="btn-primary" (click)="goToRegistration()">
        Registrarse / Iniciar sesion
      </button>
    </div>
  }

  <!-- Error -->
  @if (!isAnonymousUser() && error()) {
    <div class="alert alert-error">
      <app-icon name="AlertCircle" [size]="20" [strokeWidth]="2"></app-icon>
      <span>{{ error() }}</span>
      <button class="close-btn" (click)="error.set(null)">&times;</button>
    </div>
  }

  <!-- Loading -->
  @if (!isAnonymousUser() && loading()) {
    <div class="loading-container">
      <div class="spinner"></div>
      <p>Cargando...</p>
    </div>
  }

  <!-- Contenido principal -->
  @if (!isAnonymousUser() && !loading() && hasItems()) {
    <div class="section-card">
      <h2>Items</h2>
      <ul>
        @for (item of items(); track item.name) {
          <li>{{ item.title }}</li>
        }
      </ul>
    </div>
  }

  <!-- Vacio -->
  @if (!isAnonymousUser() && !loading() && !hasItems() && !error()) {
    <div class="empty-state">
      <app-icon name="Inbox" [size]="64" [strokeWidth]="1.5"></app-icon>
      <p>No hay items disponibles</p>
    </div>
  }
</div>
```

---

## 5. Estilos SCSS

Reutilizar las clases convencionales. Patron base:

```scss
// mi-herramienta-tool.component.scss
.mi-herramienta-tool {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;

  .btn-back {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 0.5rem;
    color: #4a5568;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: #f7fafc;
      border-color: #cbd5e0;
    }
  }

  h1 {
    font-size: 2rem;
    font-weight: 700;
    color: #1a202c;
    margin: 0;
  }
}

.alert {
  padding: 1rem 1.5rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
  }
}

.alert-error {
  background: #fff5f5;
  color: #c53030;
  border: 1px solid #feb2b2;
}

.section-card {
  background: white;
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 0.5rem;
  padding: 0.875rem 2rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
  }
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e2e8f0;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-container, .empty-state, .auth-required-state {
  text-align: center;
  padding: 3rem 2rem;
}
```

Como referencia completa, ver `meet-scheduling-tool.component.scss`.

---

## 6. Registrar en el Tool Router

Editar `src/app/features/tools/tool-router/tool-router.component.ts` y agregar el `case` en el switch:

```typescript
// tool-router.component.ts (dentro de loadToolComponent)
case 'mi_herramienta':
  const miHerramienta = await import('../mi-herramienta/mi-herramienta-tool.component');
  ComponentClass = miHerramienta.MiHerramientaToolComponent;
  console.log('[ToolRouter] Loaded mi_herramienta component:', ComponentClass);
  break;
```

Este es el **unico paso de registro frontend**. Despues de buildear, el componente se carga automaticamente cuando un Service Portal Tool con `tool_type = 'mi_herramienta'` es seleccionado.

---

## 7. Patrones importantes

### Estado anonimo

Siempre chequear `isAnonymousUser()` antes de hacer requests autenticadas:

```typescript
ngOnInit(): void {
  if (this.isAnonymousUser()) return;
  // ...
}
```

Y mostrar UI alternativa en el template:

```html
@if (isAnonymousUser()) {
  <div class="auth-required-state">
    <h3>Acceso restringido</h3>
    <button (click)="goToRegistration()">Registrarse / Iniciar sesion</button>
  </div>
}
```

### Lectura de custom fields

Los custom fields del `Service Portal Tool` se acceden via cast a `any`:

```typescript
const tool = portal?.tools.find(t => t.tool_type === 'mi_herramienta');
if (tool && (tool as any).mi_campo) {
  this.config = (tool as any).mi_campo;
}
```

### Llamadas a APIs

Preferir `FrappeApiService.callMethod` con `useGet = true` para reads:

```typescript
this.frappeApi.callMethod<MyData[]>(
  'mi_app.api.modulo.metodo',
  { arg1, arg2 },
  true  // useGet = true
).subscribe({
  next: (response) => { ... },
  error: (err) => { ... }
});
```

Para writes, omitir el tercer parametro (o pasarlo `false`):

```typescript
this.frappeApi.callMethod<Result>(
  'mi_app.api.modulo.write',
  { data, honeypot: '' }
).subscribe(...);
```

> El header `X-User-Contact-Token` se agrega automaticamente si hay token guardado. **No** lo agregues manualmente.

### Honeypot

Para writes, incluir `honeypot: ''` en los args. El backend lo valida via `check_honeypot`.

### Manejo de errores

Patron estandar (line 104-118 de `create-logbook-tool.component.ts`):

```typescript
error: (err) => {
  console.error('Error doing X:', err);
  const message = err?.error?.message || err?.error?._server_messages;
  if (message) {
    try {
      const parsed = JSON.parse(message);
      this.error.set(typeof parsed === 'string' ? parsed : parsed[0]?.message || 'Default error');
    } catch {
      this.error.set(typeof message === 'string' ? message : 'Default error');
    }
  } else {
    this.error.set(err.message || 'Default error');
  }
  this.loading.set(false);
}
```

---

## 8. Checklist completo

Backend (ver doc backend para detalle):

- [ ] Crear fixture `tool_type.json` con tu tool
- [ ] (Opcional) Crear fixture `custom_field.json` con campos del tool
- [ ] Registrar en `hooks.py`
- [ ] (Opcional) `install.py` para installs limpias
- [ ] Crear el endpoint API

Frontend:

- [ ] Crear directorio `src/app/features/tools/<kebab-case>/`
- [ ] Crear `<kebab-case>-tool.component.ts` standalone
- [ ] Crear `.html` con patrones (tool-header, auth-required, alerts, content)
- [ ] Crear `.scss` reusando clases convencionales
- [ ] Manejar `isAnonymousUser()` en `ngOnInit` y template
- [ ] Leer custom fields del tool con `(tool as any).<field>`
- [ ] Llamar APIs con `FrappeApiService.callMethod`
- [ ] Agregar `case` en `tool-router.component.ts`
- [ ] Probar en dev (`npm start`)
- [ ] Build (`npm run build` desde el dir de service-portal)
- [ ] `bench build --app common_configurations`

---

## 9. Tools existentes como referencia

| Ejemplo | Caracteristica destacada |
|---------|--------------------------|
| `meet-scheduling-tool` | Calendario, slots, modal flow |
| `my-appointments-tool` | Lista + cancel |
| `my-cases-tool` | Lista + detail view |
| `create-logbook-tool` | Form + voice input |
| `my-logbook-tool` | Lista bilingue (ingles/espanol) |
| `procedures-tool` | State machine (`list`/`form`/`confirm`/`external`) |
| `portal-quick-links-tool` | Sin API, todo desde portal payload |

---

## 10. Errores comunes

- **Olvidar `if (this.isAnonymousUser()) return`** en `ngOnInit`: la tool intentara cargar datos y fallara con 401/403.
- **No agregar el case en `tool-router`**: el componente nunca se monta, se muestra "Herramienta No Encontrada".
- **Importar componentes en `imports[]` y olvidar `standalone: true`**: en Angular 21, omitir `standalone: true` puede dar warnings (default es true, pero ser explicito ayuda).
- **Usar `portal.name` en lugar de `portal.portal_name`** en `router.navigate`: ambos suelen funcionar pero `portal_name` es la convencion.
- **No pasar `honeypot: ''` en writes**: el backend rechaza con error 400.
- **Custom fields no tipados**: olvidar el cast `(tool as any)` provoca error TS.
