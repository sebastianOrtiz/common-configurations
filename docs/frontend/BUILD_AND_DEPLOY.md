# Build y Deploy

Este documento explica como buildear, servir en desarrollo y desplegar el Service Portal Angular integrandolo con Frappe.

---

## 1. Stack de build

| Tool | Version |
|------|---------|
| Angular CLI | `^21.1.1` |
| Angular Build | `@angular/build` `^21.1.1` (builder `application`) |
| Node Package Manager | `npm@10.8.2` |
| TypeScript | `~5.9.2` |

---

## 2. Scripts npm

`package.json:4-12`:

```json
"scripts": {
  "ng": "ng",
  "start": "ng serve --host 0.0.0.0",
  "build": "ng build && npm run copy-html-entry",
  "build:dev": "ng build --configuration development",
  "copy-html-entry": "cp ../../common_configurations/public/service-portal/browser/index.html ../../common_configurations/www/service-portal.html",
  "watch": "ng build --watch --configuration development",
  "test": "ng test"
}
```

### Comandos comunes

```bash
# Desarrollo (servidor en :4200)
cd /workspace/development/frappe-bench/apps/common_configurations/front_apps/service-portal
npm install
npm start

# Build de produccion
npm run build

# Build de desarrollo
npm run build:dev

# Watch (rebuild en cambios, dev mode)
npm run watch

# Tests
npm test
```

`npm run build` hace dos cosas:
1. `ng build` (default = production)
2. `npm run copy-html-entry` que copia el `index.html` generado al `www/` de Frappe (entry point publico).

---

## 3. Configuracion de build (`angular.json`)

```json
// angular.json:21-39
"build": {
  "builder": "@angular/build:application",
  "options": {
    "outputPath": "../../common_configurations/public/service-portal",
    "baseHref": "/service-portal/",
    "deployUrl": "/assets/common_configurations/service-portal/browser/",
    "browser": "src/main.ts",
    "tsConfig": "tsconfig.app.json",
    "inlineStyleLanguage": "scss",
    "assets": [
      { "glob": "**/*", "input": "public" }
    ],
    "styles": ["src/styles.scss"]
  }
}
```

### Output path

`../../common_configurations/public/service-portal` (relativo al proyecto Angular).

Equivale a:

`/workspace/development/frappe-bench/apps/common_configurations/common_configurations/public/service-portal/`

Dentro Angular crea una subcarpeta `browser/` que contiene `index.html` + chunks.

### baseHref vs deployUrl

| Atributo | Valor | Para que |
|----------|-------|----------|
| `baseHref` | `/service-portal/` | `<base href>` del documento HTML. Determina las rutas relativas del router. |
| `deployUrl` | `/assets/common_configurations/service-portal/browser/` | Prefijo aplicado a chunks (`.js`, `.css`) en runtime. Es la URL real desde la que Frappe sirve los assets. |

Frappe sirve los assets de cada app desde `/assets/<app_name>/...`, por lo que los chunks de Angular necesitan ese prefijo para cargarse correctamente.

### Configuraciones

```json
// angular.json:40-62
"production": {
  "budgets": [
    { "type": "initial", "maximumWarning": "500kB", "maximumError": "1MB" },
    { "type": "anyComponentStyle", "maximumWarning": "8kB", "maximumError": "16kB" }
  ],
  "outputHashing": "all",
  "serviceWorker": "ngsw-config.json"
},
"development": {
  "optimization": false,
  "extractLicenses": false,
  "sourceMap": true
}
```

- `outputHashing: "all"` agrega hashes a los nombres de chunks (cache busting).
- `serviceWorker: "ngsw-config.json"` declara el SW, **pero no esta provisto en runtime** (`app.config.ts:13-17` lo tiene comentado). Es decir, el `ngsw-worker.js` se genera pero no se registra.

---

## 4. Servir desde Frappe

### URL publica

El portal es accesible en:

```
https://<frappe-site>/service-portal
```

### Como funciona

1. Frappe sirve `common_configurations/www/service-portal.html` como pagina web cuando la ruta es `/service-portal`.
2. Ese HTML es una copia exacta del `index.html` que Angular genera en `public/service-portal/browser/`.
3. El HTML referencia `<base href="/service-portal/">` y carga scripts/styles desde `/assets/common_configurations/service-portal/browser/`.
4. Angular toma el control en cliente y maneja la navegacion interna.

### Build pipeline summary

```
ng build
    |
    v
common_configurations/public/service-portal/browser/
    |-- index.html
    |-- main-<hash>.js
    |-- styles-<hash>.css
    |-- assets/
    `-- chunk-<...>.js
    |
    v (copy-html-entry)
common_configurations/www/service-portal.html
    |
    v (Frappe build process: `bench build`)
sites/assets/common_configurations/service-portal/browser/
    |
    v (Frappe serve)
https://<site>/service-portal
```

### Comando de Frappe para construir assets

Despues de `npm run build`, normalmente se ejecuta:

```bash
bench build --app common_configurations
```

para que Frappe copie/colectee los assets a `sites/assets/...`.

---

## 5. Index HTML

`src/index.html:1-18`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>ServicePortal</title>
  <base href="/">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/x-icon" href="favicon.ico">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <app-root></app-root>
  <noscript>Please enable JavaScript to continue using this application.</noscript>
</body>
</html>
```

Notar:
- `<base href="/">` en source, pero Angular lo reemplaza por `/service-portal/` durante el build (segun `baseHref` en angular.json).
- La fuente Inter se carga desde Google Fonts via `<link>` (no por self-host).

---

## 6. Public assets

La carpeta `public/` se copia tal cual a `outputPath/browser/`:

```json
"assets": [
  { "glob": "**/*", "input": "public" }
]
```

Contenido tipico:
- `favicon.ico`
- Iconos PWA
- Imagenes default

Ubicacion fisica: `front_apps/service-portal/public/`.

---

## 7. Variables de entorno

**El proyecto no usa `environment.ts`**. Tampoco lee variables de entorno en el build.

Las URLs de API se construyen relativamente (`/api/method/...`, `/api/resource/...`), asumiendo que el frontend se sirve desde el mismo origen que Frappe. Esto es correcto porque Angular se sirve desde el propio Frappe site.

Si en el futuro se quisiera servir desde un dominio separado, habria que:
1. Crear `src/environments/environment.{ts,prod.ts}`.
2. Configurar `fileReplacements` en `angular.json`.
3. Hacer que `FrappeApiService.buildUrl()` use la base URL desde environment.

---

## 8. Service Worker (PWA)

El Service Worker esta **deshabilitado en runtime** pero **declarado en build**:

```typescript
// app.config.ts:13-17
// Service Worker disabled - Frappe doesn't serve these files correctly
// provideServiceWorker('ngsw-worker.js', {
//   enabled: !isDevMode(),
//   registrationStrategy: 'registerWhenStable:30000'
// })
```

```json
// angular.json:55
"serviceWorker": "ngsw-config.json"
```

El archivo `ngsw-config.json` existe en la raiz del proyecto. Pero como el provider esta comentado, el SW nunca se registra. Frappe tiene problemas sirviendo `ngsw-worker.js` desde una sub-ruta (probablemente por el `Content-Type` o el `Service-Worker-Allowed` header).

> Si se quiere reactivar el SW:
> 1. Descomentar el provider.
> 2. Validar que Frappe sirve `/service-portal/ngsw-worker.js` con MIME type correcto y header `Service-Worker-Allowed: /`.
> 3. Probablemente requiera configuracion adicional en `nginx.conf` de Frappe.

---

## 9. Testing

`package.json:11`:

```json
"test": "ng test"
```

`angular.json:77-79`:

```json
"test": {
  "builder": "@angular/build:unit-test"
}
```

El runner usado es **vitest** (`^4.0.8`), incluido en `devDependencies`. No hay archivos `.spec.ts` mas alla del template del bootstrap (`app.spec.ts`).

---

## 10. Notas y deuda tecnica

- **Service Worker fantasma**: se buildea pero no se usa. Quitar de `angular.json` o reactivar.
- **No environments**: si se necesita configurar URLs por entorno, hay que agregar el sistema.
- **`copy-html-entry` rompe en Windows**: usa `cp` POSIX. En Windows habria que usar `copyfiles` o un script equivalente.
- **No hay pipeline de CI/CD documentado**: probablemente se ejecuta manualmente `npm run build && bench build`.
- **Falta `.npmrc` con engines/registry fijo**: para reproducibilidad de instalacion.
- **`prefix: "app"`** (line 19 de angular.json): los componentes auto-generados usan `app-` como prefijo. Coherente con los selectores actuales.
- **No hay scripts de lint** (`ng lint` no esta en `scripts`). Solo prettier configurado (line 13-23 de package.json).
