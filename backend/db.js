const mysql = require('mysql2');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Samiksha@08',  // change this!
  database: 'food_donation_db'
});

function getSingleValue(rows, key) {
  return Array.isArray(rows) && rows[0] ? rows[0][key] : null;
}

async function hasColumn(connection, tableName, columnName) {
  const [rows] = await connection.promise().query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );

  return Number(getSingleValue(rows, 'count')) > 0;
}

async function ensureFoodSafetyColumns(connection) {
  const preparedExists = await hasColumn(connection, 'Food_Item', 'Prepared_Time');
  const expiryExists = await hasColumn(connection, 'Food_Item', 'Expiry_Time');

  if (!preparedExists) {
    await connection.promise().query(
      `ALTER TABLE Food_Item
       ADD COLUMN Prepared_Time DATETIME NULL AFTER Shelf_Life`
    );
  }

  if (!expiryExists) {
    await connection.promise().query(
      `ALTER TABLE Food_Item
       ADD COLUMN Expiry_Time DATETIME NULL AFTER Prepared_Time`
    );
  }

  await connection.promise().query(
    `UPDATE Food_Item
     SET Prepared_Time = COALESCE(Prepared_Time, NOW()),
         Expiry_Time = COALESCE(Expiry_Time, DATE_ADD(NOW(), INTERVAL 1 DAY))`
  );

  await connection.promise().query(
    `ALTER TABLE Food_Item
     MODIFY COLUMN Prepared_Time DATETIME NOT NULL,
     MODIFY COLUMN Expiry_Time DATETIME NOT NULL`
  );
}

async function ensureDonationStatusSupportsExpired(connection) {
  await connection.promise().query(
    `ALTER TABLE Donation_Details
     MODIFY COLUMN Status ENUM('Pending','Partially Fulfilled','Collected','Expired','Cancelled') DEFAULT 'Pending'`
  );
}

async function ensureFoodRequestStatusSchema(connection) {
  await connection.promise().query(
    `ALTER TABLE FoodRequests
     MODIFY COLUMN Status ENUM('Pending','Approved','Rejected','Expired','Cancelled') DEFAULT 'Pending'`
  );
}

async function ensureDistributionStatusSchema(connection) {
  await connection.promise().query(
    `ALTER TABLE Distributes
     MODIFY COLUMN Delivery_Status ENUM('Pending','PickedUp','InTransit','Delivered','Cancelled') DEFAULT 'Pending'`
  );
}

async function ensureSchema(connection) {
  await ensureFoodSafetyColumns(connection);
  await ensureDonationStatusSupportsExpired(connection);
  await ensureFoodRequestStatusSchema(connection);
  await ensureDistributionStatusSchema(connection);
}

const ready = new Promise((resolve, reject) => {
  db.connect(async err => {
    if (err) {
      console.error('Connection failed:', err);
      reject(err);
      return;
    }

    console.log('MySQL Connected!');

    try {
      await ensureSchema(db);
      console.log('Database schema ready.');
      resolve();
    } catch (schemaError) {
      console.error('Schema migration failed:', schemaError);
      reject(schemaError);
    }
  });
});

db.ready = ready;

module.exports = db;
