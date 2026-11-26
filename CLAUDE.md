# Centro de mando · Capital Corp / Calistenia Company

Sitio estático (GitHub Pages) en `dashboard/`, con Firebase (proyecto `centro-de-comando-a57cf`) para sesión, datos propios y funciones.
El acceso es SIEMPRE con el usuario y la contraseña del ERP (S-ERP de Servisofts) y los permisos de la página
`/centro_mando` de cada ERP. No inventar otros mecanismos de acceso.

## Qué ve cada persona: roles del ERP (roles.html)
Pedido del director: los roles del ERP se traen solos al centro de mando y Dirección elige ahí qué módulos ve cada rol.
- El puente `erpLogin` lee en cada ingreso los roles de las dos empresas (`roles_permisos/rol getAll`) y los del usuario
  (`usuarioRol getAllByUsuarios`), y guarda `cm_roles/<pais>` y `cm_usuario/<uid>` (permisos del ERP + sus roles).
- Dirección elige en `dashboard/roles.html` los módulos de cada rol (`cm_rol_cfg/<key_rol>`: modulos + tableros que
  necesitan). Se suman a los permisos de /centro_mando; si un rol suyo está configurado, el portal muestra solo esos.
- `cmRenovar` rehace la sesión sin contraseña cada vez que se abre el portal, así el cambio se ve enseguida.
- Todo módulo nuevo aparece solo en roles.html (sale de `modulos.js`). El acceso sigue siendo con usuario del ERP.

## LEY: Bolivia y Paraguay son APPS GEMELAS
Palabras del director: «Cuando yo modifique algo, tiene que modificarse en los dos lugares. No quiero estar configurando
dos veces. Prácticamente siempre son apps gemelas.»
- Todo pedido, mejora o corrección se aplica **automáticamente en Bolivia y Paraguay**, aunque el pedido nombre un solo
  país. No preguntar si hacerlo en el otro: hacerlo.
- Si algo existe en un país y no en el otro, se construye en el otro con el mismo formato (ej.: «Ingresos en vivo»).
- Al terminar, el informe al director dice siempre **cómo quedó en cada país** (Bolivia / Paraguay) y, si en uno falta
  un dato del ERP, qué falta y que el módulo ya quedó listo con el aviso.
- Nunca hace falta configurar dos veces: lo configurable por país se limita al checklist de módulos visibles.

## Regla permanente: un solo centro de mando para todos los países
- **Bolivia y Paraguay usan los mismos módulos.** Cada módulo existe UNA vez (registro en `dashboard/modulos.js`) y se
  abre por país con `?pais=bolivia|paraguay` (`dashboard/pais.js` define `window.CM_PAIS`).
- **Toda mejora o corrección de un módulo se hace para todos los países a la vez**, respetando que cada país lee
  sus propios datos (Bolivia: MCP de Calistenia Bolivia + Firestore; Paraguay: ERP de Calistenia Paraguay
  `3433c7d4-…` + Firestore con el campo/colección del país). Nunca mostrar datos de un país en otro.
- **Lo único que cambia por país es qué se ve**: el checklist de Dirección en `dashboard/modulos.html`
  (Firestore `com_config/modulos_<pais>`). Un módulo oculto sigue funcionando; solo no aparece en el portal.
- Un módulo nuevo: agregarlo a `modulos.js` (con `datosPY: true` cuando ya lea los datos de Paraguay) y a la lista
  `LISTOS` de `pais.js` cuando corresponda. Sin datos de Paraguay conectados, en Paraguay muestra el aviso.
- Ver la skill `.claude/skills/centro-de-mando-paises/SKILL.md` para el paso a paso.

## Otras reglas
- Datos de clientes y cifras: nunca en el repositorio (es público). Van en Firestore con reglas (`firestore.rules`).
- Reglas de Firestore: se publican con la API de firebaserules (ruleset + release `cloud.firestore`).
- Diseño: sobrio, paleta del centro de mando (negro, gris, blanco, rojo #E30613 como acento), esquinas rectas.
- Texto para el usuario en español rioplatense/boliviano, simple y directo. Cada tablero tiene su parte en `dashboard/manual.html`.
- Pendientes en `dashboard/PENDIENTES.md`.
