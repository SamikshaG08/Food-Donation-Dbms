const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all pending confirmations for NGO
router.get('/pending/:ngo_id', (req, res) => {
  db.query(
    `SELECT dc.*, d.Name as Donor_Name, v.Name as Volunteer_Name,
     r.Name as Recipient_Name, dd.Donation_Date
     FROM DeliveryConfirmation dc
     JOIN Volunteer v ON dc.Volunteer_ID = v.Volunteer_ID
     JOIN Recipient r ON dc.Recipient_ID = r.Recipient_ID
     JOIN Donation_Details dd ON dc.Donation_ID = dd.Donation_ID
     JOIN Donor d ON dd.Donor_ID = d.Donor_ID
     WHERE dc.NGO_ID = ? AND dc.NGO_Confirmed = FALSE`,
    [req.params.ngo_id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err });
      res.json(results);
    }
  );
});

// POST NGO confirms delivery + rates volunteer
router.post('/confirm', (req, res) => {
  const { Confirmation_ID, Volunteer_ID, Rating } = req.body;

  // Confirm delivery
  db.query(
    `UPDATE DeliveryConfirmation 
     SET NGO_Confirmed = TRUE, Volunteer_Rating = ?
     WHERE Confirmation_ID = ?`,
    [Rating, Confirmation_ID],
    (err) => {
      if (err) return res.status(500).json({ error: err });

      // Update volunteer rating average
      db.query(
        `UPDATE Volunteer SET 
         Rating = (SELECT AVG(Volunteer_Rating) 
                   FROM DeliveryConfirmation 
                   WHERE Volunteer_ID = ? AND Volunteer_Rating IS NOT NULL),
         Total_Deliveries = Total_Deliveries + 1
         WHERE Volunteer_ID = ?`,
        [Volunteer_ID, Volunteer_ID],
        (err2) => {
          if (err2) return res.status(500).json({ error: err2 });
          res.json({ message: 'Delivery confirmed and volunteer rated!' });
        }
      );
    }
  );
});
// POST create confirmation record
router.post('/', (req, res) => {
  const { Food_ID, Volunteer_ID, Recipient_ID, NGO_ID } = req.body;
  db.query(
    `INSERT INTO DeliveryConfirmation 
     (Donation_ID, Volunteer_ID, Recipient_ID, NGO_ID)
     VALUES (?,?,?,?)`,
    [Food_ID, Volunteer_ID, Recipient_ID, NGO_ID],
    (err) => {
      if (err) return res.status(500).json({ error: err });
      res.json({ message: 'Confirmation created!' });
    }
  );
});
module.exports = router;