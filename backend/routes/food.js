const express = require('express');
const router = express.Router();
const db = require('../db');
const {
  getFoodSafetyValidationError,
  normalizeDateTimeInput,
  refreshExpiredDonationStatuses
} = require('../utils/foodSafety');

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
    const results = await query('SELECT * FROM Food_Item');
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.sqlMessage || err.message });
  }
});

router.get('/available', async (req, res) => {
  try {
    await refreshExpiredDonationStatuses(query);

    const results = await query(
      `SELECT
         dd.Donation_ID,
         dd.Donation_Date,
         dd.Pickup_Time,
         dd.Status,
         d.Name AS Donor_Name,
         d.City AS Donor_City,
         fi.Food_ID,
         fi.Food_Name,
         fi.Food_Type,
         fi.Shelf_Life,
         fi.Prepared_Time,
         fi.Expiry_Time,
         c.Quantity,
         TIMESTAMPDIFF(SECOND, NOW(), fi.Expiry_Time) AS Seconds_Until_Expiry
       FROM Contains c
       JOIN Donation_Details dd ON c.Donation_ID = dd.Donation_ID
       JOIN Food_Item fi ON c.Food_ID = fi.Food_ID
       LEFT JOIN Donor d ON dd.Donor_ID = d.Donor_ID
       WHERE dd.Status IN ('Pending', 'Partially Fulfilled')
         AND c.Quantity IS NOT NULL
         AND c.Quantity <> ''
         AND c.Quantity NOT LIKE '0 %'
         AND c.Quantity <> '0'
         AND fi.Expiry_Time > NOW()
       ORDER BY fi.Expiry_Time ASC, dd.Donation_Date DESC, dd.Pickup_Time DESC`
    );

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.sqlMessage || err.message });
  }
});

router.post('/', async (req, res) => {
  const { Food_ID, Food_Name, Food_Type, Shelf_Life, Prepared_Time, Expiry_Time } = req.body;
  const foodSafetyError = getFoodSafetyValidationError({
    preparedTime: Prepared_Time,
    expiryTime: Expiry_Time
  });

  if (foodSafetyError) {
    return res.status(400).json({ error: foodSafetyError });
  }

  try {
    await query(
      `INSERT INTO Food_Item
       (Food_ID, Food_Name, Food_Type, Shelf_Life, Prepared_Time, Expiry_Time)
       VALUES (?,?,?,?,?,?)`,
      [
        Food_ID,
        Food_Name,
        Food_Type,
        Shelf_Life,
        normalizeDateTimeInput(Prepared_Time),
        normalizeDateTimeInput(Expiry_Time)
      ]
    );
    res.json({ message: 'Food item added!' });
  } catch (err) {
    res.status(500).json({ error: err.sqlMessage || err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM Food_Item WHERE Food_ID = ?', [req.params.id]);
    res.json({ message: 'Food item deleted!' });
  } catch (err) {
    res.status(500).json({ error: err.sqlMessage || err.message });
  }
});

module.exports = router;
