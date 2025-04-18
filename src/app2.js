const express = require('express');
const bodyParser = require('body-parser');
const sql = require('mssql');
const cors = require('cors')

const app = express();
const port = 2024;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const config = {
  user: 'accelirateadmin',                                //Your User Name
  password: 'Weloverobots123',                            //Your Password
  server: 'acceliratetraining.database.windows.net',      //Your Server Name
  database: 'projectFlash',                             //Your DB Name
  options: {
    port: 1433,
    connectionTimeout: 60000,
  },
};

// Helper function to generate SET clause for UPDATE operation
const generateSetClause = (columns, values) => {
  return columns.map((col, index) => `${col} = '${values[index]}'`).join(', ');
};

const ensureConnection = async () => {
  if (!sql.connected) {
    await sql.connect(config);
  }
};

app.post('/api/insert/:tableName', async (req, res) => {
    try {
      await ensureConnection();
  
      const tableName = req.params.tableName;
      const data = req.body;
      const columns = Object.keys(data);
      const values = Object.values(data);
  
      // Verificar si las columnas existen en la tabla
      const tableColumnsQuery = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tableName}'`;
      const tableColumnsResult = await sql.query(tableColumnsQuery);
      const tableColumns = tableColumnsResult.recordset.map(row => row.COLUMN_NAME);
  
      // Obtener columnas incrementales
      const identityColumnsQuery = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tableName}' AND COLUMNPROPERTY(object_id(TABLE_NAME), COLUMN_NAME, 'IsIdentity') = 1`;
      const identityColumnsResult = await sql.query(identityColumnsQuery);
      const identityColumns = identityColumnsResult.recordset.map(row => row.COLUMN_NAME);
  
      const invalidColumns = columns.filter(column => !tableColumns.includes(column));
  
      if (invalidColumns.length > 0) {
        return res.status(400).send({ status: 400, message: `Invalid columns: ${invalidColumns.join(', ')}` });
      }
  
      // Verificar si faltan columnas necesarias, excluyendo las columnas incrementales y las columnas opcionales
      const optionalColumns = ['Created', 'IsLatest', 'C_SOW_Start', 'C_SOW_End', 'N_SOW_Start', 'N_SOW_End', 'Employee_Full_Name','IsLegacy'];
      const missingColumns = tableColumns.filter(column => !columns.includes(column) && !identityColumns.includes(column) && !optionalColumns.includes(column));
      if (missingColumns.length > 0) {
        return res.status(206).send({ status: 206, message: `Missing columns: ${missingColumns.join(', ')}` });
      }
  
      const columnNames = columns.join(', ');
      const columnValues = values.map(value => `'${value}'`).join(', ');
  
      const query = `INSERT INTO ${tableName} (${columnNames}) VALUES (${columnValues})`;
      console.log(query);
  
      const result = await sql.query(query);
      res.status(200).send({ status: 200, message: 'Insert successful', data: data });
    } catch (err) {
      console.error(err);
      if (err.code === 'EREQUEST' && err.originalError.info.number === 2627) {
        // Error de violación de restricción de llave primaria
        const primaryKeyColumn = err.originalError.info.message;
        res.status(200).send({ status: 205, message:` '${primaryKeyColumn}' ` });
      } 
      
      else if (err.code === 'EREQUEST' && err.originalError.info.number === 547) {
        // Error de restricción de columna no nula
        const notNullColumn = err.originalError.info.message;
        res.status(200).send({ status: 207, message: `'${notNullColumn}'` });
      }
      
      else {
        res.status(500).send({ status: 500, message: 'Internal Server Error' });
      } 
      
    } finally {
      sql.close();
    }
  });

app.get('/api/select/:tableName/:columns?', async (req, res) => {
    try {
      await ensureConnection();
  
      const tableName = req.params.tableName; // Nombre de la tabla desde la URL
      const columns = req.params.columns || '*'; // Columnas desde la URL (opcional)
      const conditions = req.query; // Condiciones desde los parámetros de la URL
  
      // Verificar si las columnas existen en la tabla
      const tableColumnsQuery = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName`;
      const columnRequest = new sql.Request();
      columnRequest.input('tableName', sql.NVarChar, tableName);
  
      const tableColumnsResult = await columnRequest.query(tableColumnsQuery);
      const tableColumns = tableColumnsResult.recordset.map(row => row.COLUMN_NAME);
  
      // Validar columnas en las condiciones
      const conditionKeys = Object.keys(conditions);
      const invalidColumns = conditionKeys.filter(key => !tableColumns.includes(key));
  
      if (invalidColumns.length > 0) {
        return res.status(400).send({ 
          status: 400, 
          message: `Invalid columns: ${invalidColumns.join(', ')}` 
        });
      }
  
      // Construir la consulta SQL
      let query = `SELECT ${columns} FROM ${tableName}`;
      if (conditionKeys.length > 0) {
        query += ' WHERE ' + conditionKeys.map(key => `${key} = @${key}`).join(' AND ');
      }
  
      // Preparar los parámetros
      const request = new sql.Request();
      conditionKeys.forEach(key => {
        request.input(key, conditions[key]);
      });
  
      // Ejecutar la consulta
      console.log(query);
      const result = await request.query(query);
  
      if (result.recordset.length > 0) {
        res.status(200).send({ 
          status: 200, 
          message: 'Right Query', 
          data: result.recordset 
        }); // Datos encontrados
      } else {
        res.status(200).send({ 
          status: 204,  
          message: 'Empty Query', 
          data: [] 
        }); // Sin datos
      }
    } catch (err) {
      console.error(err);
      res.status(500).send({ 
        status: 500, 
        message: 'Internal Server Error' 
      }); // Error de conexión o consulta
    } finally {
      sql.close();
    }
  });
  

app.put('/api/update/:tableName/:id', async (req, res) => {
  try {
    await ensureConnection();

    const tableName = req.params.tableName;
    const id = req.params.id;
    const data = req.body;
    const columns = Object.keys(data);
    const values = Object.values(data);

    // Verificar si las columnas existen en la tabla
    const tableColumnsQuery = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tableName}'`;
    const tableColumnsQueryPk = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS AS TC INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE AS KU ON TC.CONSTRAINT_TYPE = 'PRIMARY KEY' AND TC.CONSTRAINT_NAME = KU.CONSTRAINT_NAME AND KU.table_name='${tableName}'`;
    const tableColumnsResult = await sql.query(tableColumnsQuery);
    const tableColumnsResultPk = await sql.query(tableColumnsQueryPk);
    const tableColumns = tableColumnsResult.recordset.map(row => row.COLUMN_NAME);
    const tableColumnsPk = tableColumnsResultPk.recordset.map(row => row.COLUMN_NAME);

    const invalidColumns = columns.filter(column => !tableColumns.includes(column));

    if (invalidColumns.length > 0) {
      return res.status(400).send({ status: 400, message: `Invalid columns: ${invalidColumns.join(', ')}` });
    }

    const setClause = columns.map((column, index) => `${column} = '${values[index]}'`).join(', ');

    const query = `UPDATE ${tableName} SET ${setClause} WHERE ${tableColumnsPk} = ${id}`;
    console.log(query);

    const result = await sql.query(query);
    res.status(200).send({ status: 200, message: 'Update successful', data: data });
  } catch (err) {
    console.error(err);
    res.status(500).send({ status: 500, message: 'Internal Server Error' });
  } finally {
    sql.close();
  }
});
/*
app.delete('/api/delete/:tableName/:id', async (req, res) => {
  try {
    await sql.connect(config);

    const tableName = req.params.tableName;
    const id = req.params.id;

    // Verificar si la tabla y la columna ID existen
    const tableColumnsQuery = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tableName}'`;
    const tableColumnsQueryPk = `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS AS TC INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE AS KU ON TC.CONSTRAINT_TYPE = 'PRIMARY KEY' AND TC.CONSTRAINT_NAME = KU.CONSTRAINT_NAME AND KU.table_name='${tableName}'`;
    const tableColumnsResult = await sql.query(tableColumnsQuery);
    const tableColumnsResultPk = await sql.query(tableColumnsQueryPk);
    const tableColumns = tableColumnsResult.recordset.map(row => row.COLUMN_NAME);
    const tableColumnsPk = tableColumnsResultPk.recordset.map(row => row.COLUMN_NAME);


    const query = `DELETE FROM ${tableName}  WHERE ${tableColumnsPk} = ${id}`;
    console.log(query);

    const result = await sql.query(query);
    res.status(200).send({ status: 200, message: 'Delete successful' });
  } catch (err) {
    console.error(err);
    res.status(500).send({ status: 500, message: 'Internal Server Error' });
  } finally {
    sql.close();
  }
});
*/

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});