const express = require('express');
const router = express.Router();
const db = require('../db');

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });

function normalizeLocation(value) {
  return String(value || '').trim().toLowerCase();
}

function isNearby(volunteerArea, targetLocation) {
  const area = normalizeLocation(volunteerArea);
  const target = normalizeLocation(targetLocation);

  if (!area || !target) return false;
  return area === target || area.includes(target) || target.includes(area);
}

function chooseVolunteer(volunteers, targetLocation) {
  const available = volunteers.filter(v => v.Availability_Status === 'Available');
  const nearby = available.filter(v => isNearby(v.Area_Assigned, targetLocation));
  const pool = nearby.length > 0 ? nearby : available;

  return pool
    .sort((a, b) => {
      const ratingA = Number(a.Rating || 0);
      const ratingB = Number(b.Rating || 0);
      if (ratingB !== ratingA) return ratingB - ratingA;
      return Number(a.Total_Deliveries || 0) - Number(b.Total_Deliveries || 0);
    })[0] || null;
}

async function assignRequestToVolunteer(request, volunteerId, assignmentMode) {
  const donorLocation = request.Donor_City || 'the donor area';

  await query(
    `INSERT INTO Distributes
     (Food_ID, Recipient_ID, Volunteer_ID, Distribution_Date, Quantity_Distribution, Delivery_Status)
     VALUES (?,?,?,?,?,'Pending')
     ON DUPLICATE KEY UPDATE
       Distribution_Date = VALUES(Distribution_Date),
       Quantity_Distribution = VALUES(Quantity_Distribution),
       Delivery_Status = 'Pending'`,
    [
      request.Food_ID,
      request.Recipient_ID,
      volunteerId,
      new Date().toISOString().slice(0, 10),
      request.Quantity_Needed
    ]
  );

  await query(
    `UPDATE FoodRequests
     SET Status = 'Approved'
     WHERE Request_ID = ?`,
    [request.Request_ID]
  );

  await query(
    `UPDATE Donation_Details
     SET Volunteer_ID = ?
     WHERE Donation_ID = ?`,
    [volunteerId, request.Donation_ID]
  );

  await query(
    `UPDATE Volunteer
     SET Availability_Status = 'Busy'
     WHERE Volunteer_ID = ?`,
    [volunteerId]
  );

  await query(
    `INSERT INTO VolunteerNotifications (Volunteer_ID, Message)
     VALUES (?, ?)`,
    [
      volunteerId,
      `Assigned delivery: collect ${request.Food_Name} from Donor ${request.Donor_ID} near ${donorLocation} and deliver ${request.Quantity_Needed} to ${request.Recipient_Name} in ${request.Recipient_Location}.`
    ]
  );

  await query(
    `INSERT INTO Notifications (Recipient_ID, Message)
     VALUES (?, ?)`,
    [
      request.Recipient_ID,
      `Your request ${request.Request_ID} was ${assignmentMode} and assigned to volunteer ${volunteerId}.`
    ]
  );

  await query(
    `INSERT INTO AdminNotifications (Message, Type)
     VALUES (?, 'food_request')`,
    [
      `Food request ${request.Request_ID} for ${request.Recipient_Name} was ${assignmentMode} to volunteer ${volunteerId}.`
    ]
  );
}

// GET all food requests (for admin monitoring)
router.get('/', async (req, res) => {
  try {
    const results = await query(
      `SELECT fr.*, r.Name as Recipient_Name,
              r.Location AS Recipient_Location,
              f.Food_Name, f.Food_Type, f.Shelf_Life, c.Quantity AS Available_Quantity,
              dist.Volunteer_ID AS Assigned_Volunteer_ID,
              v.Name AS Assigned_Volunteer_Name
       FROM FoodRequests fr
       JOIN Recipient r ON fr.Recipient_ID = r.Recipient_ID
       JOIN Food_Item f ON fr.Food_ID = f.Food_ID
       LEFT JOIN Contains c ON fr.Donation_ID = c.Donation_ID AND fr.Food_ID = c.Food_ID
       LEFT JOIN Distributes dist
         ON dist.Food_ID = fr.Food_ID
        AND dist.Recipient_ID = fr.Recipient_ID
       LEFT JOIN Volunteer v ON dist.Volunteer_ID = v.Volunteer_ID
       ORDER BY fr.Request_Date DESC`
    );
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.sqlMessage || err.message });
  }
});

// GET requests by recipient
router.get('/my/:recipient_id', async (req, res) => {
  try {
    const results = await query(
      `SELECT fr.*, f.Food_Name, f.Food_Type, f.Shelf_Life, c.Quantity AS Available_Quantity,
              dist.Volunteer_ID AS Assigned_Volunteer_ID,
              v.Name AS Assigned_Volunteer_Name
       FROM FoodRequests fr
       JOIN Food_Item f ON fr.Food_ID = f.Food_ID
       LEFT JOIN Contains c ON fr.Donation_ID = c.Donation_ID AND fr.Food_ID = c.Food_ID
       LEFT JOIN Distributes dist
         ON dist.Food_ID = fr.Food_ID
        AND dist.Recipient_ID = fr.Recipient_ID
       LEFT JOIN Volunteer v ON dist.Volunteer_ID = v.Volunteer_ID
       WHERE fr.Recipient_ID = ?
       ORDER BY fr.Request_Date DESC`,
      [req.params.recipient_id]
    );
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.sqlMessage || err.message });
  }
});

// POST create food request and auto-assign best volunteer near the donor
router.post('/', async (req, res) => {
  const { Request_ID, Recipient_ID, Food_ID, Donation_ID, Quantity_Needed } = req.body;

  if (!Request_ID || !Recipient_ID || !Food_ID || !Donation_ID || !Quantity_Needed) {
    return res.status(400).json({ error: 'Please select an available food item and enter quantity.' });
  }

  try {
    const available = await query(
      `SELECT c.Donation_ID
       FROM Contains c
       JOIN Donation_Details dd ON c.Donation_ID = dd.Donation_ID
       WHERE c.Donation_ID = ?
         AND c.Food_ID = ?
         AND dd.Status = 'Pending'
         AND NOT EXISTS (
           SELECT 1
           FROM FoodRequests fr
           WHERE fr.Donation_ID = c.Donation_ID
             AND fr.Food_ID = c.Food_ID
             AND fr.Status IN ('Pending', 'Approved')
         )`,
      [Donation_ID, Food_ID]
    );

    if (!available.length) {
      return res.status(400).json({ error: 'This food item is no longer available.' });
    }

    await query(
      `INSERT INTO FoodRequests
       (Request_ID, Recipient_ID, Food_ID, Donation_ID, Quantity_Needed)
       VALUES (?,?,?,?,?)`,
      [Request_ID, Recipient_ID, Food_ID, Donation_ID, Quantity_Needed]
    );

    const rows = await query(
      `SELECT fr.Request_ID, fr.Recipient_ID, fr.Food_ID, fr.Donation_ID, fr.Quantity_Needed,
              r.Name AS Recipient_Name, r.Location AS Recipient_Location,
              f.Food_Name, dd.Donor_ID, d.City AS Donor_City
       FROM FoodRequests fr
       JOIN Recipient r ON r.Recipient_ID = fr.Recipient_ID
       JOIN Food_Item f ON f.Food_ID = fr.Food_ID
       JOIN Donation_Details dd ON dd.Donation_ID = fr.Donation_ID
       LEFT JOIN Donor d ON d.Donor_ID = dd.Donor_ID
       WHERE fr.Request_ID = ?`,
      [Request_ID]
    );

    const request = rows[0];
    const volunteers = await query(
      `SELECT Volunteer_ID, Name, Area_Assigned, Availability_Status, Rating, Total_Deliveries
       FROM Volunteer`
    );

    const targetLocation = request.Donor_City || request.Recipient_Location || '';
    const volunteer = chooseVolunteer(volunteers, targetLocation);

    if (!volunteer) {
      await query(
        `INSERT INTO AdminNotifications (Message, Type)
         VALUES (?, 'food_request')`,
        [
          `Food request ${Request_ID} from ${request.Recipient_Name} is waiting for volunteer assignment near ${targetLocation || 'unknown location'}.`
        ]
      );

      return res.json({
        message: 'Food request submitted successfully! Waiting for volunteer assignment.'
      });
    }

    const assignmentMode = isNearby(volunteer.Area_Assigned, targetLocation)
      ? 'automatically matched'
      : 'automatically assigned';

    await assignRequestToVolunteer(request, volunteer.Volunteer_ID, assignmentMode);

    res.json({
      message: `Food request submitted successfully! Volunteer ${volunteer.Name} (${volunteer.Volunteer_ID}) was ${assignmentMode}.`
    });
  } catch (err) {
    res.status(500).json({ error: err.sqlMessage || err.message });
  }
});

// Admin fallback: manually assign a request to a volunteer
router.put('/assign', async (req, res) => {
  const { Request_ID, Volunteer_ID } = req.body;

  if (!Request_ID || !Volunteer_ID) {
    return res.status(400).json({ error: 'Request_ID and Volunteer_ID are required.' });
  }

  try {
    const rows = await query(
      `SELECT fr.Request_ID, fr.Recipient_ID, fr.Food_ID, fr.Donation_ID, fr.Quantity_Needed,
              r.Name AS Recipient_Name, r.Location AS Recipient_Location,
              f.Food_Name, dd.Donor_ID
       FROM FoodRequests fr
       JOIN Food_Item f ON fr.Food_ID = f.Food_ID
       JOIN Recipient r ON fr.Recipient_ID = r.Recipient_ID
       JOIN Donation_Details dd ON dd.Donation_ID = fr.Donation_ID
       WHERE fr.Request_ID = ?`,
      [Request_ID]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Food request not found.' });
    }

    await assignRequestToVolunteer(rows[0], Volunteer_ID, 'manually assigned');
    res.json({ message: `Request ${Request_ID} assigned to volunteer ${Volunteer_ID}!` });
  } catch (err) {
    res.status(500).json({ error: err.sqlMessage || err.message });
  }
});

// PUT approve/reject request (admin fallback)
router.put('/status', async (req, res) => {
  const { Request_ID, Status } = req.body;

  try {
    await query(
      `UPDATE FoodRequests SET Status = ? WHERE Request_ID = ?`,
      [Status, Request_ID]
    );
    res.json({ message: `Request ${Status}!` });
  } catch (err) {
    res.status(500).json({ error: err.sqlMessage || err.message });
  }
});

module.exports = router;
