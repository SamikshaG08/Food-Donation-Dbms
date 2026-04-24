const express = require('express');
const router = express.Router();
const db = require('../db');
const DEFAULT_NGO_ID = 'N1';

router.get('/', (req, res) => {
  db.query('SELECT * FROM Volunteer', (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results);
  });
});

router.post('/', (req, res) => {
  const { Volunteer_ID, Name, Phone, Area_Assigned, Availability_Status } = req.body;
  db.query('INSERT INTO Volunteer VALUES (?,?,?,?,?,?)',
    [Volunteer_ID, Name, Phone, Area_Assigned, Availability_Status, DEFAULT_NGO_ID],
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

// PUT rate a volunteer
router.put('/rate', (req, res) => {
  const { Volunteer_ID, Rating } = req.body;

  db.query(
    `UPDATE Volunteer SET 
     Rating = ROUND((COALESCE(Rating, 0) * Total_Deliveries + ?) 
              / (Total_Deliveries + 1), 2),
     Total_Deliveries = Total_Deliveries + 1
     WHERE Volunteer_ID = ?`,
    [Rating, Volunteer_ID],
    (err) => {
      if (err) return res.status(500).json({ error: err.sqlMessage });
      res.json({ message: `⭐ Volunteer ${Volunteer_ID} rated ${Rating}/5!` });
    }
  );
});

module.exports = router;
