# Datos de los módulos del centro de mando (Firebase + ingreso con el ERP)

Los módulos **Legal**, **Cuentas por pagar** (en Administración) y el **CRM de los ATC** (en Comercial y Atención al Cliente) guardan sus datos en Firebase, proyecto **Centro de Comando** (`centro-de-comando-a57cf`). **Reportes** y los demás tableros leen del MCP de Calistenia, como siempre.

## Cómo se ingresa

Como siempre: **usuario y contraseña del ERP** en el portal. Qué ve cada persona lo deciden sus permisos en la página **/centro_mando** del ERP:

| Permiso del ERP | Qué habilita |
|---|---|
| `jefe_atc` | **Jefe de ATC** (un solo usuario, el de Eliana Aguilera): dirige a los ATC, reparte clientes, deja tareas y guiones, ve resultados y comisiones, y Atención y retención. |
| `atencion` (o `atc`) | **Atención al Cliente (ATC de sucursal)** (22, dos por sucursal): su CRM, con los clientes antiguos que le tocan, sus seguimientos, tareas y comisión. |
| `legal` | Legal: contratos, permisos, casos y plazos. |
| `administracion` | Administración, incluida Cuentas por pagar. |
| `reportes` | Reportes. |
| `todo` | Todo lo anterior. |

Los permisos `jefe_atc` y `legal` hay que crearlos en /centro_mando del ERP y asignarlos a los usuarios que correspondan.

Al ingresar, el portal llama al **puente** (Cloud Function `erpLogin`, en `functions/`): confirma el mismo usuario y contraseña contra el ERP, lee sus permisos de /centro_mando y abre la sesión de datos de Firebase con esos permisos. No guarda contraseñas. La sesión dura 30 días; los cambios de permisos en el ERP se aplican al volver a ingresar.

Cada ATC aparece en **Comercial → Equipo** la primera vez que entra; Jefe de ATC le asigna sus sucursales y su meta.

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

Tablero **Redes sociales** (`redes.html`):
- **Conversaciones (CRM):** los mensajes directos de Messenger e Instagram. El bot responde y clasifica cada charla por **tema** (precios, horarios, inscripción, ubicación, clases, pagos, quejas, lesiones, felicitaciones, empleo, alianzas). Lo que necesita a una persona queda **Por atender**. Quien la **toma** la tiene asignada y el bot se pausa en esa charla; se puede responder desde el panel, dejar notas internas, marcar **Atendida** o **No requiere**, y **Devolver al bot**. Filtros por estado, tema, red, país, «solo las mías» y búsqueda. Si alguien responde desde la bandeja de Meta, también se pausa el bot.
- **Comentarios:** se responden solos con humor; las críticas se calman y se llevan a privado; los casos delicados (lesiones, cobros, denuncias, insultos) quedan **por aprobar**.
- **TikTok:** se pega el comentario y se copia el borrador (TikTok no permite responder por sistema).
- **Configuración:** botón **Conectar con Facebook** (trae las páginas y sus Instagram profesionales y las suscribe a los avisos), datos de la marca por país, WhatsApp, tono y respuestas automáticas por país y por cuenta. Freno: máximo de respuestas automáticas por hora y cuenta.

Piezas (en `functions/`): `metaWebhook` (avisos de Meta con firma verificada), `rsNuevoComentario`, `rsComentarioCambio`, `rsMensajeNuevo` (responde mensajes y envía los del personal) y `rsVincular` (conexión de páginas). Redacta Claude (`redes-ia.js`, modelo económico Haiku; se cambia con `REDES_MODELO`).

### Activación (una sola vez, con la facturación de Google activa)
1. **App de Meta** en developers.facebook.com (cuenta que administra las páginas): tipo **Empresa**; productos **Inicio de sesión con Facebook para empresas**, **Messenger**, **Instagram** y **Webhooks**. En *Configuración básica*: dominio `calisteniabolivia-srl.github.io`, política de privacidad, y copiar el **Id de la app** y la **Clave secreta**.
2. **Secretos y parámetros de Firebase:** `ANTHROPIC_API_KEY`, `META_APP_SECRET` (clave secreta de la app), `META_VERIFY_TOKEN` (una palabra larga inventada) y el parámetro `META_APP_ID` (id de la app).
3. Publicar las funciones y las reglas.
4. **Webhooks** en la app de Meta: URL de `metaWebhook` y el `META_VERIFY_TOKEN`; suscribir *Page* → `feed`, `messages`, `message_echoes` e *Instagram* → `comments`, `messages`.
5. En el tablero → Configuración: pegar el **Id de la app** y tocar **Conectar con Facebook** con el usuario que administra las páginas (Bolivia y luego Paraguay).
6. Para usarlo con el público, Meta pide la **revisión de la app** (permisos `pages_messaging`, `pages_manage_engagement`, `pages_read_user_content`, `instagram_manage_comments`, `instagram_manage_messages`) y la verificación del negocio. Mientras tanto funciona con los administradores y evaluadores de la app.

## Capital Corp: entrada, países y asistente

- **Entrada:** el portal empieza en Capital Corp (fondo negro, letra blanca) → empresa (Calistenia Company) → país (Bolivia o Paraguay). La elección queda recordada; la ruta de arriba permite cambiarla.
- **Logo:** sube el logo de Capital Corp en blanco sobre fondo transparente como `images/capital-corp-logo.png` y reemplaza el nombre escrito en todas las pantallas.
- **Paraguay:** los permisos se leen en el ERP de Calistenia Paraguay (`/centro_mando` y `/accionistas`). Ingresos en vivo usa el ERP de Paraguay; Legal y Redes sociales usan los mismos permisos de datos que Bolivia, separados por país. Las sucursales de Paraguay para Legal se cargan en `config/sucursales_paraguay` (campo `lista`).
- **Asistente «Capital Corp»** (`asistente.html`, pantalla 5 del muro): escucha la palabra «Capital», saluda, pregunta con quién habla y dice lo que hay que atender. Sin publicar la función `asistente` trabaja en modo básico (resumen y respuestas simples); con la función y el secreto `ANTHROPIC_API_KEY` conversa con IA (Claude). Necesita Chrome para la voz.

### Muro sin permisos que pedir (una sola vez por equipo)

El asistente arranca solo. Si un equipo del muro todavía no tiene autorizados micrófono, cámara y sonido para el sitio, las pantallas del muro muestran abajo **«Autorice este equipo una sola vez»** con el botón **Descargar autorización** (`dashboard/kiosco/autorizar-este-equipo.reg`): se abre el archivo, se acepta «Sí» y se reinicia Chrome. Queda para siempre en ese usuario de Windows (políticas de Chrome del usuario, solo para este sitio) y el aviso no vuelve a salir.

Opcional: `dashboard/kiosco/muro-capital-corp.bat` en el Inicio de Windows (Win+R → `shell:startup`) abre el asistente a pantalla completa al encender.

### Conversación completa: Capital Corp en Claude (sin costo extra)

La pantalla 5 muestra el resumen del día y responde lo básico. Para conversar con libertad, pedir tableros, estudios o sugerencias, el botón **Hablar con Capital Corp** (o decir «abrir Claude») abre el proyecto «Capital Corp» en Claude, con el conector de Calistenia y dentro de la suscripción de la empresa.

1. En claude.ai: Proyectos → Crear proyecto «Capital Corp», pegar las instrucciones del caballero de negocios y activar el conector Calistenia Bolivia (y el del ERP de Paraguay cuando esté reconectado).
2. En la computadora del muro: abrir el proyecto, copiar su enlace (https://claude.ai/project/…) y pegarlo en la pantalla 5 con «Elegir el proyecto de Claude de este equipo». Queda guardado en ese equipo.
