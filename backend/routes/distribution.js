const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  db.query(
    `SELECT d.*, f.Food_Name, r.Name AS Recipient_Name, v.Name AS Volunteer_Name
     FROM Distributes d
     LEFT JOIN Food_Item f ON d.Food_ID = f.Food_ID
     LEFT JOIN Recipient r ON d.Recipient_ID = r.Recipient_ID
     LEFT JOIN Volunteer v ON d.Volunteer_ID = v.Volunteer_ID`,
    (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results);
    }
  );
});

router.post('/', (req, res) => {
  const { Food_ID, Recipient_ID, Volunteer_ID, Distribution_Date, Quantity_Distribution } = req.body;
  db.query(
    `INSERT INTO Distributes
     (Food_ID, Recipient_ID, Volunteer_ID, Distribution_Date, Quantity_Distribution)
     VALUES (?,?,?,?,?)`,
    [Food_ID, Recipient_ID, Volunteer_ID, Distribution_Date, Quantity_Distribution],
    (err) => {
      if (err) return res.status(500).json({ error: err });
      res.json({ message: 'Distribution added!' });
    }
  );
});

// PUT update delivery status
router.put('/status', (req, res) => {
  const { Food_ID, Recipient_ID, Volunteer_ID, Delivery_Status } = req.body;
  db.query(
    `UPDATE Distributes SET Delivery_Status = ?
     WHERE Food_ID = ? AND Recipient_ID = ? AND Volunteer_ID = ?`,
    [Delivery_Status, Food_ID, Recipient_ID, Volunteer_ID],
    (err) => {
      if (err) return res.status(500).json({ error: err });

      if (Delivery_Status === 'Delivered') {
        db.query(
          `UPDATE Volunteer
           SET Availability_Status = 'Available'
           WHERE Volunteer_ID = ?`,
          [Volunteer_ID],
          (volErr) => {
            if (volErr) return res.status(500).json({ error: volErr.sqlMessage });
            res.json({ message: `Status updated to ${Delivery_Status}!` });
          }
        );
        return;
      }

      res.json({ message: `Status updated to ${Delivery_Status}!` });
    }
  );
});

// PUT recipient accepts delivered order
router.put('/accept', (req, res) => {
  const { Food_ID, Recipient_ID, Volunteer_ID } = req.body;

  if (!Food_ID || !Recipient_ID || !Volunteer_ID) {
    return res.status(400).json({ error: 'Food, recipient and volunteer are required.' });
  }

  db.query(
    `UPDATE Distributes
     SET Recipient_Accepted = TRUE, Accepted_At = NOW()
     WHERE Food_ID = ? AND Recipient_ID = ? AND Volunteer_ID = ?
       AND Delivery_Status = 'Delivered'`,
    [Food_ID, Recipient_ID, Volunteer_ID],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.sqlMessage });
      if (result.affectedRows === 0) {
        return res.status(400).json({ error: 'Delivery must be marked Delivered before accepting.' });
      }
      res.json({ message: 'Delivery accepted. Please rate your volunteer.' });
    }
  );
});

// PUT recipient rates volunteer for a completed delivery
router.put('/rate', (req, res) => {
  const { Food_ID, Recipient_ID, Volunteer_ID, Rating } = req.body;
  const numericRating = Number(Rating);

  if (!Food_ID || !Recipient_ID || !Volunteer_ID || !Number.isInteger(numericRating) ||
      numericRating < 1 || numericRating > 5) {
    return res.status(400).json({ error: 'Food, recipient, volunteer and rating 1-5 are required.' });
  }

  db.query(
    `SELECT Delivery_Status, Recipient_Accepted, Recipient_Rating
     FROM Distributes
     WHERE Food_ID = ? AND Recipient_ID = ? AND Volunteer_ID = ?`,
    [Food_ID, Recipient_ID, Volunteer_ID],
    (findErr, rows) => {
      if (findErr) return res.status(500).json({ error: findErr.sqlMessage });
      if (!rows.length) return res.status(404).json({ error: 'Delivery not found.' });
      if (rows[0].Delivery_Status !== 'Delivered') {
        return res.status(400).json({ error: 'You can rate only after the food is delivered.' });
      }
      if (!rows[0].Recipient_Accepted) {
        return res.status(400).json({ error: 'Please accept the delivery before rating.' });
      }
      if (rows[0].Recipient_Rating) {
        return res.status(400).json({ error: 'You have already rated this delivery.' });
      }

      db.query(
        `UPDATE Distributes
         SET Recipient_Rating = ?, Rated_At = NOW()
         WHERE Food_ID = ? AND Recipient_ID = ? AND Volunteer_ID = ?`,
        [numericRating, Food_ID, Recipient_ID, Volunteer_ID],
        (rateErr) => {
          if (rateErr) return res.status(500).json({ error: rateErr.sqlMessage });

          db.query(
            `UPDATE Volunteer v
             SET
               Rating = (
                 SELECT ROUND(AVG(Recipient_Rating), 2)
                 FROM Distributes
                 WHERE Volunteer_ID = ? AND Recipient_Rating IS NOT NULL
               ),
               Total_Deliveries = (
                 SELECT COUNT(*)
                 FROM Distributes
                 WHERE Volunteer_ID = ? AND Recipient_Rating IS NOT NULL
               )
             WHERE v.Volunteer_ID = ?`,
            [Volunteer_ID, Volunteer_ID, Volunteer_ID],
            (volErr) => {
              if (volErr) return res.status(500).json({ error: volErr.sqlMessage });
              res.json({ message: `Volunteer rated ${numericRating}/5. Thank you!` });
            }
          );
        }
      );
    }
  );
});

module.exports = router;
