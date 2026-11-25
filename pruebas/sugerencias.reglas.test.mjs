/* Pruebas de las reglas del Buzón de sugerencias (rh_sugerencia / py_rh_sugerencia), con el emulador de Firestore.
   Correr (necesita Java):
     npm i -D firebase-tools @firebase/rules-unit-testing firebase
     echo '{"firestore":{"rules":"firestore.rules"},"emulators":{"firestore":{"port":8089}}}' > /tmp/fb.json
     npx firebase emulators:exec --config /tmp/fb.json --only firestore --project demo-cm "node --test pruebas/sugerencias.reglas.test.mjs" */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import test from 'node:test';
import { doc, setDoc, getDoc, getDocs, collection, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';

const env = await initializeTestEnvironment({ projectId: 'demo-cm', firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8089 } });
const ses = (uid, extra) => env.authenticatedContext(uid, { cm: 1, vence: Date.now() + 3600e3, tableros: [], ...extra }).firestore();
const pub = () => env.unauthenticatedContext().firestore();
const base = (o = {}) => ({ pais: 'bolivia', categoria: 'entrenadores', mensaje: 'El profe de las 7 llega tarde', sucursal: 'Equipetrol', anonimo: true, fecha_on: new Date().toISOString(), estado: 'nueva', origen: 'app', version_app: '2.0.72', ...o });

test('público: crea sugerencia anónima válida', async () => { await assertSucceeds(addDoc(collection(pub(), 'rh_sugerencia'), base())); });
test('público: con datos de contacto si no es anónima', async () => { await assertSucceeds(addDoc(collection(pub(), 'rh_sugerencia'), base({ anonimo: false, nombre: 'Ana Pérez', telefono: '70000000', correo: 'ana@x.com', key_usuario: 'abc-123' }))); });
test('público: anónima NO puede llevar nombre ni teléfono', async () => {
  await assertFails(addDoc(collection(pub(), 'rh_sugerencia'), base({ nombre: 'Ana' })));
  await assertFails(addDoc(collection(pub(), 'rh_sugerencia'), base({ telefono: '7000' })));
  await assertFails(addDoc(collection(pub(), 'rh_sugerencia'), base({ key_usuario: 'abc' })));
});
test('público: rechaza datos inválidos', async () => {
  const c = collection(pub(), 'rh_sugerencia');
  await assertFails(addDoc(c, base({ categoria: 'xxx' })));
  await assertFails(addDoc(c, base({ mensaje: 'hola' })));
  await assertFails(addDoc(c, base({ mensaje: 'x'.repeat(2001) })));
  await assertFails(addDoc(c, base({ estado: 'resuelta' })));
  await assertFails(addDoc(c, base({ pais: 'paraguay' })));
  await assertFails(addDoc(c, base({ extra: 1 })));
  await assertFails(addDoc(c, base({ anonimo: 'si' })));
});
test('público: no puede leer, listar, editar ni borrar', async () => {
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'rh_sugerencia/s1'), base()); });
  await assertFails(getDoc(doc(pub(), 'rh_sugerencia/s1')));
  await assertFails(getDocs(collection(pub(), 'rh_sugerencia')));
  await assertFails(updateDoc(doc(pub(), 'rh_sugerencia/s1'), { estado: 'resuelta' }));
  await assertFails(deleteDoc(doc(pub(), 'rh_sugerencia/s1')));
});
test('RRHH y Dirección leen; otros permisos no', async () => {
  await assertSucceeds(getDocs(collection(ses('g1', { tableros: ['rrhh'] }), 'rh_sugerencia')));
  await assertSucceeds(getDocs(collection(ses('d1', { tableros: ['direccion'] }), 'rh_sugerencia')));
  await assertFails(getDocs(collection(ses('a1', { tableros: ['atencion'] }), 'rh_sugerencia')));
  await assertFails(getDocs(collection(ses('x', { tableros: ['rrhh'], vence: Date.now() - 1000 }), 'rh_sugerencia')));
});
test('RRHH cambia estado y nota, nada más', async () => {
  const db = ses('g1', { tableros: ['rrhh'] });
  await assertSucceeds(updateDoc(doc(db, 'rh_sugerencia/s1'), { estado: 'revision', nota: 'Hablé con el profe', atendido_por: 'g1', atendido_nombre: 'German', fecha_atencion: 'hoy' }));
  await assertFails(updateDoc(doc(db, 'rh_sugerencia/s1'), { mensaje: 'cambiado', atendido_por: 'g1' }));
  await assertFails(updateDoc(doc(db, 'rh_sugerencia/s1'), { estado: 'resuelta', atendido_por: 'otro' }));
  await assertFails(updateDoc(doc(db, 'rh_sugerencia/s1'), { estado: 'inventado', atendido_por: 'g1' }));
  await assertFails(deleteDoc(doc(db, 'rh_sugerencia/s1')));
});
test('Paraguay: su propia colección y permisos', async () => {
  await assertSucceeds(addDoc(collection(pub(), 'py_rh_sugerencia'), base({ pais: 'paraguay' })));
  await assertFails(addDoc(collection(pub(), 'py_rh_sugerencia'), base()));
  await assertFails(getDocs(collection(ses('g1', { tableros: ['rrhh'] }), 'py_rh_sugerencia')));
  await assertSucceeds(getDocs(collection(ses('p1', { tableros: [], tableros_py: ['rrhh'] }), 'py_rh_sugerencia')));
  await assertSucceeds(getDocs(collection(ses('d1', { tableros: ['direccion'] }), 'py_rh_sugerencia')));
  await assertFails(getDocs(collection(ses('p1', { tableros: [], tableros_py: ['rrhh'] }), 'rh_sugerencia')));
});
test.after(async () => { await env.cleanup(); });
