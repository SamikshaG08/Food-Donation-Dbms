const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendEmail } = require('../utils/email');

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

router.get('/', async (req, res) => {
  try {
    const results = await query(
      `SELECT dd.*, fi.Food_ID, fi.Food_Name, fi.Food_Type, fi.Shelf_Life, c.Quantity
       FROM Donation_Details dd
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
    Quantity,
    Food_Items
  } = req.body;

  const foodItems = Array.isArray(Food_Items) && Food_Items.length > 0
    ? Food_Items
    : [{ Food_ID, Food_Name, Food_Type, Shelf_Life, Quantity }];

  if (!Donation_ID || !Donation_Date || !Pickup_Time || !Donor_ID ||
      foodItems.some(item => !item?.Food_ID || !item?.Food_Name || !item?.Food_Type || !item?.Shelf_Life || !item?.Quantity)) {
    return res.status(400).json({ error: 'Please fill all donation and food fields.' });
  }

  try {
    await query(
      `INSERT INTO Donation_Details
       (Donation_ID, Donation_Date, Pickup_Time, Status, Donor_ID)
       VALUES (?,?,?,?,?)`,
      [Donation_ID, Donation_Date, Pickup_Time, Status || 'Pending', Donor_ID]
    );

    await Promise.all(
      foodItems.map(item =>
        query(
          `INSERT INTO Food_Item (Food_ID, Food_Name, Food_Type, Shelf_Life)
           VALUES (?,?,?,?)
           ON DUPLICATE KEY UPDATE
             Food_Name = VALUES(Food_Name),
             Food_Type = VALUES(Food_Type),
             Shelf_Life = VALUES(Shelf_Life)`,
          [item.Food_ID, item.Food_Name, item.Food_Type, item.Shelf_Life]
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

    await query(
      `INSERT INTO AdminNotifications (Message, Type)
       VALUES (?, 'donation')`,
      [`${donationSummary} Nearby volunteers close to the donor were notified.`]
    );

    const adminRows = await query(
      `SELECT Email
       FROM Users
       WHERE Role = 'Admin'
       ORDER BY User_ID
       LIMIT 1`
    );
    const adminEmail = adminRows[0]?.Email || process.env.MAIL_FROM || 'admin@fooddonation.com';
    const donorEmail = donor.Email || adminEmail;

    const volunteers = await query(
      `SELECT v.Volunteer_ID, v.Area_Assigned, u.Email
       FROM Volunteer v
       LEFT JOIN Users u
         ON u.Role = 'Volunteer'
        AND u.Ref_ID = v.Volunteer_ID
       WHERE v.Availability_Status = 'Available'`
    );

    const nearbyVolunteers = volunteers.filter(v =>
      isNearby(v.Area_Assigned, donorLocation)
    );
    const volunteersToNotify = nearbyVolunteers.length > 0 ? nearbyVolunteers : volunteers;

    await Promise.all(
      volunteersToNotify.map(v =>
        query(
          `INSERT INTO VolunteerNotifications (Volunteer_ID, Message)
           VALUES (?, ?)`,
          [
            v.Volunteer_ID,
            `New donation from Donor ${Donor_ID} in ${donorLocation || 'your service area'}: ${foodSummary} is ready for pickup.`
          ]
        )
      )
    );

    const volunteerEmails = volunteersToNotify
      .map(v => v.Email)
      .filter(Boolean);

    await Promise.allSettled([
      sendEmail({
        from: donorEmail,
        replyTo: donorEmail,
        sender: adminEmail,
        to: adminEmail,
        subject: `New donation added: ${Donation_ID}`,
        text: `${donationSummary} This notification was triggered by donor ${donor.Name || Donor_ID} using ${donorEmail}.`
      }),
      ...volunteerEmails.map(email =>
        sendEmail({
          from: donorEmail,
          replyTo: donorEmail,
          sender: adminEmail,
          to: email,
          subject: `New donor pickup near ${donorLocation || 'your area'}`,
          text: `${donationSummary} Donor contact email: ${donorEmail}. You are being notified because you are available near the donor location.`
        })
      )
    ]);

    res.json({
      message: nearbyVolunteers.length > 0
        ? 'Donation added. Admin and volunteers near the donor were notified!'
        : 'Donation added. Admin and available volunteers were notified!'
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
    const currentRows = await query(
      `SELECT Volunteer_ID, Status
       FROM Donation_Details
       WHERE Donation_ID = ?`,
      [Donation_ID]
    );

    if (!currentRows.length) {
      return res.status(404).json({ error: 'Donation not found.' });
    }

    const current = currentRows[0];
    const sameVolunteerPickingUp =
      current.Volunteer_ID &&
      current.Volunteer_ID === Volunteer_ID &&
      current.Status !== 'Collected';

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
       SET Volunteer_ID = ?
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
    const donationRows = await query(
      `SELECT dd.Donation_ID, dd.Volunteer_ID, dd.Donor_ID, c.Food_ID
       FROM Donation_Details dd
       LEFT JOIN Contains c ON c.Donation_ID = dd.Donation_ID
       WHERE dd.Donation_ID = ?`,
      [Donation_ID]
    );

    if (!donationRows.length) {
      return res.status(404).json({ error: 'Donation not found.' });
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

module.exports = router;
