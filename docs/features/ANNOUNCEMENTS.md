# Feature: Módulo de Anuncios (Announcements)

Sistema para mostrar **banners** (imagen, texto o HTML) en tres zonas de un Service Portal, con rotación automática opcional, vigencia por fechas y comportamiento responsive.

---

## Visión general

```
┌─────────────────────────────────────────────────────────────┐
│  SERVICE PORTAL (desktop ≥ 1024px)                            │
│                                                               │
│  ┌──────────┐   ┌───────────────────────────┐  ┌──────────┐ │
│  │ LEFT      │   │  Servicios Disponibles    │  │ RIGHT     │ │
│  │ aside     │   │  ┌────┐ ┌────┐ ┌────┐    │  │ aside     │ │
│  │ (sticky)  │   │  │tool│ │tool│ │tool│    │  │ (sticky)  │ │
│  │           │   │  └────┘ └────┘ └────┘    │  │           │ │
│  │ announce  │   │                           │  │ announce  │ │
│  │ ment_set  │   │  ── BOTTOM announcements ─│  │ ment_set  │ │
│  │ _left     │   │     (announcement_set_bottom) │ _right   │ │
│  └──────────┘   └───────────────────────────┘  └──────────┘ │
└─────────────────────────────────────────────────────────────┘
```

Tres zonas independientes, cada una alimentada por un `Announcement Set`:

| Campo del Service Portal | Zona | Orientación |
|--------------------------|------|-------------|
| `announcement_set_left` | Columna izquierda (aside) | `side` (vertical, sticky) |
| `announcement_set_bottom` | Debajo del grid de tools | `bottom` (tira horizontal centrada) |
| `announcement_set_right` | Columna derecha (aside) | `side` (vertical, sticky) |

Cada zona solo se renderiza si su set resuelve al menos un anuncio visible (el HTML usa `@if (portal()!.announcements_left?.announcements?.length)`).

---

## DocTypes implicados

| DocType | Rol |
|---------|-----|
| [`Announcement`](../doctypes/ANNOUNCEMENT.md#1-announcement-doctype-padre) | Un banner (contenido + estilo + vigencia + CTA) |
| [`Announcement Set`](../doctypes/ANNOUNCEMENT.md#2-announcement-set-doctype-padre) | Grupo de anuncios; lo que se asigna a una zona |
| [`Announcement Set Item`](../doctypes/ANNOUNCEMENT.md#3-announcement-set-item-doctype-child) | Fila: referencia al anuncio + orden + flag |
| [`Service Portal`](../doctypes/SERVICE_PORTAL.md) | Define qué set va en cada zona + rotación |

---

## Content types

El campo `Announcement.content_type` decide cómo se renderiza la tarjeta (`announcement-zone.component.html`):

| `content_type` | Campos usados | Render |
|----------------|---------------|--------|
| `image` | `image` | `<img>` a ancho completo |
| `text` | `heading` (opcional) + `body` | `<h4>` + `<p>` (`white-space: pre-wrap`) |
| `html` | `html_content` | `[innerHTML]` con `DomSanitizer.bypassSecurityTrustHtml` |

El campo `announcement_type` (`info` / `promo` / `alert` / `event`) añade una clase CSS `type-{valor}` con un borde izquierdo de color (azul / verde / rojo / morado).

Si el anuncio tiene `cta_url`, **toda la tarjeta es clickeable** (rol `link`, `tabindex=0`, soporta Enter) y abre la URL según `cta_target` (`_blank` con `noopener,noreferrer` o `_self`).

---

## Rotación

Controlada por `Service Portal.announcement_rotation_seconds` (global a las tres zonas):

- **`> 0`** → se muestra **un anuncio a la vez**; rota cada N segundos vía `setInterval`. Aparecen **dots** de navegación clickeables.
- **`0`** → se muestran **todos apilados**, sin rotación ni dots.

`announcement-zone.component.ts`:

```typescript
protected isRotating = computed(
  () => this.rotationSeconds > 0 && this._announcements().length > 1
);

ngOnInit(): void {
  if (this.isRotating()) {
    this.timer = setInterval(() => {
      const list = this._announcements();
      if (list.length > 1) {
        this._currentIndex.update((i) => (i + 1) % list.length);
      }
    }, this.rotationSeconds * 1000);
  }
}

ngOnDestroy(): void {
  if (this.timer) { clearInterval(this.timer); this.timer = null; }
}
```

> Nota: solo rota si hay **más de un** anuncio. Con un único anuncio se muestra fijo aunque `rotation_seconds > 0`. El `setInterval` se limpia en `ngOnDestroy` (sin fugas de memoria).

### Animación fade-in

Cada cambio de slide reproduce un fade-in CSS. El bucle `@for ... track a.name` recrea el elemento en cada rotación, así que la animación se vuelve a disparar automáticamente:

```scss
.announcement-zone.is-rotating .announcement-card {
  animation: announcementFade 0.6s ease both;
}
@keyframes announcementFade {
  0%   { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .announcement-zone.is-rotating .announcement-card { animation: none; }
}
```

(Respeta `prefers-reduced-motion`.)

---

## Regla de visibilidad (3 capas de flags + vigencia)

Un anuncio aparece **solo si se cumplen todas** las condiciones. Resolución en `common_configurations/api/portals/service.py:200-277` (`_get_announcement_set_data`):

```
                 ┌──────────────────────────────────────────┐
 Zona portal ──▶ │ Announcement Set.is_active == 1   CAPA 3  │
                 └─────────────────┬────────────────────────┘
                                   ▼
                 ┌──────────────────────────────────────────┐
                 │ Announcement Set Item.is_enabled == 1     │
                 │                                  CAPA 2   │
                 └─────────────────┬────────────────────────┘
                                   ▼
                 ┌──────────────────────────────────────────┐
                 │ Announcement.is_active == 1       CAPA 1  │
                 │ AND (valid_from vacío OR valid_from <= hoy)│
                 │ AND (valid_to   vacío OR valid_to   >= hoy)│
                 └──────────────────────────────────────────┘
                                   ▼
                         Anuncio VISIBLE
```

En pseudo-código:

```
VISIBLE  ⟺  AnnouncementSet.is_active == 1
        AND  AnnouncementSetItem.is_enabled == 1
        AND  Announcement.is_active == 1
        AND  (valid_from vacío  OR  valid_from <= hoy)
        AND  (valid_to   vacío  OR  valid_to   >= hoy)
```

Implementación clave:

```python
set_doc = frappe.db.get_value(
    "Announcement Set", {"name": set_name, "is_active": 1}, ...)   # CAPA 3
if not set_doc: return None

items = frappe.get_all("Announcement Set Item",
    filters={"parent": set_name, "is_enabled": 1}, ...)            # CAPA 2
...
a = frappe.db.get_value("Announcement",
    {"name": item.announcement, "is_active": 1}, ...)              # CAPA 1
...
today = frappe.utils.nowdate()
if a.valid_from and str(a.valid_from) > today: continue            # vigencia
if a.valid_to   and str(a.valid_to)   < today: continue
```

Si no queda ningún anuncio tras filtrar, `_get_announcement_set_data` devuelve `None` y la zona no se renderiza.

> Los anuncios se ordenan por `Announcement Set Item.display_order` ascendente (`sorted(items, key=lambda x: x.display_order or 0)`).

---

## Comportamiento responsive

`portal-view.component.scss` — breakpoint **1024px**:

- **Desktop (≥ 1024px):** layout de 3 columnas (`left aside | main | right aside`). Los asides tienen `width: 260px` y `position: sticky; top: 1.5rem`.
- **Tablet / móvil (≤ 1024px):** el layout colapsa a una sola columna (`flex-direction: column`). El orden vertical es:
  1. `order: 1` → contenido principal (tools) + bottom announcements
  2. `order: 2` → left announcements
  3. `order: 3` → right announcements

```scss
@media (max-width: 1024px) {
  .portal-layout { display: flex; flex-direction: column; gap: 0; }
  .portal-main { order: 1; }
  .announcements-aside { width: 100%; position: static; margin-top: 2rem; }
  .announcements-left  { order: 2; }
  .announcements-right { order: 3; }
}
```

> En móvil/tablet **todo queda debajo del grid de herramientas**, apilado: primero las tools, luego los anuncios.

---

## Respuesta del backend

`get_portal` incluye (`service.py:77-88`):

```json
{
  "announcement_rotation_seconds": 8,
  "announcements_left": {
    "name": "Banners Portal Ciudadano",
    "title": "Banners Portal Ciudadano",
    "announcements": [
      {
        "name": "Promo Vacunación 2026",
        "content_type": "image",
        "announcement_type": "promo",
        "image": "/files/banner-vacunas.jpg",
        "heading": null,
        "body": null,
        "html_content": null,
        "cta_url": "https://salud.gov.co/vacunas",
        "cta_target": "_blank"
      }
    ]
  },
  "announcements_bottom": null,
  "announcements_right": { "...": "..." }
}
```

Cada zona es `null` si no hay set asignado o ningún anuncio resulta visible. Detalle en [../api/PORTALS.md](../api/PORTALS.md).

---

## Cómo configurarlo (paso a paso)

1. **Crear Announcements** — Common Configurations > Announcement > New:
   - Elegir `content_type` (`image` / `text` / `html`) y llenar el contenido correspondiente.
   - Opcional: `announcement_type` (estilo), `valid_from`/`valid_to` (vigencia), `cta_url`/`cta_target` (tarjeta clickeable).
   - `is_active`: ✅

2. **Crear un Announcement Set** — Common Configurations > Announcement Set > New:
   - `title`, `is_active`: ✅
   - En la tabla `announcements`, agregar filas con `announcement`, `display_order`, `is_enabled`.

3. **Asignar el set a una zona del portal** — abrir el `Service Portal`, sección Announcements:
   - `announcement_set_left` / `announcement_set_bottom` / `announcement_set_right` → el set creado.
   - `announcement_rotation_seconds`: `0` (apilados) o `N` segundos (rotación).

4. **Guardar.** El SPA renderiza las zonas con los anuncios visibles según la regla de 3 capas + vigencia.

### Componente frontend

`front_apps/service-portal/src/app/shared/components/announcement-zone/`
(`announcement-zone.component.ts` / `.html` / `.scss`). Inputs:

| Input | Tipo | Notas |
|-------|------|-------|
| `data` | `AnnouncementSetData \| null` | El set resuelto por el backend |
| `rotationSeconds` | `number` | `0` = apilados; `> 0` = rota |
| `orientation` | `'side' \| 'bottom'` | `side` para left/right, `bottom` para la tira inferior |

---

## Referencias cruzadas

- [../doctypes/ANNOUNCEMENT.md](../doctypes/ANNOUNCEMENT.md) — los tres DocTypes campo por campo.
- [../doctypes/SERVICE_PORTAL.md](../doctypes/SERVICE_PORTAL.md) — campos de la sección Announcements.
- [../api/PORTALS.md](../api/PORTALS.md) — JSON de respuesta con `announcements_left/bottom/right`.
