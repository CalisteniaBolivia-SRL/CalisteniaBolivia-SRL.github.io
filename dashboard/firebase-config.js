/* Configuración de Firebase de los módulos nuevos del centro de mando (Legal, Cuentas por pagar,
   Sistema comercial, Reportes, Roles).
   Se copia desde la consola de Firebase: Configuración del proyecto → Tus apps → App web → SDK (Configuración).
   Estos valores no son secretos: identifican el proyecto. La seguridad la dan el ingreso con Google y las
   reglas de Firestore (archivo firestore.rules en la raíz del repositorio).
   Mientras sea null, los módulos avisan que falta configurar Firebase. Pasos: dashboard/FIREBASE.md */
window.CM_FIREBASE_CONFIG = null;
/* Ejemplo:
window.CM_FIREBASE_CONFIG = {
    apiKey: "AIza...",
    authDomain: "tu-proyecto.firebaseapp.com",
    projectId: "tu-proyecto",
    storageBucket: "tu-proyecto.appspot.com",
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:0000000000000000"
};
*/
