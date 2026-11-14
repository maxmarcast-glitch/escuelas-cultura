// Copia de seguridad: descarga en un Excel todo lo que el usuario puede ver
// (el master, todas las escuelas; un administrativo, solo la suya).

import { client, estado, esMaster, q } from './db.js';
import { MESES, avisar, avisarError, descargarExcel, fecha, paraArchivo } from './ui.js';

// Trae todas las filas de a 1000 (la API devuelve por páginas)
async function todo(tabla, columnas = '*', orden = 'id') {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const lote = await q(client.from(tabla).select(columnas).order(orden).range(desde, desde + 999));
    filas.push(...lote);
    if (lote.length < 1000) return filas;
  }
}

export async function exportarTodo(boton) {
  boton.disabled = true;
  avisar('Preparando la copia de seguridad…');
  try {
    const [escuelas, cursos, alumnos, cuotas, cierres, memos, perfiles] = await Promise.all([
      todo('escuelas'), todo('cursos'), todo('alumnos'), todo('cuotas'),
      todo('cierres', '*', 'escuela_id'), todo('memos'),
      esMaster() ? todo('perfiles') : Promise.resolve([]),
    ]);
    const esc = Object.fromEntries(escuelas.map(e => [e.id, e.nombre]));
    const cur = Object.fromEntries(cursos.map(c => [c.id, c]));
    const alu = Object.fromEntries(alumnos.map(a => [a.id, a]));
    const si = b => (b ? 'Sí' : 'No');

    const hojas = {
      Escuelas: [['ID', 'Escuela', 'Activa', 'Link formulario memos'],
        ...escuelas.map(e => [e.id, e.nombre, si(e.activa), e.link_formulario || ''])],
      Cursos: [['ID', 'Escuela', 'Curso', 'Docente', 'Días', 'Desde', 'Hasta', 'Cuota', 'Activo'],
        ...cursos.map(c => [c.id, esc[c.escuela_id], c.nombre, c.docente || '', (c.dias || []).join(', '), String(c.hora_inicio || '').slice(0, 5), String(c.hora_fin || '').slice(0, 5), Number(c.monto_cuota), si(c.activo)])],
      Alumnos: [['ID', 'Escuela', 'Curso', 'Apellido', 'Nombre', 'DNI', 'Activo'],
        ...alumnos.map(a => [a.id, esc[cur[a.curso_id]?.escuela_id], cur[a.curso_id]?.nombre, a.apellido, a.nombre, a.dni || '', si(a.activo)])],
      Cuotas: [['ID', 'Escuela', 'Curso', 'Apellido', 'Nombre', 'DNI', 'Año', 'Mes', 'Monto', 'Fecha de pago', 'Recibo', 'Observación', 'Registró', 'Anulada', 'Anuló', 'Fecha anulación', 'Motivo anulación'],
        ...cuotas.map(c => { const a = alu[c.alumno_id] || {}; const cu = cur[a.curso_id] || {};
          return [c.id, esc[cu.escuela_id], cu.nombre, a.apellido, a.nombre, a.dni || '', c.anio, MESES[c.mes], Number(c.monto), fecha(c.fecha_pago), c.nro_recibo || '', c.observacion || '', c.registrado_nombre || '', si(c.anulada), c.anulada_por || '', fecha(c.anulada_en), c.motivo_anulacion || '']; })],
      'Meses cerrados': [['Escuela', 'Año', 'Mes', 'Cerró', 'Fecha'],
        ...cierres.map(c => [esc[c.escuela_id], c.anio, MESES[c.mes], c.cerrado_por || '', fecha(c.cerrado_en)])],
      Memos: [['Escuela', 'Número', 'Fecha', 'Asunto', 'Documento'],
        ...memos.map(m => [esc[m.escuela_id] || 'Sin escuela', m.numero || '', fecha(m.fecha), m.asunto || '', m.link_doc || ''])],
    };
    if (esMaster()) {
      hojas.Usuarios = [['Apellido', 'Nombre', 'Legajo', 'Mail', 'Rol', 'Escuela', 'Activo', 'Cuenta vinculada'],
        ...perfiles.map(p => [p.apellido, p.nombre, p.legajo, p.email, p.rol, esc[p.escuela_id] || 'Todas', si(p.activo), si(p.user_id)])];
    }

    const ambito = esMaster() ? 'todas' : paraArchivo(estado.perfil.escuela || 'escuela');
    await descargarExcel(`copia_escuelas_${ambito}_${new Date().toLocaleDateString('sv-SE')}.xlsx`, hojas);
    avisar(`Copia descargada: ${alumnos.length} alumnos y ${cuotas.length} pagos.`);
  } catch (err) {
    avisarError(err);
  } finally {
    boton.disabled = false;
  }
}
