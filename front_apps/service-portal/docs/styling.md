# Sistema de Estilos

## Visión General

El Service Portal utiliza un sistema de diseño moderno y consistente basado en:
- **Variables CSS** para tokens de diseño
- **Google Fonts** (Inter) para tipografía
- **SCSS** para preprocesamiento
- **Component-scoped styles** para encapsulación

---

## Tipografía

### Fuente: Inter

La aplicación usa la familia tipográfica **Inter** de Google Fonts, conocida por su:
- Excelente legibilidad en pantallas
- Diseño moderno y profesional
- Amplio soporte de pesos

**Implementación**:

```html
<!-- index.html -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

**Pesos disponibles**:
- 300 - Light
- 400 - Regular
- 500 - Medium
- 600 - Semibold
- 700 - Bold

---

## Variables CSS Globales

### Archivo: `src/styles.scss`

Todas las variables CSS están definidas en `:root` para uso global.

### Typography

```scss
:root {
  --font-family-base: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-weight-light: 300;
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
}
```

**Uso**:
```scss
.my-element {
  font-family: var(--font-family-base);
  font-weight: var(--font-weight-semibold);
}
```

### Spacing

```scss
:root {
  --spacing-xs: 0.25rem;   /* 4px */
  --spacing-sm: 0.5rem;    /* 8px */
  --spacing-md: 1rem;      /* 16px */
  --spacing-lg: 1.5rem;    /* 24px */
  --spacing-xl: 2rem;      /* 32px */
  --spacing-2xl: 3rem;     /* 48px */
}
```

**Uso**:
```scss
.card {
  padding: var(--spacing-lg);
  margin-bottom: var(--spacing-md);
}
```

### Border Radius

```scss
:root {
  --radius-sm: 0.375rem;   /* 6px */
  --radius-md: 0.5rem;     /* 8px */
  --radius-lg: 0.75rem;    /* 12px */
  --radius-xl: 1rem;       /* 16px */
  --radius-full: 9999px;   /* Círculo perfecto */
}
```

**Uso**:
```scss
.button {
  border-radius: var(--radius-md);
}

.avatar {
  border-radius: var(--radius-full);
}
```

### Shadows

```scss
:root {
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}
```

**Uso**:
```scss
.card {
  box-shadow: var(--shadow-md);

  &:hover {
    box-shadow: var(--shadow-lg);
  }
}
```

### Transitions

```scss
:root {
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 200ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 300ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

**Uso**:
```scss
.button {
  transition: all var(--transition-base);

  &:hover {
    transform: scale(1.05);
  }
}
```

---

## Estilos Base

### Reset CSS

```scss
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
```

### HTML & Body

```scss
html {
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: var(--font-family-base);
  font-weight: var(--font-weight-regular);
  line-height: 1.6;
  color: #1f2937;
  background-color: #f9fafb;
}
```

### Tipografía

```scss
h1, h2, h3, h4, h5, h6 {
  font-weight: var(--font-weight-semibold);
  line-height: 1.2;
  margin-bottom: var(--spacing-md);
  color: #111827;
}

h1 { font-size: 2.25rem; }    /* 36px */
h2 { font-size: 1.875rem; }   /* 30px */
h3 { font-size: 1.5rem; }     /* 24px */
h4 { font-size: 1.25rem; }    /* 20px */
h5 { font-size: 1.125rem; }   /* 18px */
h6 { font-size: 1rem; }       /* 16px */

p {
  margin-bottom: var(--spacing-md);
}
```

### Links

```scss
a {
  color: #667eea;
  text-decoration: none;
  transition: color var(--transition-fast);

  &:hover {
    color: #5568d3;
  }
}
```

### Buttons

```scss
button {
  font-family: var(--font-family-base);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all var(--transition-base);

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}
```

### Scrollbar

```scss
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f5f9;
}

::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: var(--radius-full);

  &:hover {
    background: #94a3b8;
  }
}
```

---

## Utilidades CSS

### Text Alignment

```scss
.text-center { text-align: center; }
.text-left { text-align: left; }
.text-right { text-align: right; }
```

### Font Weights

```scss
.font-light { font-weight: var(--font-weight-light); }
.font-regular { font-weight: var(--font-weight-regular); }
.font-medium { font-weight: var(--font-weight-medium); }
.font-semibold { font-weight: var(--font-weight-semibold); }
.font-bold { font-weight: var(--font-weight-bold); }
```

---

## Paleta de Colores

### Colores Primarios

```scss
// Púrpura/Índigo (color principal)
$primary: #667eea;
$primary-hover: #5568d3;

// Grises (escalas)
$gray-50: #f9fafb;
$gray-100: #f3f4f6;
$gray-200: #e5e7eb;
$gray-300: #d1d5db;
$gray-400: #9ca3af;
$gray-500: #6b7280;
$gray-600: #4b5563;
$gray-700: #374151;
$gray-800: #1f2937;
$gray-900: #111827;
```

### Colores de Estado

```scss
// Success (verde)
$success: #10b981;
$success-bg: #d1fae5;

// Error (rojo)
$error: #ef4444;
$error-bg: #fee2e2;

// Warning (amarillo)
$warning: #f59e0b;
$warning-bg: #fef3c7;

// Info (azul)
$info: #3b82f6;
$info-bg: #dbeafe;
```

---

## Estilos de Componentes

### Portal Header

**Archivo**: `portal-layout.component.scss`

```scss
.portal-header {
  background: white;
  border-bottom: 1px solid #e2e8f0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  position: sticky;
  top: 0;
  z-index: 100;

  .header-content {
    max-width: 1400px;
    margin: 0 auto;
    padding: 1.5rem 2rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
  }
}
```

**Características**:
- **Sticky**: Se mantiene visible al scroll
- **Max-width**: 1400px para contenido
- **Responsive**: Se adapta a mobile
- **Shadow**: Elevación sutil

### User Menu

```scss
.user-menu {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 0.5rem;
  transition: all var(--transition-base);

  &:hover {
    background: #f1f5f9;
    border-color: #cbd5e1;
    box-shadow: var(--shadow-sm);
  }
}
```

**Características**:
- **Card-style**: Contenedor unificado
- **Hover effect**: Feedback visual
- **Gap reducido**: Elementos agrupados visualmente

### Avatar

```scss
.user-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid white;
  box-shadow: var(--shadow-sm);
}

.user-avatar-placeholder {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--portal-color, #667eea) 0%, rgba(102, 126, 234, 0.8) 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1.125rem;
  border: 2px solid white;
  box-shadow: var(--shadow-sm);
}
```

### Logout Button

```scss
.btn-logout {
  width: 40px;
  height: 40px;
  border-radius: 0.5rem;
  background: white;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--transition-base);

  svg {
    width: 20px;
    height: 20px;
    color: #64748b;
  }

  &:hover {
    background: #fee2e2;  // Rojo suave
    border-color: #fecaca;

    svg {
      color: #dc2626;     // Rojo
    }
  }

  &:active {
    transform: scale(0.95);
  }
}
```

---

## Sistema de Colores Dinámicos

### Variable CSS del Portal

```typescript
// En portal-layout.component.ts
ngOnInit() {
  const portal = this.portal();
  if (portal?.color) {
    // Inyectar color del portal globalmente
    document.documentElement.style.setProperty('--portal-color', portal.color);
  }
}
```

### Uso del Color del Portal

```scss
.portal-logo {
  background: linear-gradient(
    135deg,
    var(--portal-color, #667eea) 0%,
    rgba(118, 75, 162, 0.8) 100%
  );
}

.user-avatar-placeholder {
  background: linear-gradient(
    135deg,
    var(--portal-color, #667eea) 0%,
    rgba(102, 126, 234, 0.8) 100%
  );
}
```

**Ventajas**:
- Personalización por portal
- Fallback a color predeterminado
- Aplicado globalmente sin prop drilling

---

## Responsive Design

### Breakpoints

```scss
$mobile: 480px;
$tablet: 768px;
$desktop: 1024px;
$wide: 1400px;
```

### Media Queries

```scss
// Mobile first approach

// Tablet
@media (max-width: 768px) {
  .portal-header .header-content {
    padding: 1.25rem 1.5rem;
    flex-direction: column;
    align-items: flex-start;
    gap: 1.5rem;
  }

  .user-menu {
    width: 100%;
    justify-content: space-between;
  }
}

// Mobile
@media (max-width: 480px) {
  .portal-header .header-content {
    padding: 1rem;
  }

  .portal-logo {
    width: 48px;
    height: 48px;
  }

  .user-name {
    font-size: 0.9rem;
  }
}
```

---

## Mejores Prácticas

### 1. Usa Variables CSS

```scss
// ✅ CORRECTO
.card {
  padding: var(--spacing-lg);
  border-radius: var(--radius-md);
}

// ❌ INCORRECTO
.card {
  padding: 24px;
  border-radius: 8px;
}
```

### 2. Mobile First

```scss
// ✅ CORRECTO: Mobile first
.element {
  font-size: 14px;

  @media (min-width: 768px) {
    font-size: 16px;
  }
}

// ❌ INCORRECTO: Desktop first
.element {
  font-size: 16px;

  @media (max-width: 768px) {
    font-size: 14px;
  }
}
```

### 3. BEM Naming

```scss
// ✅ CORRECTO: BEM
.card {
  &__header {
    // ...
  }

  &__body {
    // ...
  }

  &--large {
    // ...
  }
}

// ❌ INCORRECTO: Nombres genéricos
.header { }
.body { }
.large { }
```

### 4. Evita !important

```scss
// ✅ CORRECTO: Aumenta especificidad
.portal-header .user-menu {
  background: #f8fafc;
}

// ❌ INCORRECTO: Usa !important
.user-menu {
  background: #f8fafc !important;
}
```

### 5. Componentes Reutilizables

```scss
// ✅ CORRECTO: Clase de utilidad
.btn {
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  font-weight: var(--font-weight-medium);
  transition: all var(--transition-base);

  &-primary {
    background: #667eea;
    color: white;
  }

  &-secondary {
    background: #f3f4f6;
    color: #374151;
  }
}
```

---

## Performance

### Optimizaciones

1. **Font Loading**:
   ```html
   <link rel="preconnect" href="https://fonts.googleapis.com">
   ```

2. **CSS Minification**: Automática en build de producción

3. **Unused CSS Removal**: Tree shaking de Angular

4. **Critical CSS**: Inline en componentes críticos

### Bundle Size

- **Global styles**: ~2.4 KB (gzipped)
- **Component styles**: Lazy loaded con componentes
- **Total CSS inicial**: < 5 KB

---

## Agregar Nuevos Estilos

### Para Estilos Globales

1. Editar `src/styles.scss`
2. Agregar variables en `:root` si son reutilizables
3. Rebuild para aplicar cambios

### Para Estilos de Componente

1. Crear/editar `component.scss`
2. Importar en `component.ts`:
   ```typescript
   styleUrls: ['./component.scss']
   ```
3. Usar encapsulación por defecto (Emulated)

### Para Utilidades

```scss
// En styles.scss
.my-utility {
  // ... estilos
}
```

Uso en templates:
```html
<div class="my-utility">...</div>
```
