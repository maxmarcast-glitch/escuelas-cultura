// Conexión con Neon (login + Data API) y estado global de la sesión.

import { createClient } from './neon.js';
import { NEON_URL } from './config.js';

export const client = createClient(NEON_URL);

export const estado = {
  usuario: null,      // usuario de Neon Auth
  perfil: null,       // { id, nombre, apellido, legajo, rol, escuela_id, escuela }
  escuelas: [],       // escuelas que puede ver
  escuelaSel: null,   // filtro activo (master); null = todas
};

export const esMaster = () => estado.perfil?.rol === 'master';

// Envuelve las consultas: si hay error, lo lanza para manejarlo con try/catch
export async function q(promesa) {
  const { data, error } = await promesa;
  if (error) throw error;
  return data;
}

export async function cargarEscuelas() {
  estado.escuelas = await q(client.from('escuelas').select('id, nombre, activa').order('nombre'));
  return estado.escuelas;
}

export const nombreEscuela = id => estado.escuelas.find(e => e.id === id)?.nombre || '—';

// Escuela sobre la que se trabaja: la propia (administrativo) o la elegida (master)
export const escuelaTrabajo = () => (esMaster() ? estado.escuelaSel : estado.perfil?.escuela_id);
