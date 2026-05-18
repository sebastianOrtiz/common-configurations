# Sistema de Routing

El routing del Service Portal usa `@angular/router` con **lazy loading** en cada ruta top-level y un **router dinamico** (`tool-router`) que carga componentes de tool segun el parametro `:toolType`. Provisto via `provideRouter(routes)` en `app.config.ts:11`.

---

## 1. Rutas top-level

Archivo: `src/app/app.routes.ts`

```typescript
// app.routes.ts:3-54
export const routes: Routes = [
  {
    path: '',
    redirectTo: '/portals',
    pathMatch: 'full'
  },
  {
    path: 'portals',
    loadComponent: () =>
      import('./features/portal/portal-selector/portal-selector.component')
        .then(m => m.PortalSelectorComponent)
  },
  {
    path: 'portal/:portalName',
    loadComponent: () =>
      import('./features/portal/portal-layout/portal-layout.component')
        .then(m => m.PortalLayoutComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/portal/portal-view/portal-view.component')
            .then(m => m.PortalViewComponent)
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./features/portal/contact-registration/contact-registration.component')
            .then(m => m.ContactRegistrationComponent)
      },
      {
        path: 'tool/:toolType',
        loadChildren: () =>
          import('./features/tools/tools.routes').then(m => m.toolRoutes)
      }
    ]
  },
  {
    path: 'login',
    redirectTo: '/portals',
    pathMatch: 'full'
  },
  {
    path: '**',
    redirectTo: '/portals'
  }
];
```

### Tabla de rutas

| Path | Componente | Descripcion |
|------|------------|-------------|
| `''` | (redirect) | Redirige a `/portals` |
| `/portals` | `PortalSelectorComponent` | Lista de portales activos para que el usuario elija |
| `/portal/:portalName` | `PortalLayoutComponent` | Wrapper con header + outlet |
| `/portal/:portalName` (child `''`) | `PortalViewComponent` | Grid de tools del portal |
| `/portal/:portalName/register` | `ContactRegistrationComponent` | Registro / login por documento (puede pasar por OTP) |
| `/portal/:portalName/tool/:toolType` | `ToolRouterComponent` (lazy) | Carga dinamica del tool segun `:toolType` |
| `/login` | (redirect) | Redirige a `/portals` (login Frappe deshabilitado) |
| `**` | (redirect) | Catch-all -> `/portals` |

---

## 2. Lazy loading

Cada componente top-level se carga con `loadComponent: () => import('...').then(m => m.X)`. Esto produce **un chunk por ruta** en el build, reduciendo el tamano del bundle inicial.

Para `tool/:toolType` se usa `loadChildren` para cargar `tools.routes.ts`:

```typescript
// app.routes.ts:36-39
{
  path: 'tool/:toolType',
  loadChildren: () => import('./features/tools/tools.routes').then(m => m.toolRoutes)
}
```

Y `tools.routes.ts`:

```typescript
// features/tools/tools.routes.ts:16-21
export const toolRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./tool-router/tool-router.component').then(m => m.ToolRouterComponent)
  }
];
```

---

## 3. Tool Router (switch dinamico)

Archivo: `src/app/features/tools/tool-router/tool-router.component.ts`

El `ToolRouterComponent` lee `:toolType` del parent route y, segun el valor, hace `import()` dinamico del componente de tool correcto y lo instancia con `ViewContainerRef.createComponent()`.

### Codigo central

```typescript
// tool-router.component.ts:53-110
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

      case 'my_appointments':
        const myAppointments = await import('../my-appointments/my-appointments-tool.component');
        ComponentClass = myAppointments.MyAppointmentsToolComponent;
        break;

      case 'my_cases':
        const myCases = await import('../my-cases/my-cases-tool.component');
        ComponentClass = myCases.MyCasesToolComponent;
        break;

      case 'portal_quick_links':
        const quickLinks = await import('../portal-quick-links/portal-quick-links-tool.component');
        ComponentClass = quickLinks.PortalQuickLinksToolComponent;
        break;

      case 'my_logbook':
        const myLogbook = await import('../my-logbook/my-logbook-tool.component');
        ComponentClass = myLogbook.MyLogbookToolComponent;
        break;

      case 'create_logbook':
        const createLogbook = await import('../create-logbook/create-logbook-tool.component');
        ComponentClass = createLogbook.CreateLogbookToolComponent;
        break;

      case 'procedures':
        const procedures = await import('../procedures/procedures-tool.component');
        ComponentClass = procedures.ProceduresToolComponent;
        break;

      default:
        this.error = true;
        this.loading = false;
        return;
    }

    if (ComponentClass) {
      this.viewContainerRef.clear();
      this.componentRef = this.viewContainerRef.createComponent(ComponentClass);
    }
  } catch (error) {
    this.error = true;
  }
}
```

### Tools registrados actualmente

| `toolType` | Modulo |
|------------|--------|
| `meet_scheduling` | `meet-scheduling/meet-scheduling-tool.component` |
| `my_appointments` | `my-appointments/my-appointments-tool.component` |
| `my_cases` | `my-cases/my-cases-tool.component` |
| `portal_quick_links` | `portal-quick-links/portal-quick-links-tool.component` |
| `my_logbook` | `my-logbook/my-logbook-tool.component` |
| `create_logbook` | `create-logbook/create-logbook-tool.component` |
| `procedures` | `procedures/procedures-tool.component` |

Cualquier valor distinto cae al `default` y se muestra el mensaje "Herramienta No Encontrada" desde el template inline del propio `ToolRouterComponent`.

### Limpieza

```typescript
// tool-router.component.ts:138-143
ngOnDestroy() {
  if (this.componentRef) {
    this.componentRef.destroy();
  }
}
```

### `portal_redirect` no esta en el switch

`portal_redirect` se maneja en `PortalViewComponent.selectTool()` (line 113-118) antes de navegar:

```typescript
if (tool.tool_type === 'portal_redirect' && tool.target_portal) {
  this.stateService.setReferrerPortal(portal.portal_name);
  this.router.navigate(['/portal', tool.target_portal]);
  return;
}
```

Es decir, el `portal_redirect` no necesita componente porque salta directo a otro portal.

---

## 4. Guards

Existe un guard `authGuard` en `core/guards/auth.guard.ts:40-43`:

```typescript
export const authGuard: CanActivateFn = () => {
  const service = inject(AuthGuardService);
  return service.canActivate();
};
```

**No esta usado en las rutas actuales**. Es codigo muerto (la app no requiere login Frappe). Si en el futuro se reactiva el flujo admin, podria aplicarse a una ruta `/admin/...`.

---

## 5. Como agregar una ruta de tool nueva

Para agregar el `tool_type = 'mi_herramienta'`:

1. Crear el componente en `src/app/features/tools/mi-herramienta/mi-herramienta-tool.component.ts` (clase `MiHerramientaToolComponent`).
2. Agregar el `case` correspondiente en el switch de `tool-router.component.ts`:

```typescript
case 'mi_herramienta':
  const mod = await import('../mi-herramienta/mi-herramienta-tool.component');
  ComponentClass = mod.MiHerramientaToolComponent;
  break;
```

3. (Opcional) registrar el `Tool Type` en backend para que sea seleccionable en el child table `Service Portal Tool`. Ver `docs/frontend/tools/HOW_TO_ADD_A_TOOL.md`.

No es necesario modificar `app.routes.ts` ni `tools.routes.ts`.

---

## 6. Navegacion programatica

Las tools navegan via `Router.navigate([...])`:

```typescript
// patron tipico, ej: meet-scheduling-tool.component.ts:557-562
goBack(): void {
  const portal = this.selectedPortal();
  if (portal) {
    this.router.navigate(['/portal', portal.name]);  // o portal.portal_name
  }
}
```

> **Inconsistencia**: algunos lugares usan `portal.name` (`my-cases:201`, `meet-scheduling:560`) y otros `portal.portal_name` (`portal-selector:75, 82, 84`, `contact-registration:289, 472, 497`). En la practica los DocTypes de Frappe suelen tener `name === portal_name` (porque `portal_name` esta marcado como autoname), pero **no debe asumirse**. La convencion deberia ser usar siempre `portal_name`.

---

## 7. Parametros de ruta

| Parametro | Donde se lee | Como |
|-----------|--------------|------|
| `:portalName` | `PortalViewComponent.ngOnInit` | `this.route.paramMap.subscribe(...)` reactivo a cambios |
| `:portalName` | `PortalLayoutComponent` | no se lee directamente; pasa por el outlet |
| `:portalName` | `ContactRegistrationComponent` | `this.route.snapshot.paramMap.get('portalName')` |
| `:toolType` | `ToolRouterComponent` | `this.route.snapshot.paramMap.get('toolType')` |

`PortalViewComponent` usa `paramMap.subscribe` (no snapshot) para que la navegacion entre portales `/portal/A` -> `/portal/B` recargue los datos.

---

## 8. Routing y estado

Algunas rutas modifican estado global:

- **`PortalSelectorComponent`** -> setea `selectedPortal` y posiblemente `anonymousContact` al elegir.
- **`PortalViewComponent`** -> al cargar el portal por nombre, setea el portal y limpia referrer si coincide.
- **`PortalLayoutComponent.exitPortal()`** -> limpia user contact, opcionalmente navega a referrer o a `/portals`.
- **`portal_redirect` tool** -> setea `referrerPortal` y navega.

Esto significa que la navegacion **no es pura**: cambiar de URL puede tener side effects en el `StateService`.

---

## 9. Notas y deuda tecnica

- **`authGuard` muerto**: ver seccion 4.
- **`/login` redirige**: el componente `LoginComponent` existe pero no es alcanzable salvo refactorizando.
- **Tool router con switch hardcoded**: cada nueva tool requiere tocar este archivo. Considerar registry.
- **`tools.routes.ts` casi vacio**: define solo una child route. Podria fusionarse con `app.routes.ts` si se decide simplificar.
- **`tool-not-found.component.ts`** existe pero NO se referencia en ninguna ruta (el "no encontrado" se renderiza inline en `tool-router`). Es codigo muerto.
- **Mezcla `portal.name` / `portal.portal_name`** en navegacion. Estandarizar.
