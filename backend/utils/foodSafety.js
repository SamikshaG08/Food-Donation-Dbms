function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeDateTimeInput(value) {
  const date = toDate(value);

  if (!date) {
    return null;
  }

  const pad = num => String(num).padStart(2, '0');

  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    ' ',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
    ':',
    pad(date.getSeconds())
  ].join('');
}

function isExpired(expiryTime, now = new Date()) {
  const expiry = toDate(expiryTime);
  return Boolean(expiry && expiry.getTime() <= now.getTime());
}

function getFoodSafetyValidationError({ preparedTime, expiryTime }, now = new Date()) {
  const prepared = toDate(preparedTime);
  const expiry = toDate(expiryTime);

  if (!prepared || !expiry) {
    return 'Prepared time and expiry time are required for each food item.';
  }

  if (prepared.getTime() >= expiry.getTime()) {
    return 'Expiry time must be after prepared time.';
  }

  if (expiry.getTime() <= now.getTime()) {
    return 'Expired food cannot be added or assigned.';
  }

  return null;
}

async function refreshExpiredDonationStatuses(query) {
  await query(
    `UPDATE Donation_Details dd
     SET dd.Status = 'Expired'
     WHERE dd.Status IN ('Pending', 'Partially Fulfilled')
       AND EXISTS (
         SELECT 1
         FROM Contains c
         JOIN Food_Item fi ON fi.Food_ID = c.Food_ID
         WHERE c.Donation_ID = dd.Donation_ID
       )
       AND NOT EXISTS (
         SELECT 1
         FROM Contains c
         JOIN Food_Item fi ON fi.Food_ID = c.Food_ID
         WHERE c.Donation_ID = dd.Donation_ID
           AND fi.Expiry_Time > NOW()
       )`
  );

  await query(
    `UPDATE FoodRequests fr
     JOIN Food_Item fi ON fi.Food_ID = fr.Food_ID
     JOIN Donation_Details dd ON dd.Donation_ID = fr.Donation_ID
     SET fr.Status = 'Expired'
     WHERE fr.Status IN ('Pending', 'Approved')
       AND (fi.Expiry_Time <= NOW() OR dd.Status = 'Expired')`
  );

  await query(
    `UPDATE Distributes d
     JOIN Food_Item fi ON fi.Food_ID = d.Food_ID
     JOIN FoodRequests fr
       ON fr.Food_ID = d.Food_ID
      AND fr.Recipient_ID = d.Recipient_ID
     SET d.Delivery_Status = 'Cancelled'
     WHERE d.Delivery_Status IN ('Pending', 'PickedUp', 'InTransit')
       AND (fi.Expiry_Time <= NOW() OR fr.Status IN ('Expired', 'Cancelled'))`
  );
}

module.exports = {
  getFoodSafetyValidationError,
  isExpired,
  normalizeDateTimeInput,
  refreshExpiredDonationStatuses
};
