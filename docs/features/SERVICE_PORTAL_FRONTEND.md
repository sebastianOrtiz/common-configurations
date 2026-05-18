# Feature: Frontend Angular del Service Portal

SPA construida con **Angular 21** que renderiza los portales públicos (Service Portal). Vive en `front_apps/service-portal/` y se compila a `common_configurations/public/service-portal/`.

---

## Ubicación

```
common_configurations/
├── front_apps/
│   └── service-portal/         ← Proyecto Angular
│       ├── angular.json
│       ├── package.json
│       ├── tsconfig*.json
│       ├── public/             ← Assets estáticos (favicon, manifest)
│       ├── src/
│       │   ├── main.ts
│       │   ├── styles.scss
│       │   ├── index.html
│       │   └── app/
│       │       ├── app.ts, app.html, app.scss, app.config.ts, app.routes.ts
│       │       ├── core/        ← Servicios, guards, models
│       │       ├── features/    ← Vistas y componentes principales
│       │       └── shared/      ← Componentes reutilizables
│       └── docs/
│
├── common_configurations/
│   ├── public/
│   │   └── service-portal/     ← OUTPUT del build (versionado o gitignored)
│   └── www/
│       └── service-portal.html ← HTML servido por Frappe
└── ...
```

---

## Tecnologías

- **Angular 21.1** (standalone components, signals API)
- **TypeScript 5.9**
- **RxJS 7.8** (para operaciones HTTP asíncronas)
- **Lucide Angular** (iconos)
- **Service Worker** (`@angular/service-worker` para PWA)
- **SCSS** (estilos)
- **Vitest** (tests unitarios)

`package.json`:

```json
{
  "dependencies": {
    "@angular/common": "^21.1.0",
    "@angular/core": "^21.1.0",
    "@angular/forms": "^21.1.0",
    "@angular/router": "^21.1.0",
    "@angular/service-worker": "^21.1.0",
    "lucide-angular": "^0.563.0",
    "rxjs": "~7.8.0"
  }
}
```

---

## Estructura del proyecto

### `src/app/core/` — Infraestructura

```
core/
├── components/
├── guards/
├── models/
└── services/
    ├── auth.service.ts
    ├── frappe-api.service.ts       ← Base HTTP service
    ├── meet-scheduling.service.ts
    ├── otp.service.ts
    ├── portal.service.ts
    └── state.service.ts            ← Estado global (signals)
```

### `src/app/features/` — Vistas

```
features/
├── auth/                          ← Registro / login / OTP
├── portal/                        ← Vista del portal (con sus tools)
└── tools/                         ← Vistas individuales por tool_type
    ├── appointment-booking/
    ├── create-logbook/            ← logbook.create_logbook
    ├── meet-scheduling/           ← meet_scheduling.meet_scheduling
    ├── my-appointments/           ← meet_scheduling.my_appointments
    ├── my-cases/                  ← lex_app.my_cases
    ├── my-logbook/                ← logbook.my_logbook
    ├── portal-quick-links/        ← common_configurations.portal_quick_links
    ├── procedures/                ← logbook.procedures
    ├── tool-not-found/
    ├── tool-router/               ← Router dinámico de tools
    └── tools.routes.ts
```

### `src/app/shared/` — Reutilizable

```
shared/
└── components/                    ← Icon, Spinner, Modal, etc.
```

---

## Servicios principales

### `FrappeApiService` (`core/services/frappe-api.service.ts`)

Base para todas las llamadas HTTP a Frappe.

```typescript
export const USER_CONTACT_AUTH_HEADER = 'X-User-Contact-Token';

interface FrappeConfig {
  authorizationMode: 'api-token' | 'csrf-token';
  token?: string;
  userContactToken?: string;
}

const DEFAULT_CONFIG: FrappeConfig = {
  authorizationMode: 'csrf-token'
};

// Cache global de requests pendientes (deduplicación)
const pendingRequests = new Map<string, Observable<any>>();
```

Características:

- **Auth automática**: inyecta `X-User-Contact-Token` o `X-Frappe-CSRF-Token` según el modo configurado.
- **Deduplicación de requests**: si dos componentes piden el mismo endpoint en paralelo, comparten el observable (`shareReplay`).
- **Manejo de errores**: parsea `_server_messages` y `exc` de Frappe.
- **Type safety**: interfaces `ApiResponse<T>` tipadas.

### `StateService` (signals)

Estado global de la app usando **signals** (Angular 16+). Variables observables:

- `selectedPortal()` — Portal actualmente cargado (con todas sus tools).
- `userContact()` — User Contact autenticado o `null`.
- `isAnonymousUser()` — Computed signal: `true` si no hay sesión.

Componentes acceden con `inject(StateService)` y leen `this.stateService.selectedPortal()`.

### `PortalService`

Wrapper sobre los endpoints `common_configurations.api.portals.*`:

- `getPortals()` → lista de portales activos
- `getPortal(portalName)` → portal específico con tools inyectadas

### `AuthService`

Wrapper sobre `common_configurations.api.auth.*` y `common_configurations.api.contacts.*`:

- `getCsrfToken()`
- `getCurrentUser()`
- `login(document)`
- `register(formData)`
- `logout()`

### `OtpService`

Wrapper sobre `common_configurations.api.otp.*`.

### `MeetSchedulingService`

Wrapper sobre `meet_scheduling.api.appointments.*` (cuando la app `meet_scheduling` está instalada).

---

## Tool Router (renderizado dinámico)

`features/tools/tool-router/tool-router.component.ts` carga los componentes de tool **on-demand** según el `tool_type`:

```typescript
switch (toolType) {
  case 'meet_scheduling':
    const meetScheduling = await import('../meet-scheduling/meet-scheduling-tool.component');
    ComponentClass = meetScheduling.MeetSchedulingToolComponent;
    break;
  case 'my_appointments':
    const myAppointments = await import('../my-appointments/my-appointments-tool.component');
    ComponentClass = myAppointments.MyAppointmentsToolComponent;
    break;
  case 'my_cases':
    // ...
  case 'create_logbook':
    // ...
  // etc.
}

this.viewContainerRef.createComponent(ComponentClass);
```

Para que una nueva app pueda registrar su tool, debe:

1. Crear el componente Angular en `features/tools/<kebab-case-name>/`.
2. Agregar el `case` correspondiente en el switch del tool-router.

> Ver [../HOW_TO_CREATE_A_PORTAL_TOOL.md](../HOW_TO_CREATE_A_PORTAL_TOOL.md) para la guía paso a paso.

---

## Build y deploy

### Scripts disponibles (`package.json`)

```json
{
  "scripts": {
    "ng": "ng",
    "start": "ng serve --host 0.0.0.0",
    "build": "ng build && npm run copy-html-entry",
    "build:dev": "ng build --configuration development",
    "copy-html-entry": "cp ../../common_configurations/public/service-portal/browser/index.html ../../common_configurations/www/service-portal.html",
    "watch": "ng build --watch --configuration development",
    "test": "ng test"
  }
}
```

### Configuración de build (`angular.json`)

```json
{
  "outputPath": "../../common_configurations/public/service-portal",
  "baseHref": "/service-portal/",
  "deployUrl": "/assets/common_configurations/service-portal/browser/",
  "browser": "src/main.ts"
}
```

- Output: `common_configurations/public/service-portal/` → servido por Frappe en `/assets/common_configurations/service-portal/`.
- `baseHref: /service-portal/` para que las rutas internas del SPA funcionen.
- El script `copy-html-entry` copia el `index.html` generado a `www/service-portal.html` para que Frappe lo sirva como vista web.

### Comando bench dedicado

`common_configurations/commands.py` expone un comando para invocar el build desde bench:

```bash
bench build-service-portal           # Build de producción
bench build-service-portal --watch   # Watch mode (development)
```

Implementación (`commands.py:33-67`):

```python
@click.command("build-service-portal")
@click.option("--watch", is_flag=True, default=False)
def build_service_portal(watch: bool):
    frontend_dir = _get_frontend_dir()
    npm_script = "watch" if watch else "build"
    result = subprocess.run(["npm", "run", npm_script], cwd=frontend_dir)
    if result.returncode != 0:
        raise click.ClickException(...)
```

### Rutas web de Frappe

`hooks.py`:

```python
website_route_rules = [
    {"from_route": "/service-portal/<path:app_path>", "to_route": "service-portal"}
]
```

Esto permite que el routing del lado del cliente Angular (`Router`) maneje rutas como `/service-portal/portal/mi-portal` sin que Frappe devuelva 404. La página `service-portal.html` (copiada por `copy-html-entry`) se sirve para cualquier ruta bajo `/service-portal/*`.

---

## Estado actual y configuración

### Modo de autenticación

Default: `csrf-token` (apto para usuarios públicos del portal).

Cuando un User Contact se autentica, el frontend pasa el modo a usar el token: en cada request se envía `X-User-Contact-Token: <token>` además del CSRF.

### Persistencia del token

`localStorage`:

- `userContactToken` — Token del User Contact actual
- (otros datos de UI: idioma, tema, etc.)

### Routing

`app.routes.ts` define rutas como:

```
/portals                       → Lista de portales
/portal/:portalName            → Portal específico
/portal/:portalName/register   → Formulario de registro
/portal/:portalName/login      → Login por documento
/portal/:portalName/:toolType  → Renderiza la tool específica
```

(El detalle exacto de las rutas depende del `app.routes.ts` actual.)

---

## Convenciones de los componentes

Los componentes de tool siguen este patrón (descrito en `CLAUDE.md`):

```typescript
@Component({
  selector: 'app-mi-tool',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './mi-tool.component.html',
  styleUrls: ['./mi-tool.component.scss']
})
export class MiToolComponent implements OnInit {
  private http = inject(HttpClient);
  private stateService = inject(StateService);
  private router = inject(Router);

  protected selectedPortal = this.stateService.selectedPortal;
  protected userContact = this.stateService.userContact;
  protected isAnonymousUser = this.stateService.isAnonymousUser;

  protected loading = signal<boolean>(false);
  protected error = signal<string | null>(null);

  ngOnInit(): void {
    if (this.isAnonymousUser()) return;
    const portal = this.selectedPortal();
    const tool = portal?.tools.find(t => t.tool_type === 'mi_tool');
    if (tool && (tool as any).mi_campo) {
      // leer config del custom field
    }
  }
}
```

**Buenas prácticas**:

- `signal()` para estado reactivo (no `BehaviorSubject` ni `@Input/@Output`).
- `inject()` para DI (no constructor injection).
- `standalone: true` siempre.
- Acceso a custom fields del tool con `(tool as any).mi_campo`.
- Manejo explícito de estado anónimo (`isAnonymousUser()`).

---

## Estilos compartidos

`src/styles.scss` define clases globales reutilizables:

- `.tool-header`, `.btn-back`, `.btn-primary`
- `.alert`, `.alert-error`, `.alert-success`
- `.section-card`
- `.auth-required-state`
- `.modal-overlay`, `.modal-content`, `.modal-header`, `.modal-body`, `.modal-actions`
- `.spinner`

Cada componente de tool usa estas clases para consistencia visual. Como referencia completa, `meet-scheduling-tool.component.scss` está bien documentada.

---

## PWA

El proyecto usa `@angular/service-worker` (configurado vía `ngsw-config.json`). En producción se genera un service worker que:

- Cachea assets estáticos
- Permite uso offline (con limitaciones)
- Habilita instalación como app

---

## Referencias cruzadas

- [../SERVICE_PORTAL.md](../SERVICE_PORTAL.md) — DocType backend.
- [../HOW_TO_CREATE_A_PORTAL_TOOL.md](../HOW_TO_CREATE_A_PORTAL_TOOL.md) — Guía de creación de tools (incluye sección de Angular).
- [../api/PORTALS.md](../api/PORTALS.md) — Endpoint backend que alimenta el frontend.
- [../api/AUTH.md](../api/AUTH.md) — Endpoints de autenticación usados por `FrappeApiService`.
- `front_apps/service-portal/README.md` — README del proyecto Angular.
