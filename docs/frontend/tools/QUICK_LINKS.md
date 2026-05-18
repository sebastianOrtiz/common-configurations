# Tool: `portal_quick_links`

Tool que muestra un grid de enlaces rapidos a otros sistemas o URLs externas, con icono o imagen por link.

| Item | Valor |
|------|-------|
| `tool_type` | `portal_quick_links` |
| Archivo TS | `src/app/features/tools/portal-quick-links/portal-quick-links-tool.component.ts` |
| Selector | `app-portal-quick-links-tool` |
| Clase | `PortalQuickLinksToolComponent` |
| Backend | (datos vienen en el portal payload, no requiere API en runtime) |

---

## 1. Configuracion requerida

El `Service Portal Tool` con `tool_type = 'portal_quick_links'` necesita:

| Custom Field | Tipo | Obligatorio | Proposito |
|--------------|------|-------------|-----------|
| `quick_links` | Link -> Portal Quick Links | si | Documento que agrupa los links |
| `quick_links_data` | (inline JSON) | si | Data resuelta del Portal Quick Links, incluida en el payload del portal |

El backend (al servir `get_portal`) resuelve `quick_links` y embebe `quick_links_data` con la estructura completa.

---

## 2. Modelos

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

---

## 3. Signals

```typescript
// portal-quick-links-tool.component.ts:25-34
protected quickLinksData = signal<PortalQuickLinksData | null>(null);
protected error = signal<string | null>(null);

protected sortedLinks = computed(() => {
  const data = this.quickLinksData();
  if (!data?.links) return [];
  return [...data.links]
    .filter(link => link.is_enabled)
    .sort((a, b) => a.display_order - b.display_order);
});
```

El computed `sortedLinks` filtra los habilitados y ordena por `display_order`.

---

## 4. Flujo

```
[Grid de links]
    |
    +-- Cada link (con icon o image, label)
    |
    +-- click -> window.open(url, target)
```

No hay APIs llamadas en runtime: todo viene en `quick_links_data` con el portal.

---

## 5. Metodos

| Metodo | Descripcion |
|--------|-------------|
| `ngOnInit()` | Busca el tool, extrae `quick_links_data` y lo setea |
| `openLink(link)` | `window.open(link.url, link.target)` |
| `goBack()` | Navega al portal |

```typescript
// portal-quick-links-tool.component.ts:36-51
ngOnInit(): void {
  const portal = this.stateService.selectedPortal();
  if (!portal) {
    this.error.set('No se pudo cargar el portal.');
    return;
  }

  const tool = portal.tools.find((t: ServicePortalTool) => t.tool_type === 'portal_quick_links');
  if (!tool?.quick_links_data) {
    this.error.set('No se encontraron enlaces rapidos configurados.');
    return;
  }

  this.quickLinksData.set(tool.quick_links_data);
}
```

---

## 6. Templating sugerido

```html
<div class="quick-links-grid">
  @for (link of sortedLinks(); track link.url) {
    <button class="quick-link" (click)="openLink(link)">
      @if (link.image) {
        <img [src]="link.image" [alt]="link.label" />
      } @else {
        <app-icon [name]="link.icon || 'ExternalLink'" [size]="32"></app-icon>
      }
      <span>{{ link.label }}</span>
    </button>
  }
</div>
```

(Verificar template real para confirmar las clases CSS aplicadas.)

---

## 7. Configuracion via DocType backend

`Portal Quick Links` (DocType) tiene los campos:
- `link_group_name` (Data)
- `description` (Text)
- `icon` (Data) - opcional
- `image` (Attach Image) - opcional
- `links` (Table) -> `Portal Quick Link Item`

`Portal Quick Link Item` (child DocType):
- `label` (Data)
- `icon` (Data)
- `image` (Attach Image)
- `url` (Data)
- `target` (Select: `_blank` / `_self`)
- `display_order` (Int)
- `is_enabled` (Check)

> Ver la documentacion de backend para detalles de los DocTypes.

---

## 8. Notas y deuda tecnica

- **Sin telemetria**: no se registra cuando un usuario hace click en un quick link. Util para analytics seria contar clicks en el backend via endpoint.
- **`target: '_self'`**: si el portal abre en `_self`, el SPA pierde estado al navegar fuera (no es SPA). Considerar usar `Router` si es URL interna a la misma SPA.
- **No hay autentificacion**: los quick links se muestran a usuarios anonimos tambien (el componente no chequea `isAnonymousUser`). Esto es intencional probablemente, pero verificar.
- **El icono usa `IconComponent` con catalogo limitado**: si la config tiene un icono no soportado, se ve un Circle por default.
- **No hay confirmacion al abrir links externos**: para URLs sensibles podria ser deseable.
