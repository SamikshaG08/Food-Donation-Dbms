const mysql = require('mysql2');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Samiksha@08',  // 👈 change this!
  database: 'food_donation_db'
});

db.connect(err => {
  if (err) {
    console.error('Connection failed:', err);
    return;
  }
  console.log('✅ MySQL Connected!');
});

module.exports = db;