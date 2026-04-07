const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  db.query('SELECT * FROM Volunteer', (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results);
  });
});

router.post('/', (req, res) => {
  const { Volunteer_ID, Name, Phone, Area_Assigned, Availability_Status, NGO_ID } = req.body;
  db.query('INSERT INTO Volunteer VALUES (?,?,?,?,?,?)',
    [Volunteer_ID, Name, Phone, Area_Assigned, Availability_Status, NGO_ID],
    (err) => {
      if (err) return res.status(500).json({ error: err });
      res.json({ message: 'Volunteer added!' });
    });
});

router.delete('/:id', (req, res) => {
  db.query('DELETE FROM Volunteer WHERE Volunteer_ID = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ message: 'Volunteer deleted!' });
  });
});

module.exports = router;