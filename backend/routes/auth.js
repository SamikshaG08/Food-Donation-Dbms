const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');

const SECRET_KEY = 'fooddonation2024';

router.post('/login', (req, res) => {
  const { email, password } = req.body;

  db.query(
    'SELECT * FROM Users WHERE Email = ?',
    [email],
    (err, results) => {
      if (err) return res.status(500).json({ error: err });
      if (results.length === 0)
        return res.status(401).json({ error: 'Email not found!' });

      const user = results[0];

      if (password !== user.Password)
        return res.status(401).json({ error: 'Wrong password!' });

      const token = jwt.sign({
        user_id: user.User_ID,
        email: user.Email,
        role: user.Role,
        ref_id: user.Ref_ID
      }, SECRET_KEY, { expiresIn: '24h' });

      res.json({
        message: 'Login successful!',
        token,
        role: user.Role,
        ref_id: user.Ref_ID,
        username: user.Email.split('@')[0]
      });
    }
  );
});

module.exports = router;