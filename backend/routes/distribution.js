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

// PUT update delivery status
router.put('/status', (req, res) => {
  const { Food_ID, Recipient_ID, Volunteer_ID, Delivery_Status } = req.body;
  db.query(
    `UPDATE Distributes SET Delivery_Status = ?
     WHERE Food_ID = ? AND Recipient_ID = ? AND Volunteer_ID = ?`,
    [Delivery_Status, Food_ID, Recipient_ID, Volunteer_ID],
    (err) => {
      if (err) return res.status(500).json({ error: err });
      res.json({ message: `Status updated to ${Delivery_Status}!` });
    }
  );
});

module.exports = router;