# App Android «Capital Corp» (abre el centro de mando)

App que abre `https://calisteniabolivia-srl.github.io/dashboard/` a pantalla completa (Trusted Web Activity).
Toda mejora de la web llega sola a la app: solo hay que recompilar si cambia el nombre, el ícono o la versión de Android.

- Paquete: `com.capitalcorp.centrodemando`. Vínculo con el sitio: `/.well-known/assetlinks.json` (huella SHA-256 de la clave).
- La clave de firma NO está en el repositorio: está en Secret Manager del proyecto `centro-de-comando-a57cf`
  (`APK_FIRMA_JKS` = archivo .jks en base64, `APK_FIRMA_CLAVE` = contraseña). Si se pierde, la app no se puede actualizar.
- Compilar: copiar la clave a `capital.jks` y la contraseña a `pw.txt` en esta carpeta (sin subirlas), subir
  `versionCode`/`versionName` en `app/build.gradle` y correr
  `gcloud builds submit . --config cloudbuild.yaml --project centro-de-comando-a57cf --region southamerica-east1`.
  El APK queda en `gs://centro-de-comando-a57cf_cloudbuild/apk/`; copiarlo a `dashboard/app/capital-corp.apk` y borrar
  `gs://centro-de-comando-a57cf_cloudbuild/source/**` (lleva la clave).
