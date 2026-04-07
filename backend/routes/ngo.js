const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  db.query('SELECT * FROM NGO', (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results);
  });
});

router.post('/', (req, res) => {
  const { NGO_ID, NGO_Name, ContactNo, Address, Capacity } = req.body;
  db.query('INSERT INTO NGO VALUES (?,?,?,?,?)',
    [NGO_ID, NGO_Name, ContactNo, Address, Capacity],
    (err) => {
      if (err) return res.status(500).json({ error: err });
      res.json({ message: 'NGO added!' });
    });
});

router.delete('/:id', (req, res) => {
  db.query('DELETE FROM NGO WHERE NGO_ID = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ message: 'NGO deleted!' });
  });
});

module.exports = router;