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
