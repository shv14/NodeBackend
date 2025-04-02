// cronJobs.js
const sql = require('mssql');
const cron = require('node-cron');
const axios = require('axios');

const config = {
  user: 'accelirateadmin',                                
  password: 'Weloverobots123',                            
  server: 'acceliratetraining.database.windows.net',       
  database: 'projectFlash',                                
  options: {
    port: 1433,
    connectionTimeout: 60000,
  },
};

// Asegurarnos de que la conexión esté abierta
async function ensureConnection() {
  if (!sql.connected) {
    await sql.connect(config);
  }
}

// 1) Función que realiza la lógica de consulta y envío al endpoint
async function runAlertLogic() {
  try {
    await ensureConnection();
    
    const query = `
      SELECT *
      FROM vw_Fact_Employee_Allocation_v2
      WHERE IsLatest = 1
        AND CONVERT(DATE, C_SOW_End) <= CONVERT(DATE, GETDATE())
    `;

    const result = await sql.query(query);

    if (result.recordset.length > 0) {
      console.log('Registros encontrados:', result.recordset);
      
      // Enviar los registros a tu endpoint externo vía POST
      const response = await axios.post('https://prod-127.westus.logic.azure.com:443/workflows/89cd904cb0404511878c3ddda23711e0/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=hSSQ-mtoAFUc0LbT7ihe_sOvzWzU1Q7DjZpf4BvbVDs', {
        data: result.recordset
      });
      
      console.log('Respuesta del endpoint externo:', response.status, response.data);
    } else {
      console.log('No se encontraron registros que coincidan con IsLatest = true y C_SOW_End = hoy.');
    }
  } catch (error) {
    console.error('Error en la lógica de alerta:', error);
  } finally {
    // Dependiendo de tu estrategia, podrías cerrar la conexión o dejarla abierta.
    // sql.close();
  }
}

// 2) Función para agendar el cron job y ejecutarlo
function scheduleDailyAlert() {
  // a) Ejecutar la lógica inmediatamente al iniciar el servidor
  runAlertLogic();

  // b) Programar la ejecución para cada día a las 08:00 AM
  cron.schedule('0 8 * * *', () => {
    runAlertLogic();
  }, {
    timezone: 'America/New_York'
  });
}

module.exports = { scheduleDailyAlert };
