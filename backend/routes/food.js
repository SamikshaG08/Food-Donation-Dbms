const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  db.query('SELECT * FROM Food_Item', (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results);
  });
});

router.post('/', (req, res) => {
  const { Food_ID, Food_Name, Food_Type, Shelf_Life } = req.body;
  db.query('INSERT INTO Food_Item VALUES (?,?,?,?)',
    [Food_ID, Food_Name, Food_Type, Shelf_Life],
    (err) => {
      if (err) return res.status(500).json({ error: err });
      res.json({ message: 'Food item added!' });
    });
});

router.delete('/:id', (req, res) => {
  db.query('DELETE FROM Food_Item WHERE Food_ID = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ message: 'Food item deleted!' });
  });
});

module.exports = router;