-- NOON FLEET HRMS - COMPLETE DATABASE SCHEMA
-- Run this file on your PostgreSQL database

-- ASSET MANAGEMENT TABLES
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  assetType TEXT NOT NULL,
  assetName TEXT NOT NULL,
  serialNumber TEXT UNIQUE,
  bikeNumber TEXT UNIQUE,
  phoneNumber TEXT UNIQUE,
  purchaseDate DATE,
  registrationDate DATE,
  insuranceExpiry DATE,
  warrantyExpiry DATE,
  maintenanceDue DATE,
  status TEXT DEFAULT 'Available',
  condition TEXT,
  currentMileage INT,
  bikModel TEXT,
  bikeColor TEXT,
  simProvider TEXT,
  simType TEXT,
  simPlan TEXT,
  remainingBalance DECIMAL(10,2),
  assetQuantity INT DEFAULT 1,
  itemSize TEXT,
  itemColor TEXT,
  serailNumbers TEXT,
  customFields TEXT,
  notes TEXT,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assetAssignments (
  id TEXT PRIMARY KEY,
  assetId TEXT REFERENCES assets(id) ON DELETE CASCADE,
  employeeId TEXT REFERENCES employees(id) ON DELETE CASCADE,
  assignmentDate DATE NOT NULL,
  returnDate DATE,
  condition TEXT,
  acknowledgedBy TEXT,
  confirmedAt TIMESTAMP,
  notes TEXT,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW(),
  UNIQUE(assetId, employeeId) WHERE returnDate IS NULL
);

CREATE TABLE IF NOT EXISTS assetHistory (
  id TEXT PRIMARY KEY,
  assetId TEXT REFERENCES assets(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  fromEmployeeId TEXT REFERENCES employees(id),
  toEmployeeId TEXT REFERENCES employees(id),
  actionDate TIMESTAMP DEFAULT NOW(),
  notes TEXT,
  createdBy TEXT
);

-- ACCOMMODATION MANAGEMENT TABLES
CREATE TABLE IF NOT EXISTS camps (
  id TEXT PRIMARY KEY,
  campName TEXT UNIQUE NOT NULL,
  location TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  address TEXT,
  managerName TEXT,
  managerPhone TEXT,
  managerEmail TEXT,
  totalCapacity INT,
  amenities TEXT,
  createdAt TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subdivisions (
  id TEXT PRIMARY KEY,
  campId TEXT REFERENCES camps(id) ON DELETE CASCADE,
  subdivisionName TEXT NOT NULL,
  capacity INT,
  description TEXT,
  createdAt TIMESTAMP DEFAULT NOW(),
  UNIQUE(campId, subdivisionName)
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  campId TEXT REFERENCES camps(id) ON DELETE CASCADE,
  subdivisionId TEXT REFERENCES subdivisions(id) ON DELETE CASCADE,
  roomNumber TEXT NOT NULL,
  roomType TEXT,
  capacity INT,
  status TEXT DEFAULT 'Available',
  amenities TEXT,
  condition TEXT,
  createdAt TIMESTAMP DEFAULT NOW(),
  UNIQUE(campId, roomNumber)
);

CREATE TABLE IF NOT EXISTS roomAssignments (
  id TEXT PRIMARY KEY,
  roomId TEXT REFERENCES rooms(id) ON DELETE CASCADE,
  employeeId TEXT REFERENCES employees(id) ON DELETE CASCADE,
  campId TEXT REFERENCES camps(id) ON DELETE CASCADE,
  checkInDate DATE NOT NULL,
  checkOutDate DATE,
  status TEXT DEFAULT 'Active',
  checkoutRequestDate TIMESTAMP,
  checkoutReason TEXT,
  approvedBy TEXT,
  approvalDate TIMESTAMP,
  notes TEXT,
  createdAt TIMESTAMP DEFAULT NOW(),
  UNIQUE(employeeId) WHERE status = 'Active'
);

-- DOCUMENT MANAGEMENT TABLES
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  employeeId TEXT REFERENCES employees(id) ON DELETE CASCADE,
  documentType TEXT,
  documentName TEXT,
  filename TEXT,
  fileSize INT,
  filePath TEXT,
  uploadedAt TIMESTAMP DEFAULT NOW(),
  uploadedBy TEXT,
  expiryDate DATE,
  importedFromGoogleDrive BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'Active',
  notes TEXT
);

CREATE TABLE IF NOT EXISTS documentCategories (
  id TEXT PRIMARY KEY,
  categoryName TEXT UNIQUE NOT NULL,
  description TEXT,
  requiredForOnboarding BOOLEAN DEFAULT FALSE,
  createdAt TIMESTAMP DEFAULT NOW()
);

-- NOTIFICATION TABLE
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  employeeId TEXT REFERENCES employees(id) ON DELETE CASCADE,
  type TEXT,
  title TEXT,
  content TEXT,
  relatedId TEXT,
  isRead BOOLEAN DEFAULT FALSE,
  readAt TIMESTAMP,
  createdAt TIMESTAMP DEFAULT NOW()
);

-- IMPORT LOGS TABLE
CREATE TABLE IF NOT EXISTS importLogs (
  id TEXT PRIMARY KEY,
  importType TEXT,
  totalRecords INT,
  successRecords INT,
  failureRecords INT,
  importedBy TEXT,
  importedAt TIMESTAMP DEFAULT NOW(),
  duplicatesFound INT,
  duplicatesList TEXT,
  filePath TEXT,
  notes TEXT
);

-- CREATE INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_assetType ON assets(assetType);
CREATE INDEX IF NOT EXISTS idx_assetAssignments_employeeId ON assetAssignments(employeeId);
CREATE INDEX IF NOT EXISTS idx_assetAssignments_assetId ON assetAssignments(assetId);
CREATE INDEX IF NOT EXISTS idx_roomAssignments_employeeId ON roomAssignments(employeeId);
CREATE INDEX IF NOT EXISTS idx_roomAssignments_roomId ON roomAssignments(roomId);
CREATE INDEX IF NOT EXISTS idx_rooms_campId ON rooms(campId);
CREATE INDEX IF NOT EXISTS idx_documents_employeeId ON documents(employeeId);
CREATE INDEX IF NOT EXISTS idx_notifications_employeeId ON notifications(employeeId);

-- INSERT DEFAULT DOCUMENT CATEGORIES
INSERT INTO documentCategories (id, categoryName, description, requiredForOnboarding) VALUES
('DOC-CAT-001', 'Passport', 'Employee passport document', TRUE),
('DOC-CAT-002', 'Visa', 'Employee visa document', TRUE),
('DOC-CAT-003', 'Agreement', 'Employment agreement', TRUE),
('DOC-CAT-004', 'Photo', 'Employee photo ID', TRUE),
('DOC-CAT-005', 'License', 'Driving license or professional license', FALSE),
('DOC-CAT-006', 'Insurance', 'Insurance documents', FALSE),
('DOC-CAT-007', 'Medical', 'Medical certificate or health documents', FALSE),
('DOC-CAT-008', 'Bank', 'Bank details and documents', FALSE),
('DOC-CAT-009', 'Other', 'Other documents', FALSE)
ON CONFLICT DO NOTHING;

-- ASSET TYPE DEFAULTS
INSERT INTO assets (id, assetType, assetName, status) VALUES
('ASSET-TYPE-BIKE', 'bike', 'Bike Asset Type', 'Available'),
('ASSET-TYPE-SIM', 'sim', 'SIM Asset Type', 'Available'),
('ASSET-TYPE-ACC', 'accessory', 'Accessory Asset Type', 'Available')
ON CONFLICT DO NOTHING;

COMMIT;
