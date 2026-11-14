// =====================================================================
//  Configuración: lo único que tenés que completar.
//
//  NEON_URL: Neon Console → tu proyecto → Data API → copiá la "API URL"
//  y transformala así:
//    https://ep-xxxx.apirest.c-2.us-east-1.aws.neon.tech/neondb/rest/v1
//                  ↓ sacá ".apirest" y "/rest/v1"
//    https://ep-xxxx.c-2.us-east-1.aws.neon.tech/neondb
//
//  Es una dirección pública: no es una clave secreta. La seguridad la
//  pone la base de datos (RLS), no este archivo.
// =====================================================================

export const NEON_URL = 'https://ep-calm-tooth-b6rgb98z.c-2.sa-east-1.aws.neon.tech/neondb';

export const NOMBRE_APP = 'Escuelas · Cultura';

// Ciclo lectivo de cuotas: marzo (3) a noviembre (11)
export const MES_INICIO = 3;
export const MES_FIN = 11;
