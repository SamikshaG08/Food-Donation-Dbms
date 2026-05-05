const express = require('express');
const router = express.Router();
const db = require('../db');
const { isExpired, refreshExpiredDonationStatuses } = require('../utils/foodSafety');

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

router.get('/', async (req, res) => {
  try {
    await refreshExpiredDonationStatuses(query);

    const results = await query(
      `SELECT d.*, f.Food_Name, f.Prepared_Time, f.Expiry_Time,
              r.Name AS Recipient_Name, v.Name AS Volunteer_Name
       FROM Distributes d
       LEFT JOIN Food_Item f ON d.Food_ID = f.Food_ID
       LEFT JOIN Recipient r ON d.Recipient_ID = r.Recipient_ID
       LEFT JOIN Volunteer v ON d.Volunteer_ID = v.Volunteer_ID`
    );
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.sqlMessage || err.message });
  }
});

router.post('/', async (req, res) => {
  const { Food_ID, Recipient_ID, Volunteer_ID, Distribution_Date, Quantity_Distribution } = req.body;

  try {
    await query(
      `INSERT INTO Distributes
       (Food_ID, Recipient_ID, Volunteer_ID, Distribution_Date, Quantity_Distribution)
       VALUES (?,?,?,?,?)`,
      [Food_ID, Recipient_ID, Volunteer_ID, Distribution_Date, Quantity_Distribution]
    );
    res.json({ message: 'Distribution added!' });
  } catch (err) {
    res.status(500).json({ error: err.sqlMessage || err.message });
  }
});

// PUT update delivery status
router.put('/status', async (req, res) => {
  const { Food_ID, Recipient_ID, Volunteer_ID, Delivery_Status } = req.body;

  try {
    await refreshExpiredDonationStatuses(query);

    const rows = await query(
      `SELECT d.Delivery_Status, f.Expiry_Time
       FROM Distributes d
       JOIN Food_Item f ON f.Food_ID = d.Food_ID
       WHERE d.Food_ID = ? AND d.Recipient_ID = ? AND d.Volunteer_ID = ?`,
      [Food_ID, Recipient_ID, Volunteer_ID]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Distribution not found.' });
    }

    if (isExpired(rows[0].Expiry_Time)) {
      return res.status(400).json({ error: 'This food item has expired and delivery cannot continue.' });
    }

    await query(
      `UPDATE Distributes SET Delivery_Status = ?
       WHERE Food_ID = ? AND Recipient_ID = ? AND Volunteer_ID = ?`,
      [Delivery_Status, Food_ID, Recipient_ID, Volunteer_ID]
    );

    if (Delivery_Status === 'Delivered') {
      await query(
        `UPDATE Volunteer
         SET Availability_Status = 'Available'
         WHERE Volunteer_ID = ?`,
        [Volunteer_ID]
      );
    }

    res.json({ message: `Status updated to ${Delivery_Status}!` });
  } catch (err) {
    res.status(500).json({ error: err.sqlMessage || err.message });
  }
});

// PUT recipient accepts delivered order
router.put('/accept', async (req, res) => {
  const { Food_ID, Recipient_ID, Volunteer_ID } = req.body;

  if (!Food_ID || !Recipient_ID || !Volunteer_ID) {
    return res.status(400).json({ error: 'Food, recipient and volunteer are required.' });
  }

  try {
    const result = await query(
      `UPDATE Distributes
       SET Recipient_Accepted = TRUE, Accepted_At = NOW()
       WHERE Food_ID = ? AND Recipient_ID = ? AND Volunteer_ID = ?
         AND Delivery_Status = 'Delivered'`,
      [Food_ID, Recipient_ID, Volunteer_ID]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({ error: 'Delivery must be marked Delivered before accepting.' });
    }
    res.json({ message: 'Delivery accepted. Please rate your volunteer.' });
  } catch (err) {
    res.status(500).json({ error: err.sqlMessage || err.message });
  }
});

// PUT recipient rates volunteer for a completed delivery
router.put('/rate', async (req, res) => {
  const { Food_ID, Recipient_ID, Volunteer_ID, Rating } = req.body;
  const numericRating = Number(Rating);

  if (!Food_ID || !Recipient_ID || !Volunteer_ID || !Number.isInteger(numericRating) ||
      numericRating < 1 || numericRating > 5) {
    return res.status(400).json({ error: 'Food, recipient, volunteer and rating 1-5 are required.' });
  }

  try {
    const rows = await query(
      `SELECT Delivery_Status, Recipient_Accepted, Recipient_Rating
       FROM Distributes
       WHERE Food_ID = ? AND Recipient_ID = ? AND Volunteer_ID = ?`,
      [Food_ID, Recipient_ID, Volunteer_ID]
    );

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

    await query(
      `UPDATE Distributes
       SET Recipient_Rating = ?, Rated_At = NOW()
       WHERE Food_ID = ? AND Recipient_ID = ? AND Volunteer_ID = ?`,
      [numericRating, Food_ID, Recipient_ID, Volunteer_ID]
    );

    await query(
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
      [Volunteer_ID, Volunteer_ID, Volunteer_ID]
    );

    res.json({ message: `Volunteer rated ${numericRating}/5. Thank you!` });
  } catch (err) {
    res.status(500).json({ error: err.sqlMessage || err.message });
  }
});

module.exports = router;
