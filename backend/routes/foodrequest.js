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

function parseQuantity(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)?$/i);

  if (!match) {
    return null;
  }

  return {
    amount: Number(match[1]),
    unit: (match[2] || '').toLowerCase()
  };
}

function formatQuantity({ amount, unit }) {
  return `${amount}${unit ? ` ${unit}` : ''}`;
}

function addQuantities(baseValue, deltaValue) {
  const base = parseQuantity(baseValue);
  const delta = parseQuantity(deltaValue);

  if (!base || !delta) return null;
  if (base.unit && delta.unit && base.unit !== delta.unit) return null;

  return formatQuantity({
    amount: Number((base.amount + delta.amount).toFixed(2)),
    unit: base.unit || delta.unit
  });
}

function subtractQuantities(baseValue, deltaValue) {
  const base = parseQuantity(baseValue);
  const delta = parseQuantity(deltaValue);

  if (!base || !delta) return null;
  if (base.unit && delta.unit && base.unit !== delta.unit) return null;

  const nextAmount = Number((base.amount - delta.amount).toFixed(2));
  if (nextAmount < 0) return null;

  return formatQuantity({
    amount: nextAmount,
    unit: base.unit || delta.unit
  });
}

function getQuantityValidationError(requestedValue, availableValue) {
  const requested = parseQuantity(requestedValue);
  const available = parseQuantity(availableValue);

  if (!requested) {
    return 'Enter quantity in a valid format like "1 kg" or "5 pcs".';
  }

  if (requested.amount <= 0) {
    return 'Requested quantity must be greater than 0.';
  }

  if (!available) {
    return null;
  }

  if (requested.unit && available.unit && requested.unit !== available.unit) {
    return `Only ${formatQuantity(available)} is available. Please use the same unit.`;
  }

  if (requested.amount > available.amount) {
    return `Only ${formatQuantity(available)} is available for this item.`;
  }

  return null;
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
     SET Volunteer_ID = ?, Status = CASE
       WHEN Status = 'Pending' THEN 'Partially Fulfilled'
       ELSE Status
     END
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

async function updateDonationLifecycleStatus(donationId) {
  const donationRows = await query(
    `SELECT Status FROM Donation_Details WHERE Donation_ID = ?`,
    [donationId]
  );

  if (!donationRows.length) return;

  const currentStatus = donationRows[0].Status;
  if (currentStatus === 'Collected' || currentStatus === 'Cancelled') {
    return;
  }

  const items = await query(
    `SELECT c.Quantity, fi.Expiry_Time
     FROM Contains c
     JOIN Food_Item fi ON fi.Food_ID = c.Food_ID
     WHERE c.Donation_ID = ?`,
    [donationId]
  );

  const requests = await query(
    `SELECT Status
     FROM FoodRequests
     WHERE Donation_ID = ?`,
    [donationId]
  );

  const hasOpenQuantity = items.some(item => {
    const parsed = parseQuantity(item.Quantity);
    return parsed && parsed.amount > 0 && !isExpired(item.Expiry_Time);
  });

  const hasActiveRequests = requests.some(request =>
    ['Pending', 'Approved'].includes(request.Status)
  );

  let nextStatus = 'Pending';
  if (!hasOpenQuantity) {
    const hasUnexpiredItems = items.some(item => !isExpired(item.Expiry_Time));
    nextStatus = hasUnexpiredItems || hasActiveRequests
      ? 'Partially Fulfilled'
      : 'Expired';
  } else if (hasActiveRequests) {
    nextStatus = 'Partially Fulfilled';
  }

  await query(
    `UPDATE Donation_Details
     SET Status = ?
     WHERE Donation_ID = ?`,
    [nextStatus, donationId]
  );
}

async function releaseVolunteerIfIdle(volunteerId) {
  if (!volunteerId) return;

  const rows = await query(
    `SELECT COUNT(*) AS OpenAssignments
     FROM Distributes
     WHERE Volunteer_ID = ?
       AND Delivery_Status IN ('Pending', 'PickedUp', 'InTransit')`,
    [volunteerId]
  );

  if (Number(rows[0]?.OpenAssignments || 0) === 0) {
    await query(
      `UPDATE Volunteer
       SET Availability_Status = 'Available'
       WHERE Volunteer_ID = ?`,
      [volunteerId]
    );
  }
}

async function cancelOrRejectRequest(request, nextStatus) {
  const quantityRows = await query(
    `SELECT Quantity
     FROM Contains
     WHERE Donation_ID = ? AND Food_ID = ?`,
    [request.Donation_ID, request.Food_ID]
  );

  if (quantityRows.length > 0) {
    const restoredQuantity = addQuantities(quantityRows[0].Quantity, request.Quantity_Needed);
    if (restoredQuantity) {
      await query(
        `UPDATE Contains
         SET Quantity = ?
         WHERE Donation_ID = ? AND Food_ID = ?`,
        [restoredQuantity, request.Donation_ID, request.Food_ID]
      );
    }
  }

  const distRows = await query(
    `SELECT Volunteer_ID
     FROM Distributes
     WHERE Food_ID = ? AND Recipient_ID = ?`,
    [request.Food_ID, request.Recipient_ID]
  );
  const assignedVolunteerId = distRows[0]?.Volunteer_ID;

  await query(
    `UPDATE FoodRequests
     SET Status = ?
     WHERE Request_ID = ?`,
    [nextStatus, request.Request_ID]
  );

  await query(
    `UPDATE Distributes
     SET Delivery_Status = 'Cancelled'
     WHERE Food_ID = ? AND Recipient_ID = ?`,
    [request.Food_ID, request.Recipient_ID]
  );

  await releaseVolunteerIfIdle(assignedVolunteerId);
  await updateDonationLifecycleStatus(request.Donation_ID);
}

// GET all food requests (for admin monitoring)
router.get('/', async (req, res) => {
  try {
    await refreshExpiredDonationStatuses(query);

    const results = await query(
      `SELECT fr.*, r.Name as Recipient_Name,
              r.Location AS Recipient_Location,
              d.City AS Donor_City,
              f.Food_Name, f.Food_Type, f.Shelf_Life, f.Prepared_Time, f.Expiry_Time,
              c.Quantity AS Available_Quantity,
              dist.Volunteer_ID AS Assigned_Volunteer_ID,
              v.Name AS Assigned_Volunteer_Name
       FROM FoodRequests fr
       JOIN Recipient r ON fr.Recipient_ID = r.Recipient_ID
       JOIN Food_Item f ON fr.Food_ID = f.Food_ID
       JOIN Donation_Details dd ON dd.Donation_ID = fr.Donation_ID
       LEFT JOIN Donor d ON d.Donor_ID = dd.Donor_ID
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
    await refreshExpiredDonationStatuses(query);

    const results = await query(
      `SELECT fr.*, f.Food_Name, f.Food_Type, f.Shelf_Life, f.Prepared_Time, f.Expiry_Time,
              d.City AS Donor_City,
              c.Quantity AS Available_Quantity,
              dist.Volunteer_ID AS Assigned_Volunteer_ID,
              v.Name AS Assigned_Volunteer_Name
       FROM FoodRequests fr
       JOIN Food_Item f ON fr.Food_ID = f.Food_ID
       JOIN Donation_Details dd ON dd.Donation_ID = fr.Donation_ID
       LEFT JOIN Donor d ON d.Donor_ID = dd.Donor_ID
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
    await refreshExpiredDonationStatuses(query);

    const available = await query(
      `SELECT c.Donation_ID, c.Quantity, f.Expiry_Time
       FROM Contains c
       JOIN Donation_Details dd ON c.Donation_ID = dd.Donation_ID
       JOIN Food_Item f ON f.Food_ID = c.Food_ID
       WHERE c.Donation_ID = ?
         AND c.Food_ID = ?
         AND dd.Status IN ('Pending', 'Partially Fulfilled')
         AND f.Expiry_Time > NOW()`,
      [Donation_ID, Food_ID]
    );

    if (!available.length) {
      return res.status(400).json({ error: 'This food item is no longer available.' });
    }
    if (isExpired(available[0].Expiry_Time)) {
      return res.status(400).json({ error: 'This food item has expired and is no longer safe to request.' });
    }

    const quantityError = getQuantityValidationError(
      Quantity_Needed,
      available[0].Quantity
    );

    if (quantityError) {
      return res.status(400).json({ error: quantityError });
    }

    await query(
      `INSERT INTO FoodRequests
       (Request_ID, Recipient_ID, Food_ID, Donation_ID, Quantity_Needed)
       VALUES (?,?,?,?,?)`,
      [Request_ID, Recipient_ID, Food_ID, Donation_ID, Quantity_Needed]
    );

    const remainingQuantity = subtractQuantities(available[0].Quantity, Quantity_Needed);
    if (!remainingQuantity) {
      return res.status(400).json({ error: 'Unable to reserve the requested quantity.' });
    }

    await query(
      `UPDATE Contains
       SET Quantity = ?
       WHERE Donation_ID = ? AND Food_ID = ?`,
      [remainingQuantity, Donation_ID, Food_ID]
    );

    const rows = await query(
      `SELECT fr.Request_ID, fr.Recipient_ID, fr.Food_ID, fr.Donation_ID, fr.Quantity_Needed, fr.Status,
              r.Name AS Recipient_Name, r.Location AS Recipient_Location,
              f.Food_Name, f.Expiry_Time, dd.Donor_ID, d.City AS Donor_City
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
      await updateDonationLifecycleStatus(Donation_ID);

      await query(
        `INSERT INTO AdminNotifications (Message, Type)
         VALUES (?, 'food_request')`,
        [
          `Food request ${Request_ID} from ${request.Recipient_Name} is waiting for volunteer assignment near ${targetLocation || 'unknown location'}.`
        ]
      );

      return res.json({
        message: 'Food request submitted successfully! Waiting for volunteer assignment.',
        assignedVolunteer: null
      });
    }

    const assignmentMode = isNearby(volunteer.Area_Assigned, targetLocation)
      ? 'automatically matched'
      : 'automatically assigned';

    await assignRequestToVolunteer(request, volunteer.Volunteer_ID, assignmentMode);
    await updateDonationLifecycleStatus(Donation_ID);

    res.json({
      message: `Food request submitted successfully! Volunteer ${volunteer.Name} (${volunteer.Volunteer_ID}) was ${assignmentMode}.`,
      assignedVolunteer: {
        Volunteer_ID: volunteer.Volunteer_ID,
        Name: volunteer.Name,
        Area_Assigned: volunteer.Area_Assigned,
        assignmentMode
      }
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
    await refreshExpiredDonationStatuses(query);

    const rows = await query(
      `SELECT fr.Request_ID, fr.Recipient_ID, fr.Food_ID, fr.Donation_ID, fr.Quantity_Needed,
              r.Name AS Recipient_Name, r.Location AS Recipient_Location,
              f.Food_Name, f.Expiry_Time, dd.Donor_ID, d.City AS Donor_City
       FROM FoodRequests fr
       JOIN Food_Item f ON fr.Food_ID = f.Food_ID
       JOIN Recipient r ON fr.Recipient_ID = r.Recipient_ID
       JOIN Donation_Details dd ON dd.Donation_ID = fr.Donation_ID
       LEFT JOIN Donor d ON d.Donor_ID = dd.Donor_ID
       WHERE fr.Request_ID = ?`,
      [Request_ID]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Food request not found.' });
    }
    if (rows[0].Status === 'Cancelled' || rows[0].Status === 'Expired') {
      return res.status(400).json({ error: `This request is ${rows[0].Status.toLowerCase()} and can no longer be assigned.` });
    }
    if (isExpired(rows[0].Expiry_Time)) {
      return res.status(400).json({ error: 'This food item has expired and can no longer be assigned.' });
    }

    await assignRequestToVolunteer(rows[0], Volunteer_ID, 'manually assigned');
    await updateDonationLifecycleStatus(rows[0].Donation_ID);
    res.json({ message: `Request ${Request_ID} assigned to volunteer ${Volunteer_ID}!` });
  } catch (err) {
    res.status(500).json({ error: err.sqlMessage || err.message });
  }
});

// PUT approve/reject request (admin fallback)
router.put('/status', async (req, res) => {
  const { Request_ID, Status } = req.body;

  try {
    const rows = await query(
      `SELECT fr.Request_ID, fr.Recipient_ID, fr.Food_ID, fr.Donation_ID, fr.Quantity_Needed, fr.Status
       FROM FoodRequests fr
       WHERE fr.Request_ID = ?`,
      [Request_ID]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Food request not found.' });
    }

    const current = rows[0];

    if (['Rejected', 'Cancelled', 'Expired'].includes(current.Status)) {
      return res.status(400).json({ error: `Request is already ${current.Status}.` });
    }

    if (['Rejected', 'Cancelled'].includes(Status)) {
      await cancelOrRejectRequest(current, Status);
    } else {
      await query(
        `UPDATE FoodRequests SET Status = ? WHERE Request_ID = ?`,
        [Status, Request_ID]
      );
      await updateDonationLifecycleStatus(current.Donation_ID);
    }

    res.json({ message: `Request ${Status}!` });
  } catch (err) {
    res.status(500).json({ error: err.sqlMessage || err.message });
  }
});

module.exports = router;
