# Guía de Configuración: Service Portal + Meet Scheduling

Esta guía te llevará paso a paso para configurar un Portal de Servicios funcional con agendamiento de citas.

## 📋 Requisitos Previos

- Frappe instalado y funcionando
- Apps `common_configurations` y `meet_scheduling` instalados
- Frontend Angular construido (`npm run build` en `front_apps/service-portal`)

---

## Paso 1: Crear Usuario de Prueba

### 1.1. Acceder a Frappe Desk
```
http://localhost:8000
```

### 1.2. Crear Usuario
1. Ve a **User** (búsqueda global o desde módulo)
2. Click **New**
3. Completa los campos:
   - **Email**: `usuario@test.com`
   - **First Name**: `Usuario`
   - **Last Name**: `Prueba`
   - **Send Welcome Email**: Desmarcar
   - **New Password**: `usuario123`
4. En la sección **Roles**:
   - Agregar rol: `Portal API User` (para acceso a APIs del portal)
5. **Save**

---

## Paso 2: Configurar Video Call Profile (Opcional)

Si quieres generar URLs de videoconferencia automáticamente:

### 2.1. Crear Video Call Profile
1. Ve a **Video Call Profile**
2. Click **New**
3. Completa:
   - **Profile Name**: `Google Meet`
   - **Provider**: `Google Meet`
   - **Create On**: `On Submit` (crea la reunión al confirmar la cita)
   - **API Key**: (si aplica, según provider)
4. **Save**

**Providers soportados**: Google Meet, Jitsi, Custom URL, etc.

---

## Paso 3: Crear Calendar Resource

### 3.1. Crear Availability Plan primero
1. Ve a **Availability Plan**
2. Click **New**
3. Completa:
   - **Plan Name**: `Horario Oficina`
   - **Timezone**: `America/Bogota` (o tu zona horaria)

4. En **Weekly Slots**, agrega slots para cada día:

   **Lunes**:
   - From Time: `09:00:00`
   - To Time: `12:00:00`
   - Capacity: `1`

   Agregar otro slot para la tarde:
   - From Time: `14:00:00`
   - To Time: `17:00:00`
   - Capacity: `1`

   Repetir para **Martes, Miércoles, Jueves, Viernes**

5. **Save**

### 3.2. Crear Calendar Resource
1. Ve a **Calendar Resource**
2. Click **New**
3. Completa:
   - **Resource Name**: `Sala Consulta 1`
   - **Resource Type**: `Room` (o `Person` si es para una persona)
   - **Availability Plan**: Seleccionar `Horario Oficina`
   - **Slot Duration**: `30` (minutos por slot)
   - **Video Call Profile**: Seleccionar `Google Meet` (si lo creaste)
4. **Save**

---

## Paso 4: Registrar Tool Type para Meet Scheduling

### 4.1. Crear Tool Type
1. Ve a **Tool Type**
2. Click **New**
3. Completa:
   - **Tool Name**: `meet_scheduling`
   - **Tool Label**: `Agendamiento de Citas`
   - **App Name**: `meet_scheduling`
   - **Description**: `Herramienta para agendar citas y reuniones`
   - **Icon**: (opcional, URL de un icono)
   - **Is Active**: ✓ Marcar
4. **Save**

---

## Paso 5: Crear Service Portal

### 5.1. Crear el Portal
1. Ve a **Service Portal**
2. Click **New**
3. Completa:

   **Información Básica**:
   - **Portal Name**: `portal-consultas` (slug único, sin espacios)
   - **Title**: `Portal de Consultas`
   - **Description**: `Portal para agendar consultas médicas`
   - **Is Active**: ✓ Marcar

   **Registro de Usuario**:
   - **Request Contact User Data**: ✓ Marcar (si quieres recolectar datos adicionales)
   - **Registration Title**: `Completa tu Perfil`
   - **Registration Description**: `Por favor proporciona tu información de contacto`

   **Estilos** (opcional):
   - **Primary Color**: `#667eea`
   - **Secondary Color**: `#764ba2`
   - **Logo**: URL o subir imagen
   - **Background Image**: URL o subir imagen

4. **No guardes todavía**, primero agrega las herramientas...

### 5.2. Agregar Herramientas al Portal

En la tabla **Portal Tools**:

1. Click **Add Row**
2. Completa:
   - **Tool Type**: Seleccionar `meet_scheduling`
   - **Label**: `Agendar Cita`
   - **Tool Description**: `Agenda tu cita con disponibilidad en tiempo real`
   - **Display Order**: `1`
   - **Is Enabled**: ✓ Marcar
   - **Button Color**: `#667eea` (opcional)

3. **Campos Personalizados** (aparecen automáticamente según el Tool Type):
   - **Calendar Resource**: Seleccionar `Sala Consulta 1`
   - **Show Calendar View**: ✓ Marcar
   - **Slot Duration Minutes**: `30`

4. Puedes agregar más herramientas si tienes otras Tool Types configurados

5. **Save** el Service Portal

---

## Paso 6: Acceder al Frontend

### 6.1. Construir el Frontend (si no lo hiciste)
```bash
cd /workspace/development/frappe-bench/apps/common_configurations/front_apps/service-portal
npm install
npm run build
```

### 6.2. Acceder al Portal
```
http://localhost:8000/service-portal
```

### 6.3. Flujo de Uso

1. **Login**:
   - Email: `usuario@test.com`
   - Password: `usuario123`
   - Click **Iniciar Sesión**

2. **Selector de Portales**:
   - Si solo tienes un portal, se auto-selecciona
   - Si tienes varios, verás una lista para elegir
   - Click en **Portal de Consultas**

3. **Registro de Contacto** (si está activado):
   - Completa tu nombre, teléfono, empresa
   - Click **Continuar**

4. **Vista del Portal**:
   - Verás el grid de herramientas disponibles
   - Click en **Agendar Cita**

5. **Agendar Cita**:
   - Selecciona una fecha de las próximas 2 semanas
   - Se cargarán los slots disponibles según el calendario
   - Selecciona un horario
   - Click **Confirmar Cita**
   - La cita se crea y aparece en "Mis Citas"

6. **Gestionar Citas**:
   - Ver todas tus citas agendadas
   - Ver enlaces de reunión (si configuraste Video Call Profile)
   - Cancelar citas si es necesario

---

## Paso 7: Verificar desde Frappe Desk

### 7.1. Ver Appointments
1. Ve a **Appointment** en Frappe Desk
2. Verás todas las citas creadas desde el portal
3. Estados posibles:
   - **Draft**: Recién creada (no debería haber en producción)
   - **Confirmed**: Confirmada por el usuario
   - **Completed**: Cita completada
   - **Cancelled**: Cita cancelada
   - **No-show**: Usuario no asistió

### 7.2. Ver User Contacts
1. Ve a **User Contact**
2. Verás todos los contactos registrados desde el portal
3. Cada contacto está vinculado a un User de Frappe

---

## Configuraciones Avanzadas

### Crear Múltiples Calendar Resources

Puedes crear varios recursos para diferentes servicios:

**Ejemplo: Consulta General**
- Resource Name: `Consulta General`
- Slot Duration: `30` min
- Availability Plan: `Horario Oficina`

**Ejemplo: Consulta Especializada**
- Resource Name: `Consulta Especializada`
- Slot Duration: `60` min
- Availability Plan: `Horario Especialista`

Luego en el Service Portal, puedes tener diferentes herramientas para cada tipo de consulta.

### Crear Múltiples Portales

Puedes crear portales diferentes para diferentes servicios:

**Portal Médico**:
- Herramientas: Consultas, Laboratorios, Resultados

**Portal Educativo**:
- Herramientas: Asesorías, Tutorías, Talleres

**Portal Corporativo**:
- Herramientas: Reuniones, Capacitaciones, Entrevistas

Cada portal puede tener su propia configuración de colores, logo y herramientas.

### Holidays y Excepciones

1. Ve a **Holiday List**
2. Crea una lista con días festivos
3. En **Calendar Resource**, asigna la Holiday List
4. Esos días no aparecerán como disponibles

### Capacity Management

En **Availability Plan** > **Weekly Slots**:
- **Capacity**: Número de citas simultáneas permitidas
- Ejemplo: Capacity `3` = 3 personas pueden agendar el mismo slot

---

## Troubleshooting

### No aparecen slots disponibles
1. Verifica que **Availability Plan** tiene slots configurados
2. Verifica que **Calendar Resource** está activo
3. Verifica la zona horaria (debe coincidir)
4. Revisa si hay appointments que bloquean el horario

### Error al crear cita
1. Verifica que el usuario tiene rol `Portal API User`
2. Revisa los logs de Frappe: `bench --site site1.local console`
3. Verifica que el Calendar Resource existe

### No se genera URL de reunión
1. Verifica que **Video Call Profile** está configurado
2. En Calendar Resource, verifica que **Video Call Profile** está seleccionado
3. Verifica que **Create On** está en `On Submit`

### Usuario no puede acceder
1. Verifica que el usuario tiene rol `Portal API User`
2. Verifica que el Service Portal está marcado como **Is Active**
3. Verifica que las herramientas están marcadas como **Is Enabled**

---

## Comandos Útiles

### Reiniciar Frappe
```bash
cd /workspace/development/frappe-bench
bench restart
```

### Reconstruir Frontend
```bash
cd apps/common_configurations/front_apps/service-portal
npm run build
bench --site site1.local clear-cache
```

### Ver Logs
```bash
bench --site site1.local console
```

### Migrar Cambios
```bash
bench --site site1.local migrate
```

---

## Resumen del Flujo Completo

```
Usuario → Login → Portal Selector → Portal View → Tool (Meet Scheduling)
                                                   ↓
                                          Selecciona Fecha
                                                   ↓
                                          Selecciona Slot
                                                   ↓
                                          Confirma Cita
                                                   ↓
                                    Appointment (Draft) → Submit → Confirmed
                                                   ↓
                                    Generate Meeting (si está configurado)
                                                   ↓
                                          Meeting URL generada
```

---

## Próximos Pasos

1. ✅ Configurar Service Portal
2. ✅ Configurar Calendar Resource
3. ✅ Probar flujo completo
4. 📧 Configurar notificaciones por email (opcional)
5. 📱 Instalar como PWA en móvil
6. 🎨 Personalizar estilos del portal
7. 📊 Crear reportes de citas
8. 🔔 Agregar recordatorios automáticos

---

## Soporte

Si tienes problemas:
1. Revisa los logs de Frappe
2. Verifica la consola del navegador (F12)
3. Revisa que todas las dependencias están instaladas
4. Verifica los permisos del usuario

¡Listo! Ahora tienes un sistema completo de agendamiento de citas funcionando. 🎉
