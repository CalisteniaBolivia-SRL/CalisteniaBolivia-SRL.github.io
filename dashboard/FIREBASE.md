# Activar los módulos nuevos con Firebase (sin depender de Servisofts)

Los módulos **Legal**, **Cuentas por pagar** (en Administración) y **Sistema comercial** guardan sus datos en Firebase (Firestore), que es de Calistenia. **Reportes** sigue leyendo del MCP de Calistenia (prórrogas y convenios ya funcionan). Cada persona entra a estos módulos con su **cuenta de Google**, y **Dirección** decide quién ve qué en la página **Roles**.

Tiempo estimado: 15 minutos. Lo hace alguien con acceso de propietario al proyecto de Firebase.

## 1. Proyecto

Usar el proyecto de Firebase de Calistenia (el de la app, `tapeke-20bb6`) o crear uno nuevo en https://console.firebase.google.com (plan gratuito Spark alcanza).

## 2. Ingreso con Google

1. **Authentication → Comenzar → Método de acceso → Google → Habilitar** (elegir el correo de soporte) → Guardar.
2. **Authentication → Configuración → Dominios autorizados → Agregar dominio:** `calisteniabolivia-srl.github.io`.

## 3. Base de datos

1. **Firestore Database → Crear base de datos →** modo **producción**, ubicación `southamerica-east1` (São Paulo) o la más cercana.
2. **Firestore → Reglas:** borrar todo, pegar el contenido de `firestore.rules` (raíz de este repositorio) y **Publicar**.

## 4. Primer usuario de Dirección

En **Firestore → Datos → Iniciar colección**:
- ID de la colección: `roles`
- ID del documento: el **correo de Google de Dirección, en minúsculas** (ej. `nombre@empresa.com`)
- Campos: `admin` (booleano) = `true`, `nombre` (cadena) = el nombre, `estado` (número) = `1`

A partir de ahí, todo lo demás se hace desde la página **Roles** del centro de mando.

## 5. Conectar la página

1. **Configuración del proyecto (engranaje) → General → Tus apps → Agregar app → Web (`</>`)**, nombre "Centro de mando", sin Hosting → Registrar.
2. Copiar el objeto `firebaseConfig` que muestra y pegarlo en `dashboard/firebase-config.js`, reemplazando `null`:

```js
window.CM_FIREBASE_CONFIG = {
    apiKey: "...",
    authDomain: "....firebaseapp.com",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
};
```

Estos valores no son secretos (identifican el proyecto); la seguridad la dan el ingreso con Google y las reglas.

3. Publicar el cambio (merge a `main`).

## 6. Dar accesos (página Roles)

Dirección entra a **Centro de mando → Roles**, ingresa con Google y agrega a cada persona con su correo y sus módulos:

| Rol | Qué puede hacer |
|---|---|
| Dirección | Administra roles y la lista de sucursales; ve todo. |
| Legal | Contratos, permisos, casos y plazos. |
| Administración | Cuentas por pagar y punto de equilibrio. |
| Sistema comercial (master) | Atención al Cliente: equipo, reparto, tareas, guiones, comisiones. |
| Ejecutiva de ventas | Su CRM. Además, Atención al Cliente la agrega al equipo en Sistema comercial → Equipo. |
| Reportes | Tablero Reportes (si no tiene ya el permiso "reportes" en el ERP). |

En **Roles → Sucursales** conviene cargar la lista de sucursales (una por línea).

## Qué queda en el servidor de Calistenia (opcional, Servisofts)

Estos reportes necesitan que el servidor registre información que hoy no guarda; quedan "pendientes de activación" hasta instalar sus pull requests del repositorio `server`:
- Traspasos de mensualidad, paquetes eliminados y cambios de fecha (historial del servidor).
- Cumpleañeros del mes (fecha de nacimiento del servicio de usuarios).

## Notas

- **Comisiones del Sistema comercial:** se calculan cruzando los contactos registrados con las ventas de `listar_ventas` (MCP). El cliente se reconoce por su clave si la venta la trae, si no por su nombre: conviene revisar las primeras comisiones.
- **Copias de seguridad:** Firestore permite exportar datos desde la consola (Firestore → Importar/exportar, requiere plan Blaze) o con `gcloud firestore export`.
- **Quitar acceso:** en Roles → "Quitar acceso". La persona deja de ver los datos al recargar la página.
