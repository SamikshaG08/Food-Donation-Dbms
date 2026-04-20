const express = require('express');
const router = express.Router();
const db = require('../db');

// UPDATE volunteer location
router.post('/update', (req, res) => {
  const { Volunteer_ID, Latitude, Longitude, Donation_ID } = req.body;
  
  db.query(
    `INSERT INTO DeliveryTracking (Volunteer_ID, Latitude, Longitude, Donation_ID)
     VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE Latitude=?, Longitude=?, Updated_At=NOW()`,
    [Volunteer_ID, Latitude, Longitude, Donation_ID, Latitude, Longitude],
    (err) => {
      if (err) return res.status(500).json({ error: err });

      // Check if volunteer is near recipient (within 500 meters)
      db.query(
        `SELECT r.Recipient_ID, r.Latitude, r.Longitude,
         (6371000 * acos(cos(radians(r.Latitude)) * cos(radians(?))
         * cos(radians(?) - radians(r.Longitude))
         + sin(radians(r.Latitude)) * sin(radians(?)))) AS distance
         FROM Recipient r
         JOIN Distributes d ON r.Recipient_ID = d.Recipient_ID
         WHERE d.Volunteer_ID = ? AND d.Delivery_Status = 'InTransit'
         HAVING distance < 500`,
        [Latitude, Longitude, Latitude, Volunteer_ID],
        (err2, nearby) => {
          if (nearby && nearby.length > 0) {
            // Send notification to recipient
            nearby.forEach(recipient => {
              db.query(
                'INSERT INTO Notifications (Recipient_ID, Message) VALUES (?,?)',
                [recipient.Recipient_ID, 
                 '🚚 Your volunteer is nearby! Food will arrive soon!'],
                () => {}
              );
            });
          }
          res.json({ message: 'Location updated!', nearby_recipients: nearby });
        }
      );
    }
  );
});

// GET volunteer current location
router.get('/:volunteer_id', (req, res) => {
  db.query(
    'SELECT * FROM DeliveryTracking WHERE Volunteer_ID = ? ORDER BY Updated_At DESC LIMIT 1',
    [req.params.volunteer_id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err });
      res.json(results[0] || null);
    }
  );
});

module.exports = router;