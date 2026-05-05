const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  db.query('SELECT * FROM Donor', (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results);
  });
});

router.get('/:id', (req, res) => {
  db.query('SELECT * FROM Donor WHERE Donor_ID = ?', [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.sqlMessage || err.message });
    if (results.length === 0) return res.status(404).json({ error: 'Donor not found' });
    res.json(results[0]);
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
