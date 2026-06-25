# Guía de Deploy del Ecosistema Nexora

Documentación del proceso para actualizar las apps Frappe del bench y el sitio web estático (`nexora-web-page`) en el servidor de producción.

---

## Información del servidor

| Dato | Valor |
|---|---|
| Servidor | Hetzner |
| IP | `5.161.183.218` |
| Usuario | `frappe` |
| Path del bench (en server) | `/home/frappe/frappe-bench` |
| Path del bench (en dev container) | `/workspace/development/frappe-bench` |
| Path del sitio web estático | `/var/www/nexora-web-page` |
| Sitios Frappe activos | `lex.nexoraonline.co`, `demo.nexoraonline.co`, `app.nexoraonline.co` (Tenant Hub) |
| Dominio del sitio web | `nexoraonline.co` |
| SSL | Let's Encrypt vía Certbot |

### Apps Frappe instaladas

| App | Repositorio |
|---|---|
| `frappe` | Frappe Framework (core) |
| `common_configurations` | Infraestructura compartida (portal, auth, settings) |
| `meet_scheduling` | Agendamiento de citas |
| `lex_app` | Casos legales |
| `logbook` | Bitácoras y trámites |
| `pqr_management` | PQRs (`pqrs_management` en GitHub, package interno `pqr_management`) |
| `document_creation` | Creación de documentos |

---

## Conectarse al servidor

```bash
ssh frappe@5.161.183.218
cd ~/frappe-bench
```

---

## 1. Actualizar las apps Frappe existentes

### Caso simple — sin cambios de schema

Cuando los cambios son solo de código (sin refactors de DocTypes ni renombres):

```bash
bench update --pull --no-backup
```

Este comando:
- Hace `git pull` en todas las apps
- Corre `bench migrate` en todos los sitios
- Compila assets nativos de Frappe (`bench build`)
- Reinicia los servicios

> **Flags importantes**:
> - `--pull`: solo `git pull`, NO actualiza Frappe core (recomendado para deploy de tus apps)
> - `--no-backup`: omite el backup automático (úsalo solo si confías en git; quítalo si quieres backup automático)

### Caso con cambios de schema — cleanup pre-migrate (CRÍTICO)

Cuando hay refactors que renombran DocTypes, eliminan child tables o cambian tipos de campos, el `migrate` puede fallar o dejar data inconsistente. Hay que **limpiar la data vieja antes** de migrar.

**Antes de hacer pull**, identifica si hay refactors mirando el changelog reciente:

```bash
cd apps/common_configurations
git log --oneline -20
```

Busca commits con palabras como "refactor", "rename", "remove DocType", "drop field".

**Ejecuta el cleanup en el shell de Frappe** (uno por sitio afectado):

```bash
bench --site <tu-site> console
```

Pega el bloque Python que corresponda al refactor:

#### Ejemplo 1: Refactor Portal Quick Links → External Link

```python
import frappe

# Eliminar Portal Quick Link Items con esquema viejo (campos label/url/icon directos)
frappe.db.sql("DELETE FROM `tabPortal Quick Link Item`")
for n in frappe.get_all("Portal Quick Links", pluck="name"):
    frappe.delete_doc("Portal Quick Links", n, force=1)

frappe.db.commit()
print("✅ Cleanup Portal Quick Links OK")
exit()
```

#### Ejemplo 2: Refactor PQR Tool Type → PQR Type Set

```python
import frappe

# Eliminar custom field viejo (Table → PQR Tool Type) que ya no aplica
if frappe.db.exists("Custom Field", "Service Portal Tool-pqr_allowed_types"):
    frappe.delete_doc("Custom Field", "Service Portal Tool-pqr_allowed_types", force=1)

# Eliminar DocType viejo y su tabla
if frappe.db.exists("DocType", "PQR Tool Type"):
    frappe.db.sql("DROP TABLE IF EXISTS `tabPQR Tool Type`")
    frappe.delete_doc("DocType", "PQR Tool Type", force=1)

frappe.db.commit()
print("✅ Cleanup PQR Tool Type OK")
exit()
```

**Después del cleanup**, corre `bench update --pull` normalmente.

### Build del Service Portal Angular (siempre)

`bench update` compila los assets nativos de Frappe pero **NO la SPA Angular** del Service Portal. Si tu deploy incluye cambios en el frontend del portal:

```bash
cd /workspace/development/frappe-bench/apps/common_configurations/front_apps/service-portal
npm install     # solo necesario si cambió package.json
npm run build
cd /workspace/development/frappe-bench
```

El build genera los chunks en `apps/common_configurations/common_configurations/public/service-portal/` que el servidor sirve estáticamente.

### Resumen del flujo de actualización

```bash
ssh frappe@5.161.183.218
cd ~/frappe-bench

# 1. (Si aplica) Cleanup pre-migrate
bench --site <tu-site> console
# pega el bloque Python correspondiente y exit()

# 2. Update (pull + migrate + build assets + restart)
bench update --pull --no-backup

# 3. Build del Service Portal Angular (si hubo cambios en frontend)
cd apps/common_configurations/front_apps/service-portal && npm run build
cd /workspace/development/frappe-bench
```

---

## 2. Instalar una nueva app Frappe

Para apps que aún no existen en el servidor (ejemplo: instalación inicial de `pqr_management`):

```bash
ssh frappe@5.161.183.218
cd ~/frappe-bench

# 1. Obtener la app desde GitHub
bench get-app https://github.com/<owner>/<repo> --branch <branch>
# Ejemplo real:
# bench get-app https://github.com/sebastianOrtiz/pqrs_management --branch main

# Frappe lee el app_name del hooks.py y crea apps/<app_name>/.
# Importante: el nombre del repo puede diferir del app_name (ej: pqrs_management → pqr_management).

# 2. Instalar la app en el sitio
bench --site <tu-site> install-app <app_name>
# Ejemplo: bench --site demo.nexoraonline.co install-app pqr_management

# 3. Migrar para crear DocTypes y cargar fixtures
bench --site <tu-site> migrate

# 4. Limpiar cache y reiniciar
bench --site <tu-site> clear-cache
bench restart

# 5. (Si aplica) Rebuild del Service Portal Angular si la nueva app aporta una tool
cd apps/common_configurations/front_apps/service-portal && npm run build
cd /workspace/development/frappe-bench
```

### Verificar instalación

```bash
bench --site <tu-site> list-apps
```

Debe mostrar la app nueva en la lista.

### Desinstalar una app (si necesitas revertir)

```bash
bench --site <tu-site> uninstall-app <app_name> --yes
bench remove-app <app_name>  # quita la carpeta del bench
```

---

## 3. Actualizar el sitio web estático (`nexora-web-page`)

Sirve la landing y la guía SPA del producto. Es un repo aparte, no es una app Frappe.

```bash
cd /var/www/nexora-web-page

# Si da "permission denied" al hacer git pull:
sudo chown -R frappe:frappe .git

git pull origin main
```

> ⚠️ **NO uses `sudo git pull`** — eso usaría la SSH key de root (que no tiene acceso a GitHub) y fallaría. Siempre `git pull` como usuario `frappe`.

**No requiere build ni restart** — son archivos estáticos servidos directamente por nginx.

### Estructura del sitio web

```
/var/www/nexora-web-page/
├── index.html              # Landing principal
├── guia/index.html         # Guía de usuario SPA
├── css/                    # styles.css + guia.css
├── js/                     # main.js + guia.js
└── img/                    # Imágenes del sitio
```

### Configuración de nginx

El archivo `/etc/nginx/conf.d/nexora-landing.conf` define:
- Server `nexoraonline.co` y `www.nexoraonline.co` en puerto 443 con SSL
- Redirect HTTP → HTTPS
- `root /var/www/nexora-web-page`

Si necesitas editarlo:

```bash
sudo nano /etc/nginx/conf.d/nexora-landing.conf
sudo nginx -t                    # validar config
sudo systemctl reload nginx      # aplicar
```

### Verificar el deploy

- https://nexoraonline.co/ — landing principal
- https://nexoraonline.co/guia/ — guía de usuario

Si no ves los cambios, limpia caché del navegador (Ctrl+Shift+R) o abre en modo incógnito.

---

## 4. Troubleshooting

### `migrate` falla con error de DocType ya existente

Frappe a veces no detecta cambios en el JSON. Fuerza el reload:

```bash
bench --site <tu-site> reload-doctype "<DocType Name>"
bench --site <tu-site> migrate
```

### `migrate` falla por integrity error (FK constraint)

Generalmente es un refactor de schema que necesita cleanup previo. Revisa la sección **"Cleanup pre-migrate"** arriba.

### Custom Fields no aparecen en el admin después de migrate

```bash
bench --site <tu-site> execute "frappe.reload_doctype('Service Portal Tool')"
bench --site <tu-site> clear-cache
bench restart
```

Y refresca el admin con **Ctrl+Shift+R**.

### `git pull` da "permission denied" en `.git/`

Algún archivo dentro de `.git/` quedó como root (por un `sudo` previo):

```bash
sudo chown -R frappe:frappe <path-del-repo>/.git
```

### Service Portal muestra UI vieja después de update

El build de Angular no se aplicó. Recompila:

```bash
cd apps/common_configurations/front_apps/service-portal
npm run build
cd /workspace/development/frappe-bench
bench restart
```

Y refresca el navegador con **Ctrl+Shift+R**.

### Revertir un deploy malo

Si el último `bench update` rompe algo:

```bash
cd apps/<app>
git log --oneline -5         # encuentra el commit anterior
git reset --hard <hash>      # vuelve al commit estable
cd /workspace/development/frappe-bench
bench --site <tu-site> migrate   # re-aplica migrations al estado anterior
bench restart
```

> ⚠️ `git reset --hard` descarta cambios locales. Solo úsalo si estás seguro.

### Logs útiles cuando algo falla

```bash
# Logs de Frappe en general
tail -f /workspace/development/frappe-bench/logs/web.log
tail -f /workspace/development/frappe-bench/logs/worker.log

# Log del scheduler (tareas programadas)
tail -f /workspace/development/frappe-bench/logs/scheduler.log

# Errores del sitio
tail -f /workspace/development/frappe-bench/sites/<tu-site>/logs/web.log
```

---

## 5. Checklist post-deploy

Después de cada actualización, verifica:

- [ ] El sitio Frappe carga (`/app` del sitio)
- [ ] El Service Portal carga (`/service-portal/portal/<nombre>`)
- [ ] Los DocTypes nuevos aparecen en el sidebar del admin
- [ ] Los fixtures se aplicaron (tipos pre-cargados, roles, custom fields)
- [ ] La SPA Angular muestra los componentes nuevos (refresca con Ctrl+Shift+R)
- [ ] El sitio web estático carga (`https://nexoraonline.co` y `/guia/`)
- [ ] No hay errores nuevos en `logs/web.log` ni `logs/worker.log`

---

## 6. Comandos rápidos de referencia

```bash
# Estado de un sitio
bench --site <tu-site> doctor

# Listar apps instaladas en un sitio
bench --site <tu-site> list-apps

# Backup manual
bench --site <tu-site> backup --with-files

# Ver versión de Frappe y de cada app
bench version

# Reiniciar servicios
bench restart

# Compilar assets de Frappe (nativo, no Angular)
bench build

# Eliminar cache
bench --site <tu-site> clear-cache
bench --site <tu-site> clear-website-cache
```

---

## 7. Renovación SSL (informativo)

Certbot está configurado con auto-renovación. Para verificar:

```bash
sudo certbot certificates
sudo systemctl status certbot.timer
```

Para forzar renovación manual (rara vez necesario):

```bash
sudo certbot renew
sudo systemctl reload nginx
```

---

## 8. Crear un sitio Frappe nuevo + emitir SSL

> **Importante**: en este server, `/etc/nginx/conf.d/frappe-bench.conf` es una **copia estática manual** del config generado por `bench setup nginx`. Cualquier intento de regenerar con `bench setup nginx` y copiar el archivo **sobreescribirá los server blocks existentes** (y actualmente bench genera el archivo con `server_name` vacíos — bug pendiente de investigar). Por eso el flujo seguro es **añadir manualmente** el server block del sitio nuevo al final del archivo, sin tocar lo que ya funciona.

### Paso 0 — Prerequisitos

- DNS: A record del subdominio apuntando a `5.161.183.218`. Verifica con `dig <subdominio>.nexoraonline.co +short`.
- Acceso SSH como usuario `frappe`.
- MariaDB root password a mano.

### Paso 1 — Crear el sitio Frappe

```bash
ssh frappe@5.161.183.218
cd ~/frappe-bench

bench new-site <nuevo-sitio>.nexoraonline.co \
  --admin-password '<elige-uno>' \
  --mariadb-root-password '<root-mariadb>'
```

### Paso 2 — Instalar las apps necesarias

Mínimo `common_configurations`. Para un Tenant Hub eso basta. Para un sitio que sirva portales (con tools de PQR/Bitácora/etc.), añade las apps correspondientes.

```bash
bench --site <nuevo-sitio>.nexoraonline.co install-app common_configurations
# Si aplica:
# bench --site <nuevo-sitio>.nexoraonline.co install-app meet_scheduling
# bench --site <nuevo-sitio>.nexoraonline.co install-app pqr_management
# ...
```

### Paso 3 — Emitir el certificado SSL

```bash
sudo -H bench setup lets-encrypt <nuevo-sitio>.nexoraonline.co
```

Esto:
- Pide email para alertas de Let's Encrypt y aceptar términos.
- Emite el certificado y lo guarda en `/etc/letsencrypt/live/<nuevo-sitio>.nexoraonline.co/`.
- Escribe los paths del cert en `sites/<nuevo-sitio>.nexoraonline.co/site_config.json`.

> Si falla con `connection refused` o `timeout`: revisa que el puerto 80 esté accesible y nginx esté arriba (`sudo systemctl status nginx`). Si falla con `not yet propagated`: espera 5 min para el DNS y reintenta.

### Paso 4 — Añadir el server block manualmente a nginx

`bench setup lets-encrypt` emite el cert pero **no actualiza** `/etc/nginx/conf.d/frappe-bench.conf` (porque ese archivo es manual). Hay que añadir el bloque a mano. Copia/pega esto reemplazando `<DOMINIO>`:

```bash
sudo tee -a /etc/nginx/conf.d/frappe-bench.conf > /dev/null <<'EOF'

# === <DOMINIO> — añadido manualmente $(date +%F) ===
server {
    listen 443 ssl;

    server_name <DOMINIO>;

    root /home/frappe/frappe-bench/sites;

    proxy_buffer_size 128k;
    proxy_buffers 4 256k;
    proxy_busy_buffers_size 256k;

    ssl_certificate      /etc/letsencrypt/live/<DOMINIO>/fullchain.pem;
    ssl_certificate_key  /etc/letsencrypt/live/<DOMINIO>/privkey.pem;
    ssl_session_timeout  5m;
    ssl_session_cache shared:SSL:10m;
    ssl_session_tickets off;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers EECDH+AESGCM:EDH+AESGCM;
    ssl_ecdh_curve secp384r1;
    ssl_prefer_server_ciphers on;

    add_header X-Frame-Options "SAMEORIGIN";
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "same-origin, strict-origin-when-cross-origin";

    location /assets { try_files $uri =404; add_header Cache-Control "max-age=31536000"; }
    location ~ ^/protected/(.*) { internal; try_files /$host/$1 =404; }

    location /socket.io {
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Frappe-Site-Name $host;
        proxy_set_header Origin $scheme://$http_host;
        proxy_set_header Host $host;
        proxy_pass http://frappe-bench-socketio-server;
    }

    location / {
        rewrite ^(.+)/$ $1 permanent;
        rewrite ^(.+)/index\.html$ $1 permanent;
        rewrite ^(.+)\.html$ $1 permanent;
        location ~* ^/files/.*.(htm|html|svg|xml) {
            add_header Content-disposition "attachment";
            try_files /$host/public/$uri @webserver;
        }
        try_files /$host/public/$uri @webserver;
    }

    location @webserver {
        proxy_http_version 1.1;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Frappe-Site-Name $host;
        proxy_set_header Host $host;
        proxy_set_header X-Use-X-Accel-Redirect True;
        proxy_read_timeout 120;
        proxy_redirect off;
        proxy_pass http://frappe-bench-frappe;
    }

    error_page 502 /502.html;
    location /502.html {
        root /home/frappe/.local/lib/python3.10/site-packages/bench/config/templates;
        internal;
    }

    sendfile on; keepalive_timeout 15;
    client_max_body_size 50m; client_body_buffer_size 16K; client_header_buffer_size 1k;
    gzip on; gzip_http_version 1.1; gzip_comp_level 5; gzip_min_length 256; gzip_proxied any; gzip_vary on;
}

server {
    listen 80;
    server_name <DOMINIO>;
    return 301 https://$host$request_uri;
}
EOF
```

> ⚠️ **NO uses un archivo separado** (`/etc/nginx/conf.d/frappe-<sitio>.conf`). Probado y rompe el orden de SNI: el archivo separado se carga alfabéticamente antes que `frappe-bench.conf` y pasa a ser "default server" para puerto 443, sirviendo su cert a sitios que no debería. Mantén todo en `frappe-bench.conf`.

> ⚠️ **NO incluyas `listen [::]:443 ssl ipv6only=on;` en el nuevo bloque**: solo el primer server block del puerto puede declarar `ipv6only=on`. Si lo agregas, nginx ignora el flag y puede provocar conflictos. Usa solo `listen 443 ssl;` para IPv4 (basta).

### Paso 5 — Validar y recargar

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Si `nginx -t` falla, **NO recargues**. Edita `/etc/nginx/conf.d/frappe-bench.conf` y corrige el error que reporta.

### Paso 6 — Verificar

```bash
# Cert correcto
echo | openssl s_client -servername <DOMINIO> -connect <DOMINIO>:443 2>/dev/null \
  | openssl x509 -noout -subject

# Responde 200/301
curl -I https://<DOMINIO>/

# Los OTROS sitios siguen funcionando (sanity check)
for s in nexoraonline.co demo.nexoraonline.co lex.nexoraonline.co; do
  curl -sI https://$s/ -o /dev/null -w "$s → %{http_code}\n" --max-time 5
done
```

Esperado:
- `subject=CN = <DOMINIO>`
- `curl` responde sin error de SSL.
- Los otros sitios siguen en 200.

### Recovery — si rompes nginx por accidente

`certbot` guarda backups automáticos del config nginx cada vez que toca algo. Para restaurar:

```bash
# Lista los backups disponibles (más reciente al final)
sudo ls -lt /var/lib/letsencrypt/backups/ | head

# Restaurar el más reciente
sudo cp /var/lib/letsencrypt/backups/<timestamp>/frappe-bench.conf_<N> \
        /etc/nginx/conf.d/frappe-bench.conf

sudo nginx -t && sudo systemctl reload nginx
```

Verifica que los sitios afectados vuelvan a responder antes de seguir.

### Bug pendiente (no urgente)

`bench setup nginx` genera `~/frappe-bench/config/nginx.conf` con `server_name` vacíos — no se puede usar para regenerar `/etc/nginx/conf.d/frappe-bench.conf` automáticamente. Posibles fixes pendientes de investigar:

1. Actualizar `bench` (`pip3 install --upgrade frappe-bench`) — la propia CLI sugiere 5.31.0.
2. Revisar si `dns_multitenant` está correctamente seteado (`cat sites/common_site_config.json | grep dns_multitenant` debe dar `true`).
3. Investigar el template Jinja2 que genera el config.

Cuando se resuelva, podríamos symlinkar `/etc/nginx/conf.d/frappe-bench.conf → ~/frappe-bench/config/nginx.conf` y olvidarnos del paso 4 manual.
