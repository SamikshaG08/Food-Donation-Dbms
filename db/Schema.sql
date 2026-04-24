-- ============================================================
-- FOOD DONATION MANAGEMENT SYSTEM
-- 23PCIT401L Database Management System Laboratory
-- Batch B1 | Group 05
-- Ishwari Chavan, Anjali Cholke, Samiksha Gavade, Akshada Ingale
-- ============================================================

-- ============================================================
-- STEP 1: CREATE DATABASE
-- ============================================================
CREATE DATABASE IF NOT EXISTS food_donation_db;
USE food_donation_db;


-- ============================================================
-- STEP 2: CREATE TABLES (DDL Commands)
-- ============================================================

-- Table 1: Donor
-- Primary Key: Donor_ID
-- No Foreign Keys
CREATE TABLE Donor (
  Donor_ID    VARCHAR(10)  PRIMARY KEY,
  Name        VARCHAR(100) NOT NULL,
  Phone       VARCHAR(15)  NOT NULL UNIQUE,
  Email       VARCHAR(100) UNIQUE,
  Donor_Type  ENUM('Individual','Organization') NOT NULL,
  Street      VARCHAR(100),
  City        VARCHAR(50),
  Pincode     VARCHAR(10),
  Latitude    DECIMAL(10,8),
  Longitude   DECIMAL(11,8)
);

-- Table 2: Donation_Details
-- Primary Key: Donation_ID
-- Foreign Key: Donor_ID → Donor
CREATE TABLE Donation_Details (
  Donation_ID   VARCHAR(10) PRIMARY KEY,
  Donation_Date DATE        NOT NULL,
  Pickup_Time   TIME        NOT NULL,
  Status        ENUM('Pending','Collected') DEFAULT 'Pending',
  Donor_ID      VARCHAR(10),
  Volunteer_ID  VARCHAR(10),
  FOREIGN KEY (Donor_ID) REFERENCES Donor(Donor_ID) ON DELETE CASCADE
);

-- Table 3: Food_Item
-- Primary Key: Food_ID
-- No Foreign Keys
CREATE TABLE Food_Item (
  Food_ID    VARCHAR(10)  PRIMARY KEY,
  Food_Name  VARCHAR(100) NOT NULL,
  Food_Type  VARCHAR(50),
  Shelf_Life VARCHAR(50)
);

-- Table 4: Contains (Junction Table)
-- Primary Key: (Donation_ID, Food_ID) — Composite Key
-- Foreign Keys: Donation_ID → Donation_Details, Food_ID → Food_Item
CREATE TABLE Contains (
  Donation_ID VARCHAR(10),
  Food_ID     VARCHAR(10),
  Quantity    VARCHAR(50),
  PRIMARY KEY (Donation_ID, Food_ID),
  FOREIGN KEY (Donation_ID) REFERENCES Donation_Details(Donation_ID),
  FOREIGN KEY (Food_ID)     REFERENCES Food_Item(Food_ID)
);

-- Table 5: NGO
-- Primary Key: NGO_ID
-- No Foreign Keys
CREATE TABLE NGO (
  NGO_ID    VARCHAR(10)  PRIMARY KEY,
  NGO_Name  VARCHAR(100) NOT NULL,
  ContactNo VARCHAR(15)  UNIQUE,
  Address   VARCHAR(150),
  Capacity  INT          CHECK (Capacity > 0)
);

-- Table 6: Volunteer
-- Primary Key: Volunteer_ID
-- Foreign Key: NGO_ID → NGO
CREATE TABLE Volunteer (
  Volunteer_ID       VARCHAR(10)  PRIMARY KEY,
  Name               VARCHAR(100) NOT NULL,
  Phone              VARCHAR(15)  UNIQUE,
  Area_Assigned      VARCHAR(100),
  Availability_Status ENUM('Available','Busy') DEFAULT 'Available',
  NGO_ID             VARCHAR(10),
  Rating             DECIMAL(3,2) DEFAULT 0.00,
  Total_Deliveries   INT          DEFAULT 0,
  FOREIGN KEY (NGO_ID) REFERENCES NGO(NGO_ID)
);

-- Table 7: Recipient
-- Primary Key: Recipient_ID
-- No Foreign Keys
CREATE TABLE Recipient (
  Recipient_ID VARCHAR(10)  PRIMARY KEY,
  Name         VARCHAR(100) NOT NULL,
  Contact      VARCHAR(15),
  Location     VARCHAR(100),
  Latitude     DECIMAL(10,8),
  Longitude    DECIMAL(11,8)
);

-- Table 8: Distributes
-- Primary Key: (Food_ID, Recipient_ID, Volunteer_ID) — Composite Key
-- Foreign Keys: Food_ID → Food_Item, Recipient_ID → Recipient, Volunteer_ID → Volunteer
CREATE TABLE Distributes (
  Food_ID               VARCHAR(10),
  Recipient_ID          VARCHAR(10),
  Volunteer_ID          VARCHAR(10),
  Distribution_Date     DATE,
  Quantity_Distribution VARCHAR(50),
  Delivery_Status       ENUM('Pending','PickedUp','InTransit','Delivered') DEFAULT 'Pending',
  Recipient_Accepted    BOOLEAN DEFAULT FALSE,
  Accepted_At           TIMESTAMP NULL,
  Recipient_Rating      INT CHECK (Recipient_Rating BETWEEN 1 AND 5),
  Rated_At              TIMESTAMP NULL,
  PRIMARY KEY (Food_ID, Recipient_ID, Volunteer_ID),
  FOREIGN KEY (Food_ID)      REFERENCES Food_Item(Food_ID),
  FOREIGN KEY (Recipient_ID) REFERENCES Recipient(Recipient_ID),
  FOREIGN KEY (Volunteer_ID) REFERENCES Volunteer(Volunteer_ID)
);
-- Table 9: Users (Login System)
-- Primary Key: User_ID
-- Stores login credentials for all roles
CREATE TABLE Users (
  User_ID  VARCHAR(20) PRIMARY KEY,
  Username VARCHAR(100) NOT NULL,
  Password VARCHAR(100) NOT NULL,
  Role     ENUM('Admin','Donor','Volunteer','Recipient') NOT NULL,
  Ref_ID   VARCHAR(10),
  Email    VARCHAR(100) UNIQUE
);

-- Table 10: Notifications
-- Primary Key: Notification_ID (Auto Increment)
-- Foreign Key: Recipient_ID → Recipient
CREATE TABLE Notifications (
  Notification_ID INT          AUTO_INCREMENT PRIMARY KEY,
  Recipient_ID    VARCHAR(10),
  Message         VARCHAR(255),
  Is_Read         BOOLEAN      DEFAULT FALSE,
  Created_At      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (Recipient_ID) REFERENCES Recipient(Recipient_ID)
);

-- Table 10A: AdminNotifications
-- Stores persistent admin alerts, so admin can see them after logging in
CREATE TABLE AdminNotifications (
  Notification_ID INT          AUTO_INCREMENT PRIMARY KEY,
  Message         VARCHAR(255) NOT NULL,
  Type            VARCHAR(50)  DEFAULT 'general',
  Is_Read         BOOLEAN      DEFAULT FALSE,
  Created_At      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- Table 10B: VolunteerNotifications
-- Stores persistent volunteer alerts, so volunteers can see them after logging in
CREATE TABLE VolunteerNotifications (
  Notification_ID INT          AUTO_INCREMENT PRIMARY KEY,
  Volunteer_ID    VARCHAR(10),
  Message         VARCHAR(255) NOT NULL,
  Is_Read         BOOLEAN      DEFAULT FALSE,
  Created_At      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (Volunteer_ID) REFERENCES Volunteer(Volunteer_ID)
);

-- Table 11: DeliveryTracking
-- Primary Key: Tracking_ID (Auto Increment)
-- Foreign Keys: Volunteer_ID → Volunteer, Donation_ID → Donation_Details
CREATE TABLE DeliveryTracking (
  Tracking_ID  INT          AUTO_INCREMENT PRIMARY KEY,
  Volunteer_ID VARCHAR(10),
  Latitude     DECIMAL(10,8),
  Longitude    DECIMAL(11,8),
  Donation_ID  VARCHAR(10),
  Updated_At   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (Volunteer_ID) REFERENCES Volunteer(Volunteer_ID),
  FOREIGN KEY (Donation_ID)  REFERENCES Donation_Details(Donation_ID)
);

-- Table 12: DeliveryConfirmation
-- Primary Key: Confirmation_ID (Auto Increment)
-- Foreign Keys: Donation_ID, Volunteer_ID, Recipient_ID, NGO_ID
CREATE TABLE DeliveryConfirmation (
  Confirmation_ID  INT  AUTO_INCREMENT PRIMARY KEY,
  Donation_ID      VARCHAR(10),
  Volunteer_ID     VARCHAR(10),
  Recipient_ID     VARCHAR(10),
  NGO_ID           VARCHAR(10),
  Confirmed_At     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  NGO_Confirmed    BOOLEAN   DEFAULT FALSE,
  Volunteer_Rating INT       CHECK (Volunteer_Rating BETWEEN 1 AND 5),
  FOREIGN KEY (Donation_ID)  REFERENCES Donation_Details(Donation_ID),
  FOREIGN KEY (Volunteer_ID) REFERENCES Volunteer(Volunteer_ID),
  FOREIGN KEY (Recipient_ID) REFERENCES Recipient(Recipient_ID),
  FOREIGN KEY (NGO_ID)       REFERENCES NGO(NGO_ID)
);

-- Table 13: FoodRequests
-- Primary Key: Request_ID
-- Foreign Keys: Recipient_ID → Recipient, Food_ID → Food_Item
CREATE TABLE FoodRequests (
  Request_ID     VARCHAR(20) PRIMARY KEY,
  Recipient_ID   VARCHAR(10),
  Food_ID        VARCHAR(10),
  Donation_ID    VARCHAR(10),
  Quantity_Needed VARCHAR(50),
  Request_Date   DATE        DEFAULT (CURDATE()),
  Status         ENUM('Pending','Approved','Rejected') DEFAULT 'Pending',
  FOREIGN KEY (Recipient_ID) REFERENCES Recipient(Recipient_ID),
  FOREIGN KEY (Food_ID)      REFERENCES Food_Item(Food_ID),
  FOREIGN KEY (Donation_ID)  REFERENCES Donation_Details(Donation_ID)
);

-- ============================================================
-- STEP 3: ALTER TABLE (Schema Changes Made During Development)
-- ============================================================

-- Added Volunteer_ID to Donation_Details for assignment tracking
ALTER TABLE Donation_Details
ADD FOREIGN KEY (Volunteer_ID) REFERENCES Volunteer(Volunteer_ID);

-- Increased User_ID size to accommodate generated IDs
ALTER TABLE Users MODIFY User_ID VARCHAR(20);

-- Link each recipient request to the exact available donation item being ordered
-- For an existing database, run:
-- ALTER TABLE FoodRequests ADD COLUMN Donation_ID VARCHAR(10) AFTER Food_ID;
-- ALTER TABLE FoodRequests ADD FOREIGN KEY (Donation_ID) REFERENCES Donation_Details(Donation_ID);

-- Store one recipient rating per completed delivery
-- For an existing database, run:
-- ALTER TABLE Distributes ADD COLUMN Recipient_Accepted BOOLEAN DEFAULT FALSE;
-- ALTER TABLE Distributes ADD COLUMN Accepted_At TIMESTAMP NULL;
-- ALTER TABLE Distributes ADD COLUMN Recipient_Rating INT NULL;
-- ALTER TABLE Distributes ADD COLUMN Rated_At TIMESTAMP NULL;

-- ============================================================
-- STEP 4: INSERT SAMPLE DATA (DML Commands)
-- ============================================================

-- Insert Donors
INSERT INTO Donor VALUES
('D1','Amit Shah','9876543210','amit@gmail.com','Individual','MG Road','Pune','411001',18.5204,73.8567),
('D2','Food Corp','9123456780','food@corp.com','Organization','FC Road','Pune','411004',18.5167,73.8562),
('D3','Neha Patil','9988776655','neha@gmail.com','Individual','Baner','Pune','411045',18.5590,73.7868);

-- Insert Food Items
INSERT INTO Food_Item VALUES
('F1','Rice','Veg','6 months'),
('F2','Bread','Veg','2 days'),
('F3','Milk','Dairy','1 day');

-- Insert NGOs
INSERT INTO NGO VALUES
('N1','Helping Hands','9871112223','Pune Camp',100),
('N2','Food Relief','9765432109','Shivaji Nagar',150),
('N3','Care India','9123451234','Wakad',200);

-- Insert Volunteers
INSERT INTO Volunteer VALUES
('V1','Rahul','9998887776','Baner','Available','N1',0.00,0),
('V2','Sneha','8887776665','Wakad','Busy','N2',0.00,0),
('V3','Karan','7776665554','Hinjewadi','Available','N3',0.00,0);

-- Insert Recipients
INSERT INTO Recipient VALUES
('R1','Ramesh','9123456789','Baner',18.5590,73.7868),
('R2','Sita','9988776655','Wakad',18.5642,73.7769),
('R3','Mohan','9876501234','Hinjewadi',18.5912,73.7390);

-- Insert Donation Details
INSERT INTO Donation_Details VALUES
('DN1','2026-03-20','10:00:00','Collected','D1',NULL),
('DN2','2026-03-21','14:00:00','Pending','D2',NULL),
('DN3','2026-03-22','11:30:00','Collected','D3',NULL);

-- Insert Contains (What food is in each donation)
INSERT INTO Contains VALUES
('DN1','F1','10 kg'),
('DN1','F2','20 pcs'),
('DN2','F3','15 liters');

-- Insert Distributes
INSERT INTO Distributes VALUES
('F1','R1','V1','2026-03-20','5 kg','Delivered'),
('F2','R2','V2','2026-03-21','10 pcs','Pending'),
('F3','R3','V3','2026-03-22','7 liters','Pending');

-- Insert Users (Login Credentials)
INSERT INTO Users VALUES
('U1','admin','admin123','Admin',NULL,'admin@fooddonation.com'),
('U2','Amit Shah','donor123','Donor','D1','amit@gmail.com'),
('U3','Food Corp','donor123','Donor','D2','food@corp.com'),
('U4','Rahul','vol123','Volunteer','V1','rahul@gmail.com'),
('U5','Sneha','vol123','Volunteer','V2','sneha@gmail.com'),
('U6','Ramesh','rec123','Recipient','R1','ramesh@gmail.com'),
('U7','Sita','rec123','Recipient','R2','sita@gmail.com');

-- Update Recipient Locations
UPDATE Recipient SET Latitude=18.5590, Longitude=73.7868 WHERE Recipient_ID='R1';
UPDATE Recipient SET Latitude=18.5642, Longitude=73.7769 WHERE Recipient_ID='R2';
UPDATE Recipient SET Latitude=18.5912, Longitude=73.7390 WHERE Recipient_ID='R3';

-- Update Donor Locations
UPDATE Donor SET Latitude=18.5204, Longitude=73.8567 WHERE Donor_ID='D1';
UPDATE Donor SET Latitude=18.5167, Longitude=73.8562 WHERE Donor_ID='D2';
UPDATE Donor SET Latitude=18.5590, Longitude=73.7868 WHERE Donor_ID='D3';

-- ============================================================
-- STEP 5: CREATE VIEW (for Donation Summary Report)
-- ============================================================

CREATE VIEW DonationSummary AS
SELECT
  dd.Donation_ID,
  d.Name        AS Donor_Name,
  dd.Donation_Date,
  dd.Status,
  fi.Food_Name,
  c.Quantity
FROM Donation_Details dd
JOIN Donor      d  ON dd.Donor_ID    = d.Donor_ID
JOIN Contains   c  ON dd.Donation_ID = c.Donation_ID
JOIN Food_Item  fi ON c.Food_ID      = fi.Food_ID;

-- ============================================================
-- STEP 6: USEFUL QUERIES (for Viva / Demonstration)
-- ============================================================

-- 1. View complete donation summary
SELECT * FROM DonationSummary;

-- 2. Count total donations per donor (Aggregate Function)
SELECT d.Name, COUNT(dd.Donation_ID) AS Total_Donations
FROM Donor d
JOIN Donation_Details dd ON d.Donor_ID = dd.Donor_ID
GROUP BY d.Name
ORDER BY Total_Donations DESC;

-- 3. View all pending donations
SELECT * FROM Donation_Details WHERE Status = 'Pending';

-- 4. View volunteers sorted by rating (highest first)
SELECT Volunteer_ID, Name, Area_Assigned,
       Rating, Total_Deliveries, Availability_Status
FROM Volunteer
ORDER BY Rating DESC;

-- 5. View all food requests with recipient names
SELECT fr.Request_ID, r.Name AS Recipient_Name,
       fr.Donation_ID,
       fi.Food_Name, fr.Quantity_Needed,
       fr.Request_Date, fr.Status
FROM FoodRequests fr
JOIN Recipient r  ON fr.Recipient_ID = r.Recipient_ID
JOIN Food_Item fi ON fr.Food_ID      = fi.Food_ID;

-- 6. View delivery status of all distributions
SELECT d.Food_ID, r.Name AS Recipient_Name,
       v.Name AS Volunteer_Name, d.Distribution_Date,
       d.Quantity_Distribution, d.Delivery_Status
FROM Distributes d
JOIN Recipient r  ON d.Recipient_ID = r.Recipient_ID
JOIN Volunteer v  ON d.Volunteer_ID = v.Volunteer_ID;

-- 7. Count food items by type (Aggregate Function)
SELECT Food_Type, COUNT(*) AS Total_Items
FROM Food_Item
GROUP BY Food_Type;

-- 8. View unread notifications
SELECT n.Notification_ID, r.Name AS Recipient_Name,
       n.Message, n.Created_At
FROM Notifications n
JOIN Recipient r ON n.Recipient_ID = r.Recipient_ID
WHERE n.Is_Read = FALSE;

-- 9. View NGO capacity vs volunteer count
SELECT n.NGO_Name, n.Capacity,
       COUNT(v.Volunteer_ID) AS Total_Volunteers
FROM NGO n
LEFT JOIN Volunteer v ON n.NGO_ID = v.NGO_ID
GROUP BY n.NGO_Name, n.Capacity;

-- 10. View top rated volunteers (Rating >= 4)
SELECT Name, Area_Assigned, Rating, Total_Deliveries
FROM Volunteer
WHERE Rating >= 4
ORDER BY Rating DESC;

-- 11. Mathematical operation — Average volunteer rating
SELECT AVG(Rating) AS Average_Rating,
       MAX(Rating) AS Highest_Rating,
       MIN(Rating) AS Lowest_Rating
FROM Volunteer
WHERE Rating > 0;

-- 12. Date operation — Donations in last 30 days
SELECT * FROM Donation_Details
WHERE Donation_Date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY);

-- ============================================================
-- STEP 7: CONSTRAINTS SUMMARY
-- ============================================================

-- PRIMARY KEY    → Every table has a unique identifier
-- FOREIGN KEY    → Links tables together (referential integrity)
-- NOT NULL       → Name fields cannot be empty
-- UNIQUE         → Phone, Email cannot be duplicated
-- CHECK          → NGO Capacity must be > 0
--                  Volunteer_Rating must be between 1 and 5
-- DEFAULT        → Status defaults to 'Pending'
--                  Availability_Status defaults to 'Available'
--                  Is_Read defaults to FALSE
-- ENUM           → Restricts values to specific options
-- AUTO_INCREMENT → Notification_ID, Tracking_ID auto generated
-- ON DELETE CASCADE → Deleting donor deletes their donations

-- ============================================================
-- END OF FILE
-- ============================================================
