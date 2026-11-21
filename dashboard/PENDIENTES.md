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

## Otros pendientes
- ERP: rol **«Atención al Cliente · CM»** con permiso `atencion` en /centro_mando (las 18 ATC) y rol **«Jefe de ATC · CM»** con `jefe_atc` (Eliana, José Miguel Parada, Rodrigo Dorado). Lo hace un administrador del ERP.
- Redes sociales: crear la app de Meta y cargar sus claves como secretos; publicar las funciones de redes (metaWebhook, rs*). TikTok: falta acceso a la documentación de su API.
- Paraguay: separar Atención al Cliente por país (listas de clientes del ERP de Paraguay); páginas /accionistas y /centro_mando en el ERP de Paraguay (Servisofts).
- Servisofts: clientes vencidos de más de 180 días en el MCP; bloquear en caja el paquete exclusivo de campaña.
- Comisiones 100 % en el servidor (sin depender del Panel abierto): necesita un usuario del ERP solo lectura de ventas, con su clave como secreto.
- Logo de Capital Corp y empresa «S&P» en la entrada del grupo.
- Mantener la alerta de gasto de Google (1 USD) y revisar el consumo de Claude y de la voz.
