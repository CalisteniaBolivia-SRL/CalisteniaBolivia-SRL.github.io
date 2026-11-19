# Datos de los módulos del centro de mando (Firebase + ingreso con el ERP)

Los módulos **Legal**, **Cuentas por pagar** (en Administración) y el **CRM de los ATC** (en Comercial y Atención al Cliente) guardan sus datos en Firebase, proyecto **Centro de Comando** (`centro-de-comando-a57cf`). **Reportes** y los demás tableros leen del MCP de Calistenia, como siempre.

## Cómo se ingresa

Como siempre: **usuario y contraseña del ERP** en el portal. Qué ve cada persona lo deciden sus permisos en la página **/centro_mando** del ERP:

| Permiso del ERP | Qué habilita |
|---|---|
| `atencion` | **ATC Central** (un solo usuario, el que usan Eliana y Mauricio): dirige a los ATC, reparte clientes, deja tareas y guiones, ve resultados y comisiones, y Atención y retención. |
| `atc` | **ATC de sucursal** (22, dos por sucursal): su CRM, con los clientes antiguos que le tocan, sus seguimientos, tareas y comisión. |
| `legal` | Legal: contratos, permisos, casos y plazos. |
| `administracion` | Administración, incluida Cuentas por pagar. |
| `reportes` | Reportes. |
| `todo` | Todo lo anterior. |

Los permisos `atc` y `legal` hay que crearlos en /centro_mando del ERP y asignarlos a los usuarios que correspondan.

Al ingresar, el portal llama al **puente** (Cloud Function `erpLogin`, en `functions/`): confirma el mismo usuario y contraseña contra el ERP, lee sus permisos de /centro_mando y abre la sesión de datos de Firebase con esos permisos. No guarda contraseñas. La sesión dura 30 días; los cambios de permisos en el ERP se aplican al volver a ingresar.

Cada ATC aparece en **Comercial → Equipo** la primera vez que entra; ATC Central le asigna sus sucursales y su meta.

## Instalación del puente (una sola vez)

Requiere el **plan Blaze** de Firebase (las Cloud Functions lo exigen para conectarse al ERP). El uso del centro de mando entra en la capa gratuita.

1. Consola de Firebase → proyecto Centro de Comando → **Actualizar a Blaze** y elegir la cuenta de facturación.
2. Publicar la función y las reglas (desde una sesión con acceso al proyecto):
   ```
   gcloud functions deploy erpLogin --gen2 --runtime nodejs20 --region southamerica-east1 \
     --source functions --entry-point erpLogin --trigger-http --allow-unauthenticated --project centro-de-comando-a57cf
   ```
   y dar al servicio de la función el rol **Creador de tokens de cuenta de servicio** sobre sí mismo (para firmar las sesiones).
3. Publicar `firestore.rules` (Firestore → Reglas).

## Notas

- **Comisiones:** se calculan cruzando los contactos registrados por cada ATC con las ventas de `listar_ventas` (MCP).
- **Clientes antiguos:** `clientes_vencidos` del MCP entrega hasta 180 días; el CRM toma los vencidos hace entre 1 y 6 meses.

## Redes sociales (permiso `marketing`)

Tablero **Redes sociales** (`redes.html`). Cada comentario nuevo en las páginas de Facebook y las cuentas de Instagram conectadas se responde solo, con humor y con los datos que Marketing carga en *Configuración* (por país: Bolivia y Paraguay). Las críticas se responden con calma y se llevan a privado o al WhatsApp. Los casos delicados (lesiones, cobros, denuncias, insultos) quedan en *Por aprobar*. TikTok no permite responder por API: se pega el comentario y se copia el borrador.

Piezas (en `functions/`):
- `metaWebhook`: recibe los avisos de Meta (firma verificada con el secreto de la app).
- `rsNuevoComentario` / `rsComentarioCambio`: redactan la respuesta con Claude (`redes-ia.js`, modelo `claude-opus-5-5`) y la publican, o la dejan por aprobar.
- Freno: máximo de respuestas automáticas por hora y cuenta (60 por defecto, se cambia en Configuración).

Instalación (una sola vez, con el plan Blaze activo):
1. Secretos de Firebase (se cargan en la consola o con `firebase functions:secrets:set`, nunca en el código ni en el chat):
   - `ANTHROPIC_API_KEY`: clave de la API de Claude (console.anthropic.com).
   - `META_APP_SECRET`: secreto de la app de Meta.
   - `META_VERIFY_TOKEN`: una palabra larga inventada, la misma que se pone en Meta al configurar el webhook.
2. Publicar las funciones `metaWebhook`, `rsNuevoComentario` y `rsComentarioCambio` (región `southamerica-east1`) y las reglas.
3. En developers.facebook.com: crear una app de tipo empresa, agregar **Webhooks** (objetos *Page* → campo `feed` e *Instagram* → campo `comments`) con la URL de `metaWebhook` y el `META_VERIFY_TOKEN`. Permisos: `pages_manage_engagement`, `pages_read_user_content`, `pages_read_engagement`, `pages_manage_metadata`, `instagram_basic`, `instagram_manage_comments`. Para usarla con el público, Meta pide la revisión de la app.
4. Suscribir cada página a la app y sacar su token de página de larga duración. En el tablero → Configuración → *Agregar cuenta*: el id de la página (Facebook) o de la cuenta profesional de Instagram, su país y el token.
5. Cargar en Configuración los datos de cada país (precios, sucursales, horarios, promociones, WhatsApp) y activar las respuestas automáticas.

## Capital Corp: entrada, países y asistente

- **Entrada:** el portal empieza en Capital Corp (fondo negro, letra blanca) → empresa (Calistenia Company) → país (Bolivia o Paraguay). La elección queda recordada; la ruta de arriba permite cambiarla.
- **Logo:** sube el logo de Capital Corp en blanco sobre fondo transparente como `images/capital-corp-logo.png` y reemplaza el nombre escrito en todas las pantallas.
- **Paraguay:** los permisos se leen en el ERP de Calistenia Paraguay (`/centro_mando` y `/accionistas`). Ingresos en vivo usa el ERP de Paraguay; Legal y Redes sociales usan los mismos permisos de datos que Bolivia, separados por país. Las sucursales de Paraguay para Legal se cargan en `config/sucursales_paraguay` (campo `lista`).
- **Asistente «Capital Corp»** (`asistente.html`, pantalla 5 del muro): escucha la palabra «Capital», saluda, pregunta con quién habla y dice lo que hay que atender. Sin publicar la función `asistente` trabaja en modo básico (resumen y respuestas simples); con la función y el secreto `ANTHROPIC_API_KEY` conversa con IA (Claude). Necesita Chrome para la voz.

### Asistente sin tocar nada (equipo del muro)

El asistente arranca solo: saluda y queda escuchando. Lo único que el navegador frena por su cuenta es el sonido y el micrófono la primera vez en un equipo nuevo. En el equipo de la pantalla central se configura una vez:
1. Descargar y ejecutar como administrador `dashboard/kiosco/permitir-sitio-chrome.reg`: Chrome deja al sitio usar micrófono y sonido sin preguntar (solo a este sitio).
2. Poner `dashboard/kiosco/muro-capital-corp.bat` en el Inicio de Windows (Win+R → `shell:startup`): al encender, abre el asistente a pantalla completa, con sonido y micrófono.
3. La primera vez, ingresar al centro de mando con el usuario del muro dentro de esa ventana; la sesión queda guardada.

En cualquier otro equipo, si el navegador bloquea el sonido, aparece un aviso arriba y basta tocar la pantalla una vez.
