const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  db.query('SELECT * FROM NGO ORDER BY NGO_ID ASC LIMIT 1', (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results);
  });
});

router.post('/', (req, res) => {
  res.status(400).json({ error: 'Only one NGO is supported in this system.' });
});

router.delete('/:id', (req, res) => {
  res.status(400).json({ error: 'Deleting the NGO is disabled in this system.' });
});

module.exports = router;
