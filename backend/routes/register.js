const express = require('express');
const router = express.Router();
const db = require('../db');
const DEFAULT_NGO_ID = 'N1';

// Register new Donor
router.post('/donor', (req, res) => {
  const {
    Donor_ID, Name, Phone, Email,
    Password, Donor_Type, Street, City, Pincode
  } = req.body;

  // First insert into Donor table
  db.query(
    `INSERT INTO Donor 
     (Donor_ID, Name, Phone, Email, Donor_Type, Street, City, Pincode)
     VALUES (?,?,?,?,?,?,?,?)`,
    [Donor_ID, Name, Phone, Email, Donor_Type, Street, City, Pincode],
    (err) => {
      if (err) return res.status(500).json({ error: err.sqlMessage });

      // Generate User_ID
      const User_ID = 'U' + Date.now();

      // Then insert into Users table
      db.query(
        `INSERT INTO Users (User_ID, Username, Password, Role, Ref_ID, Email)
         VALUES (?,?,?,?,?,?)`,
        [User_ID, Email, Password, 'Donor', Donor_ID, Email],
        (err2) => {
          if (err2) return res.status(500).json({ error: err2.sqlMessage });
          res.json({ message: 'Donor registered successfully!' });
        }
      );
    }
  );
});

// Register new Volunteer
router.post('/volunteer', (req, res) => {
  const {
    Volunteer_ID, Name, Phone, Email,
    Password, Area_Assigned
  } = req.body;

  db.query(
    `INSERT INTO Volunteer
     (Volunteer_ID, Name, Phone, Area_Assigned, Availability_Status, NGO_ID)
     VALUES (?,?,?,?,'Available',?)`,
    [Volunteer_ID, Name, Phone, Area_Assigned, DEFAULT_NGO_ID],
    (err) => {
      if (err) return res.status(500).json({ error: err.sqlMessage });

      const User_ID = 'U' + Date.now();
      db.query(
        `INSERT INTO Users (User_ID, Username, Password, Role, Ref_ID, Email)
         VALUES (?,?,?,?,?,?)`,
        [User_ID, Email, Password, 'Volunteer', Volunteer_ID, Email],
        (err2) => {
          if (err2) return res.status(500).json({ error: err2.sqlMessage });
          res.json({ message: 'Volunteer registered successfully!' });
        }
      );
    }
  );
});

// Register new Recipient
router.post('/recipient', (req, res) => {
  const {
    Recipient_ID, Name, Contact, Email,
    Password, Location
  } = req.body;

  db.query(
    `INSERT INTO Recipient (Recipient_ID, Name, Contact, Location)
     VALUES (?,?,?,?)`,
    [Recipient_ID, Name, Contact, Location],
    (err) => {
      if (err) return res.status(500).json({ error: err.sqlMessage });

const User_ID = 'U' + Math.floor(Math.random() * 9000 + 1000);      db.query(
        `INSERT INTO Users (User_ID, Username, Password, Role, Ref_ID, Email)
         VALUES (?,?,?,?,?,?)`,
        [User_ID, Email, Password, 'Recipient', Recipient_ID, Email],
        (err2) => {
          if (err2) return res.status(500).json({ error: err2.sqlMessage });
          res.json({ message: 'Recipient registered successfully!' });
        }
      );
    }
  );
});

module.exports = router;
