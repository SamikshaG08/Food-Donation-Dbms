const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  db.query('SELECT * FROM Donor', (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results);
  });
});

router.post('/', (req, res) => {
  const { Donor_ID, Name, Phone, Email, Donor_Type, Street, City, Pincode } = req.body;
  db.query('INSERT INTO Donor VALUES (?,?,?,?,?,?,?,?)',
    [Donor_ID, Name, Phone, Email, Donor_Type, Street, City, Pincode],
    (err) => {
      if (err) return res.status(500).json({ error: err });
      res.json({ message: 'Donor added!' });
    });
});

router.delete('/:id', (req, res) => {
  db.query('DELETE FROM Donor WHERE Donor_ID = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ message: 'Donor deleted!' });
  });
});

module.exports = router;