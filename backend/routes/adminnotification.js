const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all admin notifications
router.get('/', (req, res) => {
  db.query(
    `SELECT * FROM AdminNotifications 
     ORDER BY Created_At DESC`,
    (err, results) => {
      if (err) return res.status(500).json({ error: err.sqlMessage });
      res.json(results);
    }
  );
});

function buildPublicSummary(notification) {
  const message = notification.Message || '';
  const donorMatch = message.match(/Donor\s+([A-Za-z0-9_-]+)/i);
  const requestMatch = message.match(/New food request\s+([A-Za-z0-9_-]+)/i);

  if (donorMatch) {
    return `1 notification from Donor ${donorMatch[1]}`;
  }

  if (requestMatch) {
    return `1 new food request notification`;
  }

  return '1 new admin notification';
}

// GET latest admin notification summaries for login page
router.get('/public/latest', (req, res) => {
  db.query(
    `SELECT Notification_ID, Message, Is_Read, Created_At
     FROM AdminNotifications
     ORDER BY Created_At DESC
     LIMIT 20`,
    (err, results) => {
      if (err) return res.status(500).json({ error: err.sqlMessage });
      res.json(results.map(n => ({
        Notification_ID: n.Notification_ID,
        Is_Read: n.Is_Read,
        Created_At: n.Created_At,
        Summary: buildPublicSummary(n)
      })));
    }
  );
});

// PUT mark as read
router.put('/read/:id', (req, res) => {
  db.query(
    `UPDATE AdminNotifications SET Is_Read = TRUE 
     WHERE Notification_ID = ?`,
    [req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.sqlMessage });
      res.json({ message: 'Marked as read!' });
    }
  );
});

// PUT mark all as read
router.put('/readall', (req, res) => {
  db.query(
    `UPDATE AdminNotifications SET Is_Read = TRUE`,
    (err) => {
      if (err) return res.status(500).json({ error: err.sqlMessage });
      res.json({ message: 'All marked as read!' });
    }
  );
});

module.exports = router;
