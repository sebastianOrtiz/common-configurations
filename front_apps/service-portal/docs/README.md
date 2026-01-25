# Documentación del Service Portal

## Descripción General

El **Service Portal** es una aplicación Angular 21 que proporciona un portal de autoservicio para usuarios, integrado con Frappe Framework. Permite a los usuarios acceder a diferentes herramientas y servicios según su configuración de portal.

## Índice de Documentación

1. [Arquitectura del Sistema](./architecture.md) - Estructura general y stack tecnológico
2. [Componentes](./components.md) - Documentación de los componentes principales
3. [Servicios y Modelos](./services.md) - Servicios Angular y modelos de datos
4. [Sistema de Estilos](./styling.md) - Diseño, temas y variables CSS
5. [Sistema de Herramientas](./tools-system.md) - Cómo funcionan las herramientas dinámicas
6. [Agregar Nuevas Funcionalidades](./adding-features.md) - Guía paso a paso
7. [Integración con Frappe](./frappe-integration.md) - API y comunicación con backend

## Stack Tecnológico

### Frontend
- **Angular 21** - Framework principal
- **Standalone Components** - Arquitectura sin NgModules
- **Signals** - Sistema reactivo de Angular
- **RxJS** - Programación reactiva
- **SCSS** - Preprocesador CSS
- **TypeScript** - Lenguaje de programación

### Backend
- **Frappe Framework** - Framework Python
- **DocTypes** - Sistema de base de datos
- **REST API** - Comunicación con frontend

### Herramientas de Desarrollo
- **Angular CLI** - Herramientas de desarrollo
- **NPM** - Gestor de paquetes
- **Git** - Control de versiones

## Características Principales

### 1. Sistema Multi-Portal
- Soporte para múltiples portales por instancia
- Configuración independiente por portal
- Personalización de colores y logos

### 2. Sistema de Herramientas Dinámico
- Carga dinámica de componentes
- Configuración flexible por portal
- Sistema de routing modular

### 3. Autenticación Integrada
- Login con email y password
- Registro de nuevos contactos
- Gestión de sesiones

### 4. Herramientas Implementadas
- **Meet Scheduling** - Sistema de agendamiento de citas con calendario mensual

## Inicio Rápido

### Instalación

```bash
cd /workspace/development/frappe-bench/apps/common_configurations/front_apps/service-portal
npm install
```

### Desarrollo

```bash
npm run start  # Servidor de desarrollo en http://localhost:4200
```

### Build de Producción

```bash
npm run build  # Compila a common_configurations/public/service-portal
```

### Estructura de Directorios

```
service-portal/
├── src/
│   ├── app/
│   │   ├── core/              # Servicios, guardias, interceptores
│   │   ├── features/          # Componentes de funcionalidades
│   │   │   ├── auth/         # Autenticación
│   │   │   ├── portal/       # Portal y navegación
│   │   │   └── tools/        # Herramientas dinámicas
│   │   ├── shared/           # Componentes compartidos
│   │   └── app.routes.ts     # Configuración de rutas
│   ├── styles.scss           # Estilos globales
│   └── index.html            # HTML principal
├── docs/                     # Esta documentación
└── angular.json             # Configuración de Angular
```

## Flujo de Navegación

1. **Login** (`/login`) - Autenticación del usuario
2. **Selección de Portal** (`/portal-selector`) - Si tiene múltiples portales
3. **Vista de Portal** (`/portal/:portalName`) - Vista principal con herramientas
4. **Herramienta** (`/portal/:portalName/tool/:toolType`) - Herramienta específica

## Variables de Entorno

El frontend se conecta al backend de Frappe en:
- Desarrollo: `http://localhost:8000`
- Producción: Se sirve desde el mismo origen que Frappe

## Próximos Pasos

Para comenzar a trabajar con el código:
1. Lee la [Arquitectura del Sistema](./architecture.md)
2. Revisa los [Componentes principales](./components.md)
3. Consulta [Cómo agregar nuevas funcionalidades](./adding-features.md)
