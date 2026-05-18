# Sistema de Estilos

El Service Portal usa **SCSS** con variables CSS (`:root`) y un conjunto de clases reutilizables por convencion (no extraidas a un framework). El estilo global se define en `src/styles.scss` y cada componente trae su propio archivo `.scss`.

---

## 1. Configuracion en angular.json

```json
// angular.json:36-38
"inlineStyleLanguage": "scss",
"styles": ["src/styles.scss"]
```

`inlineStyleLanguage: scss` permite usar SCSS en bloques `styles: [...]` inline.

Budgets de produccion (`angular.json:43-52`):
- Initial bundle: warning a 500kB, error a 1MB
- Component style: warning a 8kB, error a 16kB

---

## 2. Estilos globales (`src/styles.scss`)

### Reset y caja

```scss
// styles.scss:4-10
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
```

### Variables CSS en `:root`

```scss
// styles.scss:12-46
:root {
  /* Typography */
  --font-family-base: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ...;
  --font-weight-light: 300;
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;

  /* Spacing */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;
  --spacing-2xl: 3rem;

  /* Border Radius */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);

  /* Transitions */
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 200ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 300ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

### Tipografia

```scss
// styles.scss:48-76
html { font-size: 16px; -webkit-font-smoothing: antialiased; ... }
body { font-family: var(--font-family-base); color: #1f2937; background-color: #f9fafb; }
h1 { font-size: 2.25rem; }
h2 { font-size: 1.875rem; }
h3 { font-size: 1.5rem; }
h4 { font-size: 1.25rem; }
h5 { font-size: 1.125rem; }
h6 { font-size: 1rem; }
```

### Scrollbars

Estilos de webkit personalizados con grosor 8px y `var(--radius-full)` para el thumb (line 113-129).

### Utility classes

```scss
// styles.scss:131-140
.text-center { text-align: center; }
.text-left   { text-align: left; }
.text-right  { text-align: right; }
.font-light { font-weight: var(--font-weight-light); }
.font-regular { font-weight: var(--font-weight-regular); }
.font-medium { font-weight: var(--font-weight-medium); }
.font-semibold { font-weight: var(--font-weight-semibold); }
.font-bold { font-weight: var(--font-weight-bold); }
```

---

## 3. Colores del portal

El `Service Portal` DocType expone `primary_color` y `secondary_color` (configurables por admin). Estos se inyectan como CSS variables a traves de `[style.--portal-color]`:

```html
<!-- portal-view.component.html:1 -->
<div class="portal-view-container" [style.--portal-color]="portal()?.primary_color || '#667eea'">
```

Y se usan en SCSS:

```scss
.portal-logo {
  background: linear-gradient(135deg, var(--portal-color, #667eea) 0%, rgba(118, 75, 162, 0.8) 100%);
}
```

Cada tool puede tambien usar `tool.button_color`:

```typescript
// portal-view.component.ts:134-137
getToolColor(tool: ServicePortalTool): string {
  const portal = this.portal();
  return tool.button_color || portal?.primary_color || '#667eea';
}
```

Y en el template:

```html
<div class="tool-card" [style.--tool-color]="getToolColor(tool)">
```

---

## 4. Custom CSS por portal

El campo `custom_css` del `Service Portal` permite al admin inyectar CSS adicional especifico de cada portal. Actualmente **no se inyecta automaticamente** en el DOM desde el frontend Angular. Si se requiere debe leerse de `portal.custom_css` y aplicarse manualmente (ej: con `<style>` en el componente layout o via `Renderer2`).

> Este es un punto de extension pendiente; verificar si esta implementado en algun layout o si es deuda tecnica.

---

## 5. Clases reutilizables por convencion

Cada tool define estas clases en su propio SCSS, copiando los patrones de `meet-scheduling-tool.component.scss`. **No estan extraidas** a una hoja compartida, pero existe una convencion de nombres y estilos:

### Header de tool

```scss
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
    font-size: 0.9rem;
    font-weight: 500;
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
```

### Botones

```scss
.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 0.5rem;
  padding: 0.875rem 2rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary {
  background: white;
  color: #4a5568;
  border: 1px solid #e2e8f0;
  // ...
}
```

### Alerts

```scss
.alert {
  padding: 1rem 1.5rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.alert-error {
  background: #fff5f5;
  color: #c53030;
  border: 1px solid #feb2b2;
}

.alert-success {
  background: #f0fff4;
  color: #2f855a;
  border: 1px solid #9ae6b4;
}
```

### Section cards

```scss
.section-card,
.booking-section,
.appointments-section {
  background: white;
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
```

### Modal

```scss
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 1rem;
  padding: 2rem;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header { ... }
.modal-body { ... }
.modal-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 1.5rem;
}
```

### Spinner

```scss
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
```

### Estados auth required

```scss
.auth-required-state {
  text-align: center;
  padding: 3rem 2rem;
  background: white;
  border-radius: 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);

  h3 { ... }
  p { color: #718096; margin-bottom: 1.5rem; }
  .btn-primary { ... }
}
```

### Status badges

Patron repetido en tools que muestran citas, casos, bitacoras:

```scss
.status-confirmed { background: #c6f6d5; color: #22543d; }
.status-completed { background: #bee3f8; color: #2a4365; }
.status-cancelled { background: #fed7d7; color: #742a2a; }
.status-noshow    { background: #feebc8; color: #7b341e; }
.status-draft     { background: #e2e8f0; color: #4a5568; }
```

---

## 6. Iconos: Material vs Lucide

El proyecto migro a **Lucide Icons** a traves del componente `<app-icon>` (ver `SHARED_COMPONENTS.md` seccion 1). No se usan Material Icons.

> Algunos doctypes de backend (ej: `Portal Tool.icon`) tienen el label "Material Icons" historicamente, pero el frontend lo interpreta como nombres Lucide. Es deuda de naming.

---

## 7. Fuente

Inter, cargada desde Google Fonts en `index.html:11-12`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

Pesos cargados: 300, 400, 500, 600, 700.

---

## 8. Responsive design

Cada tool implementa sus propios breakpoints. La convencion (vista en `meet-scheduling-tool.component.scss`) usa:

```scss
@media (max-width: 768px) {
  .tool-content {
    grid-template-columns: 1fr;
  }
}
```

No hay sistema de grid compartido (no Bootstrap, no Tailwind). Cada feature define su layout.

---

## 9. Notas y deuda tecnica

- **Sin design tokens compartidos**: las clases `.btn-primary`, `.alert`, `.modal-overlay`, etc se duplican en cada `*.scss` de tool. **Alta deuda tecnica**. Considerar extraer a un `_shared.scss` global o a mixins SCSS.
- **`custom_css` del portal no parece inyectarse**: el campo existe en el DocType pero no se vio aplicacion runtime. Verificar.
- **Material Icons vs Lucide**: nomenclatura confusa en backend. El frontend solo soporta Lucide a traves de `IconComponent`.
- **Colores hardcoded**: muchos hex codes (`#667eea`, `#764ba2`, `#f7fafc`, etc) sin centralizarse en variables CSS. Convendria expandir `:root` o usar SCSS variables.
- **No hay sistema dark mode** ni temas.
- **Sin tooling de design system** (no Storybook, no Figma tokens).
