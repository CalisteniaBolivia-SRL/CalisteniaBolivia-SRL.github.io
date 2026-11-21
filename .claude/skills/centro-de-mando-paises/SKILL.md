---
name: centro-de-mando-paises
description: Regla obligatoria del centro de mando de Capital Corp / Calistenia — Bolivia y Paraguay comparten los mismos módulos; cualquier cambio en un módulo se aplica a todos los países a la vez y solo cambia, por país, qué módulos se ven (checklist de Dirección). Usar SIEMPRE que se cree, edite o corrija cualquier módulo, tablero, pantalla del muro o el portal en dashboard/.
---

# Un solo centro de mando, varios países

El director pidió: «cada vez que mejores un módulo, en ambos se mejore, siempre; la única diferencia es un checklist de qué se ve».

## Cómo está armado
- `dashboard/modulos.js` — registro ÚNICO de módulos (pantallas del muro y tableros): id, nombre, descripción, permisos,
  `href(pais)` y `datosPY` (si ya lee los datos de Paraguay). Los portales de Bolivia y Paraguay se arman desde acá.
- `dashboard/pais.js` — se incluye en cada módulo; define `window.CM_PAIS` desde `?pais=`. En Paraguay, si la página no está
  en `LISTOS`, muestra «falta conectar los datos» en lugar de datos de Bolivia.
- `dashboard/modulos.html` — checklist de Dirección: qué se ve en cada país (`com_config/modulos_bolivia|paraguay`).
  Por defecto: Bolivia todo; Paraguay lo que ya tiene datos. Oculto ≠ apagado.
- Permisos por país: los de `/centro_mando` del ERP de cada país (mismos nombres). Dirección de Bolivia ve todo en Paraguay.

## Al tocar cualquier módulo
1. Hacer el cambio una sola vez, en el código compartido, pensando en los dos países.
2. Verificar de dónde lee los datos cada país (`window.CM_PAIS`):
   - Bolivia: MCP de Calistenia Bolivia (`window.CM.llamar`) y Firestore (colecciones actuales).
   - Paraguay: ERP de Calistenia Paraguay (S-ERP, empresa `3433c7d4-a626-44de-b825-f924334e679c`) y Firestore separado por país
     (campo `pais` o colección `py_*`). Registros viejos sin `pais` = Bolivia.
3. Si el módulo ya funciona con datos de Paraguay: `datosPY: true` en `modulos.js` y agregar su página a `LISTOS` en `pais.js`.
4. Nunca mezclar ni mostrar datos de un país en el otro.
5. Módulo nuevo: agregarlo a `modulos.js` (aparece solo en ambos portales y en el checklist), incluir `pais.js` en su página,
   reglas en `firestore.rules` y su sección en `manual.html`.
6. Probar en los dos países (`?pais=bolivia` y `?pais=paraguay`) antes de publicar.
