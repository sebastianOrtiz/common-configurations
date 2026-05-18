# Documentacion del Service Portal (Frontend Angular)

Esta carpeta contiene la documentacion exhaustiva del frontend Angular del **Service Portal**, una Single Page Application (SPA) que vive en:

`/workspace/development/frappe-bench/apps/common_configurations/front_apps/service-portal/`

El Service Portal es la interfaz publica donde ciudadanos / clientes / pacientes interactuan con el sistema (registrarse, agendar citas, consultar casos, crear bitacoras, hacer tramites, etc).

---

## Tabla de Contenidos

### Arquitectura y Fundamentos
- [Arquitectura general](./ARCHITECTURE.md) - Stack, estructura de carpetas, patron de tool-router, flujo de datos
- [Servicios core](./CORE_SERVICES.md) - FrappeApiService, StateService, PortalService, AuthService, OtpService, MeetSchedulingService
- [Manejo de estado con signals](./STATE_MANAGEMENT.md) - Patron signal/computed/effect, sincronizacion entre componentes, persistencia en localStorage
- [Routing](./ROUTING.md) - app.routes.ts, tool-router dinamico, lazy loading

### Autenticacion y Componentes
- [Autenticacion](./AUTHENTICATION.md) - Registro, login por documento, token storage, OTP flow, estado anonimo
- [Componentes compartidos](./SHARED_COMPONENTS.md) - IconComponent (Lucide), VoiceInputComponent
- [Estilos](./STYLING.md) - SCSS global, variables, clases reutilizables, sistema de iconos
- [Personalizacion del portal](./CUSTOMIZATION.md) - Logo, colores, custom_css, tools habilitadas

### Tools (Herramientas del portal)
- [Indice de tools](#indice-de-tools) (abajo)
- [Como agregar una nueva tool](./tools/HOW_TO_ADD_A_TOOL.md)

### Build y Deploy
- [Build y Deploy](./BUILD_AND_DEPLOY.md) - angular.json, npm scripts, output path, integracion con Frappe

---

## Indice de Tools

Cada tool del Service Portal es un componente Angular standalone que se carga dinamicamente segun el `tool_type` declarado en el `Service Portal Tool` (child table del Service Portal). El router dinamico (`tool-router`) instancia el componente correcto via `import()` lazy y `ViewContainerRef.createComponent()`.

| Tool Type | Documentacion | Componente |
|-----------|---------------|------------|
| `meet_scheduling` | [Agendar citas](./tools/MEET_SCHEDULING.md) | `meet-scheduling-tool.component` |
| `my_appointments` | [Mis citas](./tools/MY_APPOINTMENTS.md) | `my-appointments-tool.component` |
| `my_cases` | [Mis casos](./tools/MY_CASES.md) | `my-cases-tool.component` |
| `create_logbook` | [Crear bitacora](./tools/CREATE_LOGBOOK.md) | `create-logbook-tool.component` |
| `my_logbook` | [Mi bitacora](./tools/MY_LOGBOOK.md) | `my-logbook-tool.component` |
| `procedures` | [Tramites](./tools/PROCEDURES.md) | `procedures-tool.component` |
| `portal_quick_links` | [Enlaces rapidos](./tools/QUICK_LINKS.md) | `portal-quick-links-tool.component` |
| `portal_redirect` | [Redireccion entre portales](./tools/PORTAL_REDIRECT.md) | (no componente, switch en `portal-view`) |

---

## Resumen Tecnico

| Aspecto | Detalle |
|---------|---------|
| Framework | Angular 21.1 (standalone components) |
| Estado | Angular Signals (`signal`, `computed`) |
| HTTP | `HttpClient` con interceptores DI |
| Routing | Lazy loading por route + dinamico por tool |
| Iconos | `lucide-angular` (curado, ver `IconComponent`) |
| Estilos | SCSS, variables CSS, mobile first |
| Internacionalizacion | Espanol (es-ES) hardcoded |
| Autenticacion | Header `X-User-Contact-Token` + token en localStorage |
| Build output | `common_configurations/public/service-portal/` |
| Entry point Frappe | `common_configurations/www/service-portal.html` |
| Base href | `/service-portal/` |
| Deploy URL assets | `/assets/common_configurations/service-portal/browser/` |

---

## Diagrama de carpetas (resumen)

```
src/
|-- main.ts                       # Bootstrap (App + appConfig)
|-- index.html                    # <app-root> + fuente Inter
|-- styles.scss                   # Reset global + tipografia
|-- app/
    |-- app.ts                    # Componente raiz (RouterOutlet + fetchCsrfToken)
    |-- app.config.ts             # providers: router + HttpClient
    |-- app.routes.ts             # Rutas top-level
    |-- core/
    |   |-- services/             # Servicios singleton (FrappeApi, State, Portal, ...)
    |   |-- models/               # Interfaces TS
    |   `-- guards/               # AuthGuard (no usado actualmente)
    |-- features/
    |   |-- auth/login/           # Login Frappe (legacy)
    |   |-- portal/
    |   |   |-- portal-selector/  # /portals
    |   |   |-- portal-layout/    # Wrapper con header
    |   |   |-- portal-view/      # Grid de tools
    |   |   `-- contact-registration/  # Registro + login por documento (+ OTP)
    |   `-- tools/
    |       |-- tool-router/      # Switch dinamico por tool_type
    |       |-- tool-not-found/   # 404 de tool
    |       |-- tools.routes.ts   # Ruta hija de /tool/:toolType
    |       |-- meet-scheduling/
    |       |-- my-appointments/
    |       |-- my-cases/
    |       |-- create-logbook/
    |       |-- my-logbook/
    |       |-- procedures/
    |       |-- portal-quick-links/
    |       `-- appointment-booking/  # Tool legacy (no registrada en router)
    `-- shared/
        `-- components/
            |-- icon/             # Wrapper de lucide-angular
            `-- voice-input/      # Web Speech API (dictado por voz)
```

---

## Convenciones

- Todos los componentes son **standalone** (sin NgModules).
- Estado UI local con `signal()`. Estado global con `StateService` (signals + persistencia en localStorage).
- Inyeccion preferida via `inject()`, no por constructor (excepto componentes muy antiguos como `login.component.ts`).
- Los textos visibles estan en **espanol** (`es-ES`). Los errores de consola en ingles para compat con logs.
- Los nombres de archivos siguen `kebab-case`. Las clases siguen `PascalCase`. Los selectores con prefijo `app-`.
- Las tools siguen el patron `nombre-kebab/nombre-kebab-tool.component.{ts,html,scss}` y la clase termina en `ToolComponent`.

---

## Notas finales

La documentacion de cada archivo cita lineas concretas del codigo fuente (formato `archivo:linea`). Cuando se reportan bugs o deuda tecnica se hace explicito en las secciones "Notas y deuda tecnica" de cada documento.
