const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  db.query('SELECT * FROM Donation_Details', (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results);
  });
});

router.post('/', (req, res) => {
  const { Donation_ID, Donation_Date, Pickup_Time, Status, Donor_ID } = req.body;
  db.query('INSERT INTO Donation_Details VALUES (?,?,?,?,?)',
    [Donation_ID, Donation_Date, Pickup_Time, Status, Donor_ID],
    (err) => {
      if (err) return res.status(500).json({ error: err });
      res.json({ message: 'Donation added!' });
    });
});

router.delete('/:id', (req, res) => {
  db.query('DELETE FROM Donation_Details WHERE Donation_ID = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ message: 'Donation deleted!' });
  });
});

module.exports = router;