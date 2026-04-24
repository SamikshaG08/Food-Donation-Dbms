const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  db.query('SELECT * FROM Food_Item', (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results);
  });
});

router.get('/available', (req, res) => {
  db.query(
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
       c.Quantity
     FROM Contains c
     JOIN Donation_Details dd ON c.Donation_ID = dd.Donation_ID
     JOIN Food_Item fi ON c.Food_ID = fi.Food_ID
     LEFT JOIN Donor d ON dd.Donor_ID = d.Donor_ID
     WHERE dd.Status = 'Pending'
       AND NOT EXISTS (
         SELECT 1
         FROM FoodRequests fr
         WHERE fr.Donation_ID = dd.Donation_ID
           AND fr.Food_ID = fi.Food_ID
           AND fr.Status IN ('Pending', 'Approved')
       )
     ORDER BY dd.Donation_Date DESC, dd.Pickup_Time DESC`,
    (err, results) => {
      if (err) return res.status(500).json({ error: err.sqlMessage });
      res.json(results);
    }
  );
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
