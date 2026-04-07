const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  db.query('SELECT * FROM Distributes', (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results);
  });
});

router.post('/', (req, res) => {
  const { Food_ID, Recipient_ID, Volunteer_ID, Distribution_Date, Quantity_Distribution } = req.body;
  db.query('INSERT INTO Distributes VALUES (?,?,?,?,?)',
    [Food_ID, Recipient_ID, Volunteer_ID, Distribution_Date, Quantity_Distribution],
    (err) => {
      if (err) return res.status(500).json({ error: err });
      res.json({ message: 'Distribution added!' });
    });
});

module.exports = router;