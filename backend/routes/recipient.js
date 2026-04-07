const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  db.query('SELECT * FROM Recipient', (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results);
  });
});

router.post('/', (req, res) => {
  const { Recipient_ID, Name, Contact, Location } = req.body;
  db.query('INSERT INTO Recipient VALUES (?,?,?,?)',
    [Recipient_ID, Name, Contact, Location],
    (err) => {
      if (err) return res.status(500).json({ error: err });
      res.json({ message: 'Recipient added!' });
    });
});

router.delete('/:id', (req, res) => {
  db.query('DELETE FROM Recipient WHERE Recipient_ID = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ message: 'Recipient deleted!' });
  });
});

module.exports = router;