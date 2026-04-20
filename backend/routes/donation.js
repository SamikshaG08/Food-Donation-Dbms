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
  db.query(
    `INSERT INTO Donation_Details 
     (Donation_ID, Donation_Date, Pickup_Time, Status, Donor_ID) 
     VALUES (?,?,?,?,?)`,
    [Donation_ID, Donation_Date, Pickup_Time, Status, Donor_ID],
    (err) => {
      if (err) return res.status(500).json({ error: err.sqlMessage });
      res.json({ message: 'Donation added!' });
    }
  );
});


router.delete('/:id', (req, res) => {
  db.query('DELETE FROM Donation_Details WHERE Donation_ID = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ message: 'Donation deleted!' });
  });
});

router.put('/assign', (req, res) => {
  const { Donation_ID, Volunteer_ID } = req.body;
  db.query(
    `UPDATE Donation_Details SET Volunteer_ID = ?, Status = 'Collected' 
     WHERE Donation_ID = ?`,
    [Volunteer_ID, Donation_ID],
    (err) => {
      if (err) return res.status(500).json({ error: err });
      res.json({ message: `Volunteer ${Volunteer_ID} assigned to ${Donation_ID}!` });
    }
  );
});

module.exports = router;