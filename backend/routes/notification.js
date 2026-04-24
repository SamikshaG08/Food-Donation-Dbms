const express = require('express');
const router = express.Router();
const db = require('../db');

function buildVolunteerPublicSummary(notification) {
  const message = notification.Message || '';
  const donorMatch = message.match(/Donor\s+([A-Za-z0-9_-]+)/i);
  const requestMatch = message.match(/Nearby food request\s+([A-Za-z0-9_-]+)/i);

  if (donorMatch) {
    return `1 notification from Donor ${donorMatch[1]}`;
  }

  if (requestMatch) {
    return '1 nearby food request notification';
  }

  return '1 new volunteer notification';
}

// GET latest volunteer notification summaries for login page
router.get('/volunteer-public/latest', (req, res) => {
  db.query(
    `SELECT Notification_ID, Volunteer_ID, Message, Is_Read, Created_At
     FROM VolunteerNotifications
     ORDER BY Created_At DESC
     LIMIT 20`,
    (err, results) => {
      if (err) return res.status(500).json({ error: err.sqlMessage });
      res.json(results.map(n => ({
        Notification_ID: n.Notification_ID,
        Volunteer_ID: n.Volunteer_ID,
        Is_Read: n.Is_Read,
        Created_At: n.Created_At,
        Summary: buildVolunteerPublicSummary(n)
      })));
    }
  );
});

// GET notifications for a volunteer
router.get('/volunteer/:volunteer_id', (req, res) => {
  db.query(
    'SELECT * FROM VolunteerNotifications WHERE Volunteer_ID = ? ORDER BY Created_At DESC',
    [req.params.volunteer_id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.sqlMessage });
      res.json(results);
    }
  );
});

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

// POST create volunteer notification
router.post('/volunteer', (req, res) => {
  const { Volunteer_ID, Message } = req.body;
  db.query(
    'INSERT INTO VolunteerNotifications (Volunteer_ID, Message) VALUES (?,?)',
    [Volunteer_ID, Message],
    (err) => {
      if (err) return res.status(500).json({ error: err.sqlMessage });
      res.json({ message: 'Volunteer notification sent!' });
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

// PUT mark volunteer notification as read
router.put('/volunteer/read/:id', (req, res) => {
  db.query(
    'UPDATE VolunteerNotifications SET Is_Read = TRUE WHERE Notification_ID = ?',
    [req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.sqlMessage });
      res.json({ message: 'Marked as read!' });
    }
  );
});

module.exports = router;
