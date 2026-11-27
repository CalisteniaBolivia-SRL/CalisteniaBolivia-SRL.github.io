# Pedidos a Servisofts · Centro de mando de Capital Corp / Calistenia

Documento para el equipo de Servisofts. Son dos cambios en el S-ERP y en el MCP de Calistenia. No hace falta ningún dato privado nuestro para hacerlos.

## 1. Botón «Pagar con QR» en la venta de caja (S-ERP, Bolivia y Paraguay)

**Qué necesitamos:** al hacer una venta en caja y elegir el tipo de pago **QR**, el ERP muestra **nuestro QR de cobro**: el de la sucursal o, si no tiene, el general. El cajero confirma el pago con el número de transacción del comprobante del cliente.

**Cómo hacerlo (no necesita conexión con nuestro sistema, son páginas públicas):**

1. En la pantalla de venta, al elegir el tipo de pago «QR», abrir dentro de la venta (en un iframe o una ventana nueva) esta página, con el monto de la venta:
   - Paraguay: `https://calisteniabolivia-srl.github.io/qr/?c=general&p=py&m=<MONTO>`
   - Bolivia: `https://calisteniabolivia-srl.github.io/qr/?c=general&m=<MONTO>`
   - Para usar el QR propio de una sucursal, cambiar `c=general` por `s=<key_sucursal>`. La key es la del ERP, la misma que cargamos en nuestro tablero «Cobros QR».
2. La página muestra el QR vigente, el monto y los datos de la cuenta (banco, cuenta y titular). Si cambiamos el QR, se actualiza sola en un minuto.
3. Si prefieren dibujar el QR ustedes, el mismo dato está en JSON público (sin clave):
   - `GET https://firestore.googleapis.com/v1/projects/centro-de-comando-a57cf/databases/(default)/documents/cobro_qr/general`. En Paraguay, la colección es `py_cobro_qr`; para una sucursal, el documento es `suc_<key_sucursal>`.
   - Campos: `imagen` (data URL de la foto del QR), `banco`, `cuenta`, `titular`, `nit`, `nota` y `activo`. Si `activo` es `false`, usar el `general`.
4. Al confirmar un pago por QR, pedir como **obligatorio el número de transacción** del comprobante del cliente y guardarlo en el pago, para que Contabilidad lo cruce con el banco.

En Bolivia ya lo tenemos así en nuestra caja (`app-administracion`, botón «QR»). Lo que pedimos es lo mismo en el S-ERP.

## 2. Un solo ingreso: que el MCP de Calistenia no vuelva a pedir usuario y contraseña

**Problema:** el personal entra al centro de mando con su usuario del S-ERP. Después, para ver los datos de Calistenia (ventas, clientes, asistencia), `calistenia.servisofts.com/mcp/authorize` les pide **otra vez** usuario y contraseña. Para ellos es entrar dos veces.

**Lo que pedimos (cualquiera de las dos opciones):**

- **Opción A, inicio de sesión único (preferida):** que `/mcp/authorize` acepte la sesión del S-ERP que la persona ya tiene. Por ejemplo, un parámetro con el token de sesión del S-ERP (el mismo que devuelve `usuario/login`) o una cookie compartida de `servisofts.com`. Así concede el acceso sin mostrar el formulario.
- **Opción B, intercambio de token:** un endpoint `POST /mcp/token` con `grant_type=urn:ietf:params:oauth:grant-type:token-exchange` que reciba el token de sesión del S-ERP y devuelva el access y el refresh token del MCP. Nuestro puente de ingreso lo llamaría en el mismo momento del login, sin pedir nada más al usuario.

En los dos casos, los permisos tienen que ser los mismos del usuario (sus sucursales y su rol), igual que hoy.

## 3. Publicar la web de administración de Calistenia Bolivia (`app-administracion`)

**Problema:** el workflow `CI/CD SERVISOFTS - WEB` de `CalisteniaBolivia-SRL/app-administracion` compila bien la web pero no la puede copiar al servidor:
- Al leer los secretos, `id_rsa` y `config` dan «base64: invalid input»: la clave SSH guardada en el secreto `SECRET_KEY` está vencida o mal cargada.
- `ssh-keyscan -p 2222 servisofts.com` falla desde GitHub: el puerto 2222 no responde a los equipos de GitHub Actions, o el servidor cambió.
- Además, GitHub retiró `ubuntu-20.04`; ya lo cambiamos a `ubuntu-22.04`.

**Lo que pedimos:**
1. Actualizar el secreto `SECRET_KEY` del repositorio con la clave SSH vigente y su `config` (host, puerto y usuario).
2. Confirmar que el servidor acepta SSH desde GitHub Actions (o indicarnos el host y el puerto correctos).
3. Mientras tanto, publicar a mano la versión actual de `main` (`npm ci && npm run build` y copiar `build/` a la ruta de siempre). Trae el botón «QR» en la venta de paquetes.

---
Contacto: Dirección de Capital Corp. Cualquier duda técnica, por este mismo repositorio.
