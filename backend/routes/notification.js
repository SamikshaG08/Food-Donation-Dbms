const express = require('express');
const router = express.Router();
const db = require('../db');

// GET notifications for a recipient
router.get('/:recipient_id', (req, res) => {
  db.query(
    'SELECT * FROM Notifications WHERE Recipient_ID = ? ORDER BY Created_At DESC',
    [req.params.recipient_id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err });
      res.json(results);
    }
  );
});

// POST create notification
router.post('/', (req, res) => {
  const { Recipient_ID, Message } = req.body;
  db.query(
    'INSERT INTO Notifications (Recipient_ID, Message) VALUES (?,?)',
    [Recipient_ID, Message],
    (err) => {
      if (err) return res.status(500).json({ error: err });
      res.json({ message: 'Notification sent!' });
    }
  );
});

// PUT mark as read
router.put('/read/:id', (req, res) => {
  db.query(
    'UPDATE Notifications SET Is_Read = TRUE WHERE Notification_ID = ?',
    [req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err });
      res.json({ message: 'Marked as read!' });
    }
  );
});

module.exports = router;