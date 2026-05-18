# Tool: `portal_redirect`

Tool especial que **no tiene componente Angular propio**. Cuando se selecciona, redirige al usuario a otro portal y guarda el portal actual como "referrer" para poder volver.

| Item | Valor |
|------|-------|
| `tool_type` | `portal_redirect` |
| Componente | (no aplica - handled inline en `PortalViewComponent`) |
| App backend | `common_configurations` |

---

## 1. Configuracion requerida

| Custom Field | Tipo | Obligatorio | Proposito |
|--------------|------|-------------|-----------|
| `target_portal` | Link -> Service Portal | si | Portal al que se redirige |

---

## 2. Comportamiento

Cuando el usuario clickea una tool con `tool_type = 'portal_redirect'`, el handler en `PortalViewComponent.selectTool()` intercepta antes de llegar al `tool-router`:

```typescript
// portal-view.component.ts:109-118
selectTool(tool: ServicePortalTool): void {
  const portal = this.portal();
  if (!portal) return;

  // Portal redirect: save current portal as referrer, then navigate to target
  if (tool.tool_type === 'portal_redirect' && tool.target_portal) {
    this.stateService.setReferrerPortal(portal.portal_name);
    this.router.navigate(['/portal', tool.target_portal]);
    return;
  }

  // Navegacion normal a tool
  this.router.navigate(['/portal', portal.portal_name, 'tool', tool.tool_type]);
}
```

---

## 3. Estado `referrerPortal`

Se persiste en `localStorage` con la clave `sp_referrer_portal` (ver `state.service.ts:14, 226-241`).

### Lectura

```typescript
// state.service.ts:65
readonly referrerPortal = this.referrerPortalSignal.asReadonly();
```

### Escritura

```typescript
// state.service.ts:226-233
setReferrerPortal(portalName: string | null): void {
  this.referrerPortalSignal.set(portalName);
  if (portalName) {
    localStorage.setItem(STORAGE_KEYS.referrerPortal, portalName);
  } else {
    localStorage.removeItem(STORAGE_KEYS.referrerPortal);
  }
}

clearReferrerPortal(): void {
  this.referrerPortalSignal.set(null);
  localStorage.removeItem(STORAGE_KEYS.referrerPortal);
}
```

---

## 4. Visualizacion del "regresar"

`PortalLayoutComponent` muestra un boton "Volver" en el header cuando `referrerPortal()` esta seteado:

```typescript
// portal-layout.component.ts:34-36
protected showBackButton = computed(() => this.referrerPortal() !== null);

// ...

goBack(): void {
  const referrer = this.referrerPortal();
  if (!referrer) return;
  this.stateService.clearReferrerPortal();
  this.router.navigate(['/portal', referrer]);
}
```

### Auto-clear cuando vuelve

`PortalViewComponent.loadPortal()` detecta si el portal actual es el referrer (el usuario navegoo manualmente) y limpia:

```typescript
// portal-view.component.ts:71-74
const currentReferrer = this.stateService.referrerPortal();
if (currentReferrer && currentReferrer === portalName) {
  this.stateService.clearReferrerPortal();
}
```

---

## 5. Logout dentro del portal destino

Si el usuario se desloguea estando en un portal al que llego via `portal_redirect`, `PortalLayoutComponent.exitPortal()` lo manda al portal de origen en vez de a `/portals`:

```typescript
// portal-layout.component.ts:65-82
exitPortal(): void {
  const currentPortal = this.portal();
  if (!currentPortal) return;

  const referrer = this.referrerPortal();
  this.stateService.clearUserContact();

  if (referrer) {
    // Redirect al portal de origen
    this.stateService.clearReferrerPortal();
    this.router.navigate(['/portal', referrer]);
  } else {
    // Default: ir a /portals y volver
    this.router.navigate(['/portals']).then(() => {
      this.router.navigate(['/portal', currentPortal.portal_name]);
    });
  }
}
```

---

## 6. Caso de uso

```
Usuario esta en /portal/X
    |
    +-- click en tool "Ir a portal Y" (portal_redirect)
    |       |
    |       +-- setReferrerPortal('X')
    |       +-- router.navigate(['/portal', 'Y'])
    |
    v
Usuario esta en /portal/Y
    |
    +-- (header muestra boton "Volver a X")
    |
    +-- Si clickea Volver: clearReferrerPortal() + navigate('X')
    |
    +-- Si interactua con Y y se loguea/desloguea: vuelve a X automaticamente
    |
    +-- Si navega manualmente a /portal/X: clearReferrerPortal()
```

---

## 7. Notas y deuda tecnica

- **No es una tool "real"**: no aparece registrada en el switch del `tool-router`. Si por algun bug llega al router, caeria en `default` (tool-not-found).
- **No hay validacion** de que `target_portal` exista o este activo en el frontend. Si el portal destino no existe, el usuario llega a una pantalla de error.
- **El boton Volver no muestra el nombre del portal de origen**, solo "Volver". Considerar mostrar el `title` del portal referrer.
- **`exitPortal()` no llama al backend** para invalidar el token (ver `AUTHENTICATION.md` seccion 7).
- **Encadenamiento de referrers**: si el usuario hace A -> B (via redirect) -> C (otro redirect), `referrerPortal` se sobrescribe a B. Se pierde la cadena. No hay stack.
