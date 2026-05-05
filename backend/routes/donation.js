const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendEmail, getDefaultSender } = require('../utils/email');
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

router.get('/', async (req, res) => {
  try {
    await refreshExpiredDonationStatuses(query);

    const results = await query(
      `SELECT dd.*, d.City AS Donor_City, fi.Food_ID, fi.Food_Name, fi.Food_Type, fi.Shelf_Life,
              fi.Prepared_Time, fi.Expiry_Time, c.Quantity
       FROM Donation_Details dd
       LEFT JOIN Donor d ON d.Donor_ID = dd.Donor_ID
       LEFT JOIN Contains c ON dd.Donation_ID = c.Donation_ID
       LEFT JOIN Food_Item fi ON c.Food_ID = fi.Food_ID
       ORDER BY dd.Donation_Date DESC`
    );
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.sqlMessage || err.message });
  }
});

router.post('/', async (req, res) => {
  const {
    Donation_ID,
    Donation_Date,
    Pickup_Time,
    Status,
    Donor_ID,
    Food_ID,
    Food_Name,
    Food_Type,
    Shelf_Life,
    Prepared_Time,
    Expiry_Time,
    Quantity,
    Food_Items
  } = req.body;

  const foodItems = Array.isArray(Food_Items) && Food_Items.length > 0
    ? Food_Items
    : [{ Food_ID, Food_Name, Food_Type, Shelf_Life, Prepared_Time, Expiry_Time, Quantity }];

  if (!Donation_ID || !Donation_Date || !Pickup_Time || !Donor_ID ||
      foodItems.some(item => !item?.Food_ID || !item?.Food_Name || !item?.Food_Type ||
        !item?.Shelf_Life || !item?.Prepared_Time || !item?.Expiry_Time || !item?.Quantity)) {
    return res.status(400).json({ error: 'Please fill all donation and food fields.' });
  }

  try {
    await refreshExpiredDonationStatuses(query);

    for (const item of foodItems) {
      const foodSafetyError = getFoodSafetyValidationError({
        preparedTime: item.Prepared_Time,
        expiryTime: item.Expiry_Time
      });

      if (foodSafetyError) {
        return res.status(400).json({ error: `${item.Food_Name || item.Food_ID}: ${foodSafetyError}` });
      }
    }

    await query(
      `INSERT INTO Donation_Details
       (Donation_ID, Donation_Date, Pickup_Time, Status, Donor_ID)
       VALUES (?,?,?,?,?)`,
      [Donation_ID, Donation_Date, Pickup_Time, Status || 'Pending', Donor_ID]
    );

    await Promise.all(
      foodItems.map(item =>
        query(
          `INSERT INTO Food_Item (Food_ID, Food_Name, Food_Type, Shelf_Life, Prepared_Time, Expiry_Time)
           VALUES (?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             Food_Name = VALUES(Food_Name),
             Food_Type = VALUES(Food_Type),
             Shelf_Life = VALUES(Shelf_Life),
             Prepared_Time = VALUES(Prepared_Time),
             Expiry_Time = VALUES(Expiry_Time)`,
          [
            item.Food_ID,
            item.Food_Name,
            item.Food_Type,
            item.Shelf_Life,
            normalizeDateTimeInput(item.Prepared_Time),
            normalizeDateTimeInput(item.Expiry_Time)
          ]
        )
      )
    );

    await Promise.all(
      foodItems.map(item =>
        query(
          `INSERT INTO Contains (Donation_ID, Food_ID, Quantity)
           VALUES (?,?,?)`,
          [Donation_ID, item.Food_ID, item.Quantity]
        )
      )
    );

    const donorRows = await query(
      `SELECT Name, City, Email FROM Donor WHERE Donor_ID = ?`,
      [Donor_ID]
    );
    const donor = donorRows[0] || {};
    const donorLocation = donor.City || '';
    const foodSummary = foodItems
      .map(item => `${item.Food_Name} (${item.Quantity})`)
      .join(', ');
    const donationSummary =
      `Donation ${Donation_ID}: ${foodSummary} added by donor ${donor.Name || Donor_ID} in ${donorLocation || 'unknown area'}. Pickup: ${Donation_Date} ${Pickup_Time}.`;

    const volunteers = await query(
      `SELECT v.Volunteer_ID, v.Name, v.Area_Assigned, v.Availability_Status,
              COALESCE(v.Rating, 0) AS Rating,
              COALESCE(v.Total_Deliveries, 0) AS Total_Deliveries,
              u.Email
       FROM Volunteer v
       LEFT JOIN Users u
         ON u.Role = 'Volunteer'
        AND u.Ref_ID = v.Volunteer_ID
       WHERE v.Availability_Status = 'Available'`
    );

    const nearbyVolunteers = volunteers.filter(v => isNearby(v.Area_Assigned, donorLocation));

    await query(
      `INSERT INTO AdminNotifications (Message, Type)
       VALUES (?, 'donation')`,
      [
        nearbyVolunteers.length > 0
          ? `${donationSummary} ${nearbyVolunteers.length} nearby volunteer notification(s) were sent. The donation is waiting for a recipient request before assignment.`
          : `${donationSummary} No nearby volunteer was found. This donation is waiting for a recipient request before assignment.`
      ]
    );

    const adminRows = await query(
      `SELECT Email
       FROM Users
       WHERE Role = 'Admin'
       ORDER BY User_ID
       LIMIT 1`
    );
    const systemSender = getDefaultSender();
    const adminEmail = adminRows[0]?.Email || systemSender || 'admin@fooddonation.com';
    const donorEmail = donor.Email || adminEmail;
    const nearbyVolunteerEmails = [...new Set(
      nearbyVolunteers
        .map(volunteer => volunteer.Email)
        .filter(Boolean)
    )];
    const emailResults = await Promise.allSettled([
      sendEmail({
        from: systemSender,
        replyTo: donorEmail,
        sender: systemSender,
        to: adminEmail,
        subject: `New donation added: ${Donation_ID}`,
        text:
          `${donationSummary}\n\n` +
          `Donor name: ${donor.Name || Donor_ID}\n` +
          `Donor registered email: ${donorEmail}\n` +
          `Please reply directly to the donor for follow-up.`
      }),
      ...nearbyVolunteerEmails.map(volunteerEmail =>
        sendEmail({
          from: systemSender,
          replyTo: donorEmail,
          sender: systemSender,
          to: volunteerEmail,
          subject: `New donor pickup near ${donorLocation || 'your area'}`,
          text:
            `${donationSummary}\n\n` +
            `Donor name: ${donor.Name || Donor_ID}\n` +
            `Donor registered email: ${donorEmail}\n` +
            `This donation is in or near your assigned area.\n` +
            `Volunteer assignment will happen when a recipient requests this food.\n` +
            `Please reply directly to the donor for coordination.`
        })
      )
    ]);

    const emailFailures = emailResults.filter(result => result.status === 'rejected');
    if (emailFailures.length > 0) {
      console.error('Donation email delivery failed:', emailFailures.map(result => result.reason?.message || result.reason));
    }

    res.json({
      message: nearbyVolunteerEmails.length > 0
        ? 'Donation added. Nearby volunteers and admin were notified. Volunteer assignment will happen when a recipient requests the food.'
        : 'Donation added. Admin was notified. Volunteer assignment will happen when a recipient requests the food.'
    });
  } catch (err) {
    res.status(500).json({ error: err.sqlMessage || err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM Donation_Details WHERE Donation_ID = ?', [req.params.id]);
    res.json({ message: 'Donation deleted!' });
  } catch (err) {
    res.status(500).json({ error: err.sqlMessage || err.message });
  }
});

// Admin fallback: assign a volunteer to monitor and collect the donation later
router.put('/assign', async (req, res) => {
  const { Donation_ID, Volunteer_ID } = req.body;

  if (!Donation_ID || !Volunteer_ID) {
    return res.status(400).json({ error: 'Donation_ID and Volunteer_ID are required.' });
  }

  try {
    await refreshExpiredDonationStatuses(query);

    const currentRows = await query(
      `SELECT Volunteer_ID, Status
       FROM Donation_Details
       WHERE Donation_ID = ?`,
      [Donation_ID]
    );

    if (!currentRows.length) {
      return res.status(404).json({ error: 'Donation not found.' });
    }
    if (currentRows[0].Status === 'Expired' || currentRows[0].Status === 'Cancelled') {
      return res.status(400).json({ error: `This donation is ${currentRows[0].Status.toLowerCase()} and is no longer active.` });
    }

    const current = currentRows[0];
    const sameVolunteerPickingUp =
      current.Volunteer_ID &&
      current.Volunteer_ID === Volunteer_ID &&
      !['Collected', 'Cancelled'].includes(current.Status);

    if (sameVolunteerPickingUp) {
      await query(
        `UPDATE Donation_Details
         SET Status = 'Collected'
         WHERE Donation_ID = ?`,
        [Donation_ID]
      );

      await query(
        `UPDATE Distributes d
         JOIN FoodRequests fr
           ON fr.Food_ID = d.Food_ID
          AND fr.Recipient_ID = d.Recipient_ID
         SET d.Delivery_Status = 'PickedUp'
         WHERE fr.Donation_ID = ?
           AND d.Volunteer_ID = ?`,
        [Donation_ID, Volunteer_ID]
      );

      return res.json({ message: `Donation ${Donation_ID} marked as picked up!` });
    }

    await query(
      `UPDATE Donation_Details
       SET Volunteer_ID = ?,
           Status = CASE
             WHEN Status = 'Pending' THEN 'Partially Fulfilled'
             ELSE Status
           END
       WHERE Donation_ID = ?`,
      [Volunteer_ID, Donation_ID]
    );

    await query(
      `UPDATE Volunteer
       SET Availability_Status = 'Busy'
       WHERE Volunteer_ID = ?`,
      [Volunteer_ID]
    );

    await query(
      `INSERT INTO VolunteerNotifications (Volunteer_ID, Message)
       VALUES (?, ?)`,
      [Volunteer_ID, `You have been assigned donation ${Donation_ID}. Please collect it from the donor.`]
    );

    res.json({ message: `Volunteer ${Volunteer_ID} assigned to ${Donation_ID}!` });
  } catch (err) {
    res.status(500).json({ error: err.sqlMessage || err.message });
  }
});

// Volunteer confirms food pickup from donor
router.put('/pickup', async (req, res) => {
  const { Donation_ID, Volunteer_ID } = req.body;

  if (!Donation_ID || !Volunteer_ID) {
    return res.status(400).json({ error: 'Donation_ID and Volunteer_ID are required.' });
  }

  try {
    await refreshExpiredDonationStatuses(query);

    const donationRows = await query(
      `SELECT dd.Donation_ID, dd.Volunteer_ID, dd.Donor_ID, dd.Status, c.Food_ID
       FROM Donation_Details dd
       LEFT JOIN Contains c ON c.Donation_ID = dd.Donation_ID
       WHERE dd.Donation_ID = ?`,
      [Donation_ID]
    );

    if (!donationRows.length) {
      return res.status(404).json({ error: 'Donation not found.' });
    }
    if (donationRows[0].Status === 'Expired' || donationRows[0].Status === 'Cancelled') {
      return res.status(400).json({ error: `This donation is ${donationRows[0].Status.toLowerCase()} and cannot be picked up.` });
    }

    const assignedVolunteer = donationRows[0].Volunteer_ID;
    if (assignedVolunteer && assignedVolunteer !== Volunteer_ID) {
      return res.status(403).json({ error: 'This donation is assigned to another volunteer.' });
    }

    await query(
      `UPDATE Donation_Details
       SET Volunteer_ID = ?, Status = 'Collected'
       WHERE Donation_ID = ?`,
      [Volunteer_ID, Donation_ID]
    );

    await query(
      `UPDATE Distributes d
       JOIN FoodRequests fr
         ON fr.Food_ID = d.Food_ID
        AND fr.Recipient_ID = d.Recipient_ID
       SET d.Delivery_Status = 'PickedUp'
       WHERE fr.Donation_ID = ?
         AND d.Volunteer_ID = ?`,
      [Donation_ID, Volunteer_ID]
    );

    const recipients = await query(
      `SELECT DISTINCT fr.Recipient_ID, fi.Food_Name
       FROM FoodRequests fr
       JOIN Food_Item fi ON fi.Food_ID = fr.Food_ID
       WHERE fr.Donation_ID = ?
         AND fr.Status = 'Approved'`,
      [Donation_ID]
    );

    await Promise.all(
      recipients.map(r =>
        query(
          `INSERT INTO Notifications (Recipient_ID, Message)
           VALUES (?, ?)`,
          [r.Recipient_ID, `Your requested ${r.Food_Name} has been picked up from the donor and will be delivered soon.`]
        )
      )
    );

    await query(
      `INSERT INTO AdminNotifications (Message, Type)
       VALUES (?, 'pickup')`,
      [`Donation ${Donation_ID} was picked up by volunteer ${Volunteer_ID}.`]
    );

    res.json({ message: 'Donation marked as picked up successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.sqlMessage || err.message });
  }
});

router.put('/cancel', async (req, res) => {
  const { Donation_ID } = req.body;

  if (!Donation_ID) {
    return res.status(400).json({ error: 'Donation_ID is required.' });
  }

  try {
    await refreshExpiredDonationStatuses(query);

    const donationRows = await query(
      `SELECT Donation_ID, Volunteer_ID, Status
       FROM Donation_Details
       WHERE Donation_ID = ?`,
      [Donation_ID]
    );

    if (!donationRows.length) {
      return res.status(404).json({ error: 'Donation not found.' });
    }

    const donation = donationRows[0];
    if (['Collected', 'Expired', 'Cancelled'].includes(donation.Status)) {
      return res.status(400).json({ error: `Donation is already ${donation.Status}.` });
    }

    await query(
      `UPDATE Donation_Details
       SET Status = 'Cancelled'
       WHERE Donation_ID = ?`,
      [Donation_ID]
    );

    await query(
      `UPDATE FoodRequests
       SET Status = 'Cancelled'
       WHERE Donation_ID = ?
         AND Status IN ('Pending', 'Approved')`,
      [Donation_ID]
    );

    await query(
      `UPDATE Distributes d
       JOIN FoodRequests fr
         ON fr.Food_ID = d.Food_ID
        AND fr.Recipient_ID = d.Recipient_ID
       SET d.Delivery_Status = 'Cancelled'
       WHERE fr.Donation_ID = ?
         AND d.Delivery_Status IN ('Pending', 'PickedUp', 'InTransit')`,
      [Donation_ID]
    );

    if (donation.Volunteer_ID) {
      const openRows = await query(
        `SELECT COUNT(*) AS OpenAssignments
         FROM Distributes
         WHERE Volunteer_ID = ?
           AND Delivery_Status IN ('Pending', 'PickedUp', 'InTransit')`,
        [donation.Volunteer_ID]
      );

      if (Number(openRows[0]?.OpenAssignments || 0) === 0) {
        await query(
          `UPDATE Volunteer
           SET Availability_Status = 'Available'
           WHERE Volunteer_ID = ?`,
          [donation.Volunteer_ID]
        );
      }
    }

    await query(
      `INSERT INTO AdminNotifications (Message, Type)
       VALUES (?, 'donation')`,
      [`Donation ${Donation_ID} was cancelled before completion.`]
    );

    res.json({ message: `Donation ${Donation_ID} cancelled successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.sqlMessage || err.message });
  }
});

module.exports = router;
