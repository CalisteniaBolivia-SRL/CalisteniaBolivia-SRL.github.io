# Pendientes del centro de mando

Lista de trabajo para retomar (sin contraseñas ni datos privados: esos nunca van al repositorio).

## Cámaras de las sucursales (en curso)
Decidido: **opción A** (acceso directo a cada grabador Dahua desde la oficina, sin P2P).

Ya hecho:
- Pantalla **0 · Cámaras** del muro (`dashboard/camaras.js`, `camaras.css`): agrupa por sucursal según el nombre «Sucursal - Cámara», cuadrícula con todas las cámaras, gira sola (segundos configurables), anterior / pausar / siguiente.
- Configuración de la dirección del puente desde la misma pantalla (Dirección o Jefe de ATC) → `com_config/camaras`.
- Archivos del puente: `dashboard/kiosco/camaras/go2rtc.yaml` (ejemplo) e `iniciar-puente.bat`.

Falta (lo está gestionando el director):
1. IP pública **fija** de la oficina (proveedor de internet).
2. Técnico, en cada sucursal: usuario «centromando» solo vista en vivo, DDNS, puerto 554 (RTSP) redirigido, filtro IP solo con la IP de la oficina; cargar las cámaras en `C:\camaras\go2rtc.yaml` en la computadora de la oficina.
3. Computadora de la oficina (siempre prendida): go2rtc en `C:\camaras` + inicio automático; Tailscale con la cuenta de Capital Corp, MagicDNS y HTTPS activados, `tailscale serve --bg 1984`.
4. Tailscale en la computadora del muro y en el celular del director.
5. Muro → Cámaras → Configurar → pegar la dirección `https://….ts.net`.

Después:
6. **Arqueo de personas y alerta de asistencia**: identificar las cámaras de entrenamiento de cada sucursal; cada pocos minutos contar personas en esas cámaras (foto + conteo) y comparar con las entradas registradas en el ERP (molinete y manuales) de esa sucursal en la última hora; si hay más personas que registros, alerta con la foto (posible clase sin registrar). Mostrarlo en el muro.

## Paraguay: mismo centro de mando que Bolivia, a su escala (en curso)
Decidido por el director: misma línea, mismos módulos, al nivel de Paraguay (1 sucursal). En Paraguay **sí** se registra asistencia en el ERP y **sí** va a tener Atención al Cliente.

Ya hecho:
- Ingresos de Paraguay (`accionistas-py/`) abre al instante: memoria local + compartida en Firestore (`py_ventas/AAAA-MM`, solo Dirección), y se pone al día cada 8 s.
- Logo de Capital Corp Holdings (`images/capital-corp-logo.png`, `capital-corp-simbolo.png`).

Falta (necesita revisar el ERP de Paraguay con mcp_serp, que estaba caído):
1. Ver en el ERP de Paraguay de dónde salen asistencia (molinete/manual), clientes y vencimientos.
2. Muro de Paraguay con el mismo diseño del muro de Bolivia: Resumen, Ventas (cierres semanales y mensuales), Ingresos por tipo (membresías, snacks, alquileres), Caja, Asistencia hoy, Asistencia 30 días (horas buenas y bajas), Retención, Ventas ATC, Cámaras.
3. Atención al Cliente de Paraguay con el mismo sistema (listas, Panel de la Jefa, incentivo con corte el 25), datos separados por país.
4. Portal de Paraguay con la misma estructura que Bolivia (Muro de N pantallas + Tus tableros + Manual).


- ERP: rol **«Atención al Cliente · CM»** con permiso `atencion` en /centro_mando (las 18 ATC) y rol **«Jefe de ATC · CM»** con `jefe_atc` (Eliana, José Miguel Parada, Rodrigo Dorado). Lo hace un administrador del ERP.
- Redes sociales: crear la app de Meta y cargar sus claves como secretos; publicar las funciones de redes (metaWebhook, rs*). TikTok: falta acceso a la documentación de su API.
- Servisofts: crear el permiso «mantenimiento» en la página /centro_mando del ERP (Bolivia y Paraguay) para la persona de mantenimiento. Mientras tanto cargan revisiones Supervisión y Administración.
- Paraguay: separar Atención al Cliente por país (listas de clientes del ERP de Paraguay); páginas /accionistas y /centro_mando en el ERP de Paraguay (Servisofts).
- Servisofts: clientes vencidos de más de 180 días en el MCP; bloquear en caja el paquete exclusivo de campaña.
- Comisiones 100 % en el servidor (sin depender del Panel abierto): necesita un usuario del ERP solo lectura de ventas, con su clave como secreto.
- Logo de Capital Corp y empresa «S&P» en la entrada del grupo.
- Mantener la alerta de gasto de Google (1 USD) y revisar el consumo de Claude y de la voz.

## Códigos de referido
- Publicado el 22/11: función erpLogin (sesión «ref» para cualquier usuario del ERP y permiso «accionistas») y reglas ref_* / py_ref_*.
- Crear en el ERP de Bolivia el paquete con descuento para referidos (ej. «PROMO REFERIDO»): la comisión se calcula sobre lo cobrado.
- Paraguay: el módulo y las colecciones py_ref_* están listos; falta que el ERP de Paraguay permita buscar clientes por cédula y ver el recibo de cada venta (hoy el cruce muestra el aviso).
- A futuro: % por nivel del trabajador (hoy: global y por paquete).

## Buzón de sugerencias
- Publicar `firestore.rules` para que la app pueda enviar y RRHH leer.
- App de clientes de Paraguay: cuando exista en el repositorio, sumar la misma pantalla enviando a `py_rh_sugerencia` (el buzón de Paraguay ya está listo).

- Roles del ERP (roles.html): confirmar con el primer ingreso real que llega la lista de roles (cm_roles/bolivia y cm_roles/paraguay). Si queda vacía, revisar la forma de la respuesta de `rol getAll` / `usuarioRol getAllByUsuarios` en functions/index.js (rolesDelERP).

## Cobros QR (para retomar)
- **Caja de Bolivia (app-administracion):** el botón «QR» ya está en `main` (PR #30), pero no se publicó. El workflow `web.yml` usa `ubuntu-20.04`, que GitHub retiró, y queda en cola. Cambiar a `ubuntu-22.04` con el OK del director.
- **Cargar el QR general** (y los de cada sucursal que cobre con otra cuenta) en `dashboard/cobros-qr.html`.
- **Pagos QR por verificar:** tablero que cruce los cobros por QR del día (número de transacción y monto) con los movimientos del banco y marque «Llegó / Por verificar»; Administración acepta a mano los dudosos. Falta revisar la forma de los datos con el MCP.
- **Servisofts:** pedidos en `docs/pedidos-servisofts.md`:
  1. QR en la venta del S-ERP.
  2. Un solo ingreso al MCP.

  El director ya habló con ellos.

## Un solo ingreso (en curso)
- Hoy el MCP de Calistenia (`calistenia.servisofts.com/mcp/authorize`) pide usuario y contraseña después del portal. Es de Servisofts (pedido 2 en `docs/pedidos-servisofts.md`).
- Alternativa propia: un puente en Firebase que lea el MCP con un usuario de Calistenia solo lectura, guardado como secreto, y entregue a cada persona solo lo de sus permisos. Así nadie vuelve a ingresar. Necesita que Dirección cree ese usuario y lo autorice una vez.
