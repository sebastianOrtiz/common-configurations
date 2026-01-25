# Formularios Dinámicos - User Contact

El formulario de registro de contactos se genera **dinámicamente** basándose en la configuración del DocType "User Contact" en Frappe.

## 📋 Cómo Funciona

### 1. Metadata del DocType
El frontend obtiene automáticamente la metadata del DocType "User Contact" usando:
```typescript
frappe.desk.form.load.getdoctype?doctype=User Contact
```

### 2. Generación de Campos
- El formulario se genera en tiempo real según los campos configurados
- Respeta propiedades como: `reqd`, `default`, `description`, `options`
- Filtra campos ocultos o de solo lectura
- Ordena según `field_order`

### 3. Validación Automática
- Campos requeridos (`reqd=1`) se validan automáticamente
- Formato de email se valida si el campo es tipo Email
- Valores por defecto se aplican al cargar el formulario

## 🔧 Configuración Actual

### Campos del User Contact

Según `/apps/common_configurations/common_configurations/common_configurations/doctype/user_contact/user_contact.json`:

| Campo | Tipo | Requerido | Opciones |
|-------|------|-----------|----------|
| **full_name** | Data | ✓ | Nombre completo |
| **document_type** | Select | ✓ | "Cedula de ciudadania" o "NIT" |
| **document** | Data | ✓ | Número de documento |
| **phone_number** | Data | - | Número de teléfono |
| **email** | Data (Email) | - | Correo electrónico |
| **gender** | Select | - | "No especifica", "Femenino", "Masculino", "Otro" |

## ➕ Agregar Campos Personalizados

### Opción 1: Customizar DocType (Recomendado)

1. **En Frappe Desk**, ve a:
   ```
   Customize Form → User Contact
   ```

2. **Agregar nuevo campo custom**:
   ```
   Field Type: Data
   Label: Dirección
   Field Name: custom_address
   Required: 0
   Description: Dirección completa del contacto
   ```

3. **Guardar** y el campo aparecerá automáticamente en el frontend

### Opción 2: Modificar el DocType JSON

Edita el archivo `user_contact.json` y agrega un nuevo campo:

```json
{
  "fieldname": "custom_address",
  "fieldtype": "Data",
  "label": "Dirección",
  "description": "Dirección completa del contacto",
  "reqd": 0
}
```

Luego ejecuta:
```bash
bench --site site1.local migrate
```

## 📝 Field Types Soportados

El formulario dinámico soporta los siguientes tipos de campo:

| Field Type | HTML Element | Notas |
|------------|--------------|-------|
| **Data** | `<input type="text">` | Texto corto |
| **Int** | `<input type="number">` | Números enteros |
| **Float** | `<input type="number">` | Números decimales |
| **Currency** | `<input type="number">` | Moneda |
| **Email** | `<input type="email">` | Email con validación |
| **Phone** | `<input type="tel">` | Teléfono |
| **Date** | `<input type="date">` | Selector de fecha |
| **Datetime** | `<input type="datetime-local">` | Fecha y hora |
| **Time** | `<input type="time">` | Hora |
| **Select** | `<select>` | Dropdown con opciones |
| **Check** | `<input type="checkbox">` | Checkbox |
| **Text** | `<textarea rows="3">` | Texto mediano |
| **Small Text** | `<textarea rows="3">` | Texto mediano |
| **Long Text** | `<textarea rows="6">` | Texto largo |

### Campos NO Soportados
Los siguientes tipos no aparecen en el formulario:
- Section Break, Column Break, Tab Break
- Table, Table MultiSelect
- Attach, Attach Image
- HTML, Markdown Editor
- Signature
- Campos ocultos (`hidden=1`)
- Campos de solo lectura (`read_only=1`)

## 🎨 Personalización Avanzada

### Ejemplo 1: Campo de Selección con Múltiples Opciones

```json
{
  "fieldname": "custom_city",
  "fieldtype": "Select",
  "label": "Ciudad",
  "options": "Bogotá\nMedellín\nCali\nBarranquilla\nCartagena",
  "reqd": 1
}
```

### Ejemplo 2: Campo Numérico con Descripción

```json
{
  "fieldname": "custom_age",
  "fieldtype": "Int",
  "label": "Edad",
  "description": "Edad del contacto en años",
  "reqd": 0
}
```

### Ejemplo 3: Campo de Fecha con Valor Por Defecto

```json
{
  "fieldname": "custom_registration_date",
  "fieldtype": "Date",
  "label": "Fecha de Registro",
  "default": "Today",
  "reqd": 1
}
```

## 🔄 Flujo Técnico

```
1. Usuario accede al portal
   ↓
2. Si requiere registro de contacto
   ↓
3. Frontend llama a portal.service.getUserContactFields()
   ↓
4. Servicio llama a frappe.desk.form.load.getdoctype
   ↓
5. Frappe devuelve metadata del DocType
   ↓
6. Frontend filtra campos válidos
   ↓
7. Genera formulario dinámicamente
   ↓
8. Usuario llena datos
   ↓
9. Validación automática
   ↓
10. POST a /api/resource/User Contact
```

## 🐛 Debugging

### Ver campos que se están cargando

En la consola del navegador:
```javascript
// Inspeccionar los campos cargados
console.log($0.__ngContext__[8].fields())
```

### Ver datos del formulario
```javascript
// Ver datos actuales del formulario
console.log($0.__ngContext__[8].formData())
```

### Llamar la API manualmente
```bash
curl -X POST http://localhost:8000/api/method/frappe.desk.form.load.getdoctype \
  -H "Content-Type: application/json" \
  -d '{"doctype": "User Contact", "with_parent": 1}' \
  -b cookies.txt
```

## 📊 Casos de Uso

### Caso 1: Portal Médico
Agregar campos custom:
- `custom_blood_type` (Select): Tipo de sangre
- `custom_allergies` (Text): Alergias
- `custom_emergency_contact` (Data): Contacto de emergencia

### Caso 2: Portal Educativo
Agregar campos custom:
- `custom_institution` (Data): Institución educativa
- `custom_grade` (Select): Grado
- `custom_parent_email` (Email): Email del padre

### Caso 3: Portal Corporativo
Agregar campos custom:
- `custom_department` (Select): Departamento
- `custom_employee_id` (Data): ID de empleado
- `custom_manager` (Link): Gerente directo

## ⚠️ Consideraciones Importantes

1. **No modifiques campos estándar**: Los campos `full_name`, `document_type`, `document`, etc. son parte del core. Usa campos custom (prefijo `custom_`)

2. **Nomenclatura de campos custom**: Frappe automáticamente agrega el prefijo `custom_` cuando creas campos desde "Customize Form"

3. **Migración**: Si modificas el JSON directamente, ejecuta `bench migrate`

4. **Cache**: Después de agregar campos, limpia el cache del navegador y de Frappe:
   ```bash
   bench --site site1.local clear-cache
   ```

5. **Permisos**: El rol `Portal API User` debe tener permisos para crear User Contact

## 🚀 Ventajas del Sistema Dinámico

✅ **Sin código frontend**: Agrega campos sin tocar Angular
✅ **Configuración centralizada**: Todo desde Frappe
✅ **Validación automática**: Respeta reglas del DocType
✅ **Multi-tenant**: Cada sitio puede tener campos diferentes
✅ **Fácil mantenimiento**: Cambios sin deployment

## 🔗 Referencias

- [user_contact.json](common_configurations/common_configurations/doctype/user_contact/user_contact.json)
- [contact-registration.component.ts](front_apps/service-portal/src/app/features/portal/contact-registration/contact-registration.component.ts)
- [portal.service.ts](front_apps/service-portal/src/app/core/services/portal.service.ts)

---

**Nota**: Este sistema es extensible a otros DocTypes si necesitas formularios dinámicos adicionales.
