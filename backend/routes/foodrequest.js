const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all food requests (for admin)
router.get('/', (req, res) => {
  db.query(
    `SELECT fr.*, r.Name as Recipient_Name, 
     f.Food_Name, f.Food_Type, f.Shelf_Life
     FROM FoodRequests fr
     JOIN Recipient r ON fr.Recipient_ID = r.Recipient_ID
     JOIN Food_Item f ON fr.Food_ID = f.Food_ID
     ORDER BY fr.Request_Date DESC`,
    (err, results) => {
      if (err) return res.status(500).json({ error: err.sqlMessage });
      res.json(results);
    }
  );
});

// GET requests by recipient
router.get('/my/:recipient_id', (req, res) => {
  db.query(
    `SELECT fr.*, f.Food_Name, f.Food_Type, f.Shelf_Life
     FROM FoodRequests fr
     JOIN Food_Item f ON fr.Food_ID = f.Food_ID
     WHERE fr.Recipient_ID = ?
     ORDER BY fr.Request_Date DESC`,
    [req.params.recipient_id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.sqlMessage });
      res.json(results);
    }
  );
});

// POST create food request
router.post('/', (req, res) => {
  const { Request_ID, Recipient_ID, Food_ID, Quantity_Needed } = req.body;
  db.query(
    `INSERT INTO FoodRequests 
     (Request_ID, Recipient_ID, Food_ID, Quantity_Needed)
     VALUES (?,?,?,?)`,
    [Request_ID, Recipient_ID, Food_ID, Quantity_Needed],
    (err) => {
      if (err) return res.status(500).json({ error: err.sqlMessage });
      res.json({ message: 'Food request submitted successfully!' });
    }
  );
});

// PUT approve/reject request (admin)
router.put('/status', (req, res) => {
  const { Request_ID, Status } = req.body;
  db.query(
    `UPDATE FoodRequests SET Status = ? WHERE Request_ID = ?`,
    [Status, Request_ID],
    (err) => {
      if (err) return res.status(500).json({ error: err.sqlMessage });
      res.json({ message: `Request ${Status}!` });
    }
  );
});

module.exports = router;