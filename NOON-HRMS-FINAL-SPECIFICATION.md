# NOON FLEET HRMS - FINAL DETAILED SPECIFICATION
## With Asset Management, Accommodation, Google Drive Import, Exit Workflow

**Version:** 1.0 Final  
**Status:** Ready for Development  
**Date:** June 2026

---

## 1. DOCUMENT MANAGEMENT (NOT REPLACEMENT - IMPORT FROM GOOGLE DRIVE)

### Purpose
- Import documents from Google Drive into HRMS
- Keep Google Drive as source, HRMS as backup/indexed
- Search and access documents from HRMS
- Track document expiry
- No replacement, both systems work together

### Features
- **Import Process:**
  - Upload documents from Google Drive to HRMS
  - Organize by employee
  - Auto-categorize (passport, visa, agreement, photo, etc.)
  - Set expiry dates
  - Add notes/remarks
  
- **Access:**
  - View in HRMS
  - Download from HRMS
  - See metadata (upload date, size, expiry)
  - Search by employee or type

- **No Deletion:**
  - Original files stay in Google Drive
  - HRMS keeps a copy + metadata
  - Both systems synchronized

---

## 2. ASSET MANAGEMENT (FLEXIBLE FIELD MODEL)

### Asset Types with Specific Fields

#### A. BIKE ASSET
```
Field Name              Type        Required    Notes
─────────────────────────────────────────────────────────
Asset ID               Text        Yes         Auto-generated (BIKE-001)
Bike Number           Text        Yes         VIN/registration number
Bike Model            Text        Yes         Hero Honda CB125R, etc.
Bike Color            Text        No          
Purchase Date         Date        Yes         When bike was purchased
Registration Date     Date        Yes         Registration with RTO
Insurance Expiry      Date        Yes         Insurance valid till
Maintenance Due       Date        No          Next maintenance date
Current Status        Select      Yes         Available/Assigned/Maintenance/Damaged
Condition             Text        No          Good/Fair/Damaged
Current Mileage       Number      No          KMs on bike
Notes                 Text        No          
```

#### B. SIM CARD ASSET
```
Field Name              Type        Required    Notes
─────────────────────────────────────────────────────────
Asset ID               Text        Yes         Auto-generated (SIM-001)
Phone Number          Text        Yes         10 digit mobile number
SIM Provider          Select      Yes         Jio/Airtel/Vodafone/etc
SIM Type              Select      Yes         4G/5G
Providing Date        Date        Yes         Date given to employee
Expiry Date           Date        Yes         When SIM expires
Plan Name             Text        No          Active Plan
Remaining Balance     Number      No          Account balance
Status                Select      Yes         Active/Inactive/Blocked/Expired
Notes                 Text        No          
```

#### C. GENERAL ASSETS (Helmet, Gloves, Accessories, etc.)
```
Field Name              Type        Required    Notes
─────────────────────────────────────────────────────────
Asset ID               Text        Yes         Auto-generated (ACC-001)
Asset Type            Select      Yes         Helmet/Gloves/Jacket/Shoes/etc
Item Name             Text        Yes         Specific item name
Quantity              Number      Yes         How many items
Item Condition        Select      Yes         New/Good/Fair/Damaged
Purchase Date         Date        Yes         When purchased
Warranty Expiry       Date        No          Warranty valid till
Size (if applicable)  Text        No          S/M/L/XL for clothes
Color                 Text        No          
Serial Numbers        Text        No          If multiple items with SNs
Status                Select      Yes         Available/Assigned/Damaged
Notes                 Text        No          
```

### Assignment Rules
✅ **One asset can be assigned to ONE employee at a time**
❌ **Cannot assign same asset to multiple employees**
✅ **Employee can have multiple assets (bike + SIM + helmet)**
❌ **Cannot assign same asset twice**
✅ **Track assignment history**
✅ **Return asset to mark available again**

### Assignment Workflow
```
1. Admin selects asset
2. Admin selects employee
3. System checks:
   - Is asset already assigned? (if yes, show error)
   - Is this the current owner? (if yes, show warning)
4. Record assignment with date
5. SEND NOTIFICATION TO EMPLOYEE:
   "You have been assigned: [Asset Name]
    Assignment Date: [Date]
    Please confirm receipt"
6. Employee acknowledges (or admin confirms)
7. Assignment complete
```

### Return Workflow
```
1. Employee/Admin clicks "Return Asset"
2. Record condition at return:
   - Good (no damage)
   - Fair (minor damage)
   - Damaged (major damage)
   - Lost (not found)
3. Add return notes
4. SEND NOTIFICATION TO EMPLOYEE:
   "Asset returned: [Asset Name]
    Return Date: [Date]
    Condition: [Status]"
5. Asset marked as Available
6. Assignment history saved
```

---

## 3. ACCOMMODATION MANAGEMENT

### Structure (Hierarchical)

```
┌─ COMPANY
   ├─ CAMP 1 (Dubai)
   │  ├─ Subdivision A
   │  │  ├─ Room 101 (Double)
   │  │  ├─ Room 102 (Single)
   │  │  └─ Room 103 (Dormitory - 6 beds)
   │  ├─ Subdivision B
   │  │  ├─ Room 201 (Double)
   │  │  └─ Room 202 (Double)
   │  └─ Subdivision C
   │     ├─ Room 301
   │     └─ Room 302
   │
   ├─ CAMP 2 (Abu Dhabi)
   │  ├─ Subdivision A
   │  │  ├─ Room 101
   │  │  └─ Room 102
   │  └─ Subdivision B
   │     ├─ Room 201
   │     └─ Room 202
   │
   └─ CAMP 3 (Sharjah)
      └─ [Rooms...]
```

### Camp Configuration
```
Field                Type        Notes
─────────────────────────────────────────────────
Camp Name           Text        Dubai Camp A
Location            Text        Dubai, UAE
City                Text        Dubai
State/Emirate       Text        Dubai
Country             Text        UAE
Address             Text        Full address
Camp Manager Name   Text        Manager name
Manager Phone       Phone       Contact number
Manager Email       Email       Email
Total Capacity      Number      Total beds in camp
Amenities           Checkbox    AC/WiFi/Parking/Gym/etc
Created Date        Auto        System timestamp
```

### Subdivision Configuration
```
Field                Type        Notes
─────────────────────────────────────────────────
Subdivision Name    Text        Block A, Building 1, etc
Camp ID             Link        Which camp
Capacity            Number      Total beds in this subdivision
Description         Text        Ground floor, West wing, etc
```

### Room Configuration
```
Field                Type        Notes
─────────────────────────────────────────────────
Room Number         Text        101, 102, A1, etc (UNIQUE PER CAMP)
Camp ID             Link        Which camp
Subdivision ID      Link        Which subdivision
Room Type           Select      Single/Double/Dormitory
Capacity            Number      1/2/6 beds
Status              Select      Available/Occupied/Maintenance
Amenities           Text        AC/WiFi/Attached Bath/etc
Room Condition      Text        Good/Fair/Needs Repair
Created Date        Auto        System timestamp
```

### Assignment Validation Rules
```
1. NO DOUBLE ASSIGNMENT
   ├─ One employee = ONE room
   ├─ One room = n employees (based on capacity)
   └─ Cannot assign same person to 2 rooms

2. UNIQUE ROOM ASSIGNMENT
   ├─ Check if employee already has active assignment
   ├─ If yes, first must CHECKOUT from previous room
   └─ Then can assign to new room

3. CAPACITY CHECK
   ├─ Count current occupants in room
   ├─ Compare with room capacity
   ├─ If at capacity, show error "Room Full"
   └─ Only assign if space available

4. SUBDIVISION CAPACITY
   ├─ Check total occupancy per subdivision
   ├─ Track and report
   └─ Alert when near full
```

### Check-In Workflow
```
1. Admin selects employee + room
2. System validates:
   ├─ Employee has no active room assignment
   ├─ Room has capacity available
   └─ No duplicates
3. If valid:
   ├─ Create assignment record
   ├─ Record check-in date
   ├─ Mark room status as "Occupied"
   └─ SEND NOTIFICATION TO EMPLOYEE:
      "You are assigned to Room [X]
       Camp: [Camp Name]
       Check-In Date: [Date]
       Room Details: [Type, Capacity, Amenities]"
4. System sends confirmation
5. Assignment complete
```

### Check-Out Workflow (WITH APPROVAL)
```
STEP 1: EMPLOYEE REQUESTS EXIT
├─ Employee clicks "Request Checkout"
├─ Provides reason (transfer, left company, etc)
├─ System records request with timestamp
└─ NOTIFICATION TO ADMIN:
   "[Employee] requests checkout from Room [X]
    Reason: [Provided reason]
    Please approve/reject"

STEP 2: ADMIN APPROVES/REJECTS
├─ Admin reviews request
├─ If approved:
│  ├─ System records approval
│  ├─ Mark room as Available
│  ├─ Record check-out date
│  └─ SEND NOTIFICATION TO EMPLOYEE:
│     "Your checkout request approved
│      Check-Out Date: [Date]
│      Please vacate room by [Date]"
│
└─ If rejected:
   └─ SEND NOTIFICATION TO EMPLOYEE:
      "Your checkout request rejected
       Reason: [Provided by admin]
       Please contact manager"

STEP 3: CONFIRM CHECKOUT
├─ Employee confirms vacated
├─ Admin confirms room status
└─ Assignment marked as "Completed"
   Checkout date recorded
```

### Room Assignment Report
```
Shows:
- All camps and occupancy
- Room-wise occupancy
- Employee names per room
- Check-in dates
- Pending checkouts
- Empty rooms
- Capacity utilization %
```

---

## 4. NOTIFICATION SYSTEM

### Asset Assignment Notification
```
TITLE: Asset Assigned
RECIPIENT: Employee
CONTENT: "You have been assigned:
         Asset Type: [Bike/SIM/Helmet/etc]
         Asset Name: [Specific name]
         Asset ID: [ID]
         Assigned Date: [Date]
         Assigned By: [Admin name]
         Action: Please confirm receipt"
STATUS: Unread → Read → Confirmed
```

### Accommodation Assignment Notification
```
TITLE: Room Assigned
RECIPIENT: Employee
CONTENT: "You are assigned to accommodation:
         Camp: [Camp Name]
         Location: [Address]
         Room: [Room Number]
         Room Type: [Single/Double/Dorm]
         Check-In Date: [Date]
         Amenities: [List]
         Manager: [Manager name & phone]"
STATUS: Unread → Read → Acknowledged
```

### Exit Request Notification
```
TITLE: Exit Request Submitted
RECIPIENT: Employee (confirmation)
CONTENT: "Your checkout request is submitted:
         Room: [Room Number]
         Camp: [Camp Name]
         Reason: [Provided reason]
         Status: Awaiting approval
         Requested: [Date]"

TITLE: Exit Request Approved/Rejected
RECIPIENT: Employee
CONTENT: "Your checkout request [APPROVED/REJECTED]
         If approved - vacate by [Date]
         If rejected - reason: [Provided]"
```

### Asset Return Notification
```
TITLE: Asset Returned
RECIPIENT: Employee
CONTENT: "Asset returned successfully:
         Asset: [Name]
         Return Date: [Date]
         Condition: [Good/Fair/Damaged/Lost]
         Notes: [Any notes]
         Thank you!"
```

---

## 5. DATA IMPORT FUNCTIONALITY

### Import Rules
```
✅ BULK IMPORT (Excel/CSV)
├─ Employees (name, ID, email)
├─ Assets (bikes, SIMs, accessories)
├─ Camps (camp names, locations)
├─ Rooms (room numbers, types, capacity)
├─ Documents (upload files)
└─ Assignments (if pre-planned)

❌ DUPLICATE PREVENTION
├─ Check for existing employee ID
├─ Check for existing bike number
├─ Check for existing phone number
├─ Check for existing room number
├─ Show duplicates before import
├─ Option to skip or overwrite (admin choice)
└─ Log all imports with timestamp

✅ DATA VALIDATION
├─ Required fields check
├─ Phone number format validation
├─ Date format validation
├─ Enum validation (status, type)
└─ Show validation errors before import
```

### Import Process
```
1. Admin uploads Excel/CSV file
2. System previews data
3. Validation check:
   ├─ Check format
   ├─ Check duplicates
   ├─ Show any errors/warnings
   └─ Count total records
4. Admin confirms import
5. System imports data:
   ├─ Insert records
   ├─ Log import ID
   ├─ Timestamp each record
   └─ Show success/failure report
6. Send summary email to admin
```

---

## 6. DATABASE TABLES (FINAL)

```sql
-- EMPLOYEES (existing)
employees
├─ id, empId, name, email, passportNo, status, data

-- ASSETS
assets
├─ id, assetType (bike/sim/accessory)
├─ assetName, serialNumber, UNIQUE constraint
├─ bikeNumber (for bikes), phoneNumber (for SIM)
├─ purchaseDate, expiryDate, warrantyExpiry
├─ status (Available/Assigned/Damaged/Maintenance)
├─ customFields (JSON for flexible fields)
├─ createdAt, updatedAt

assetAssignments
├─ id, assetId, employeeId
├─ assignmentDate, returnDate
├─ condition (Good/Fair/Damaged/Lost)
├─ acknowledgedBy, confirmedAt
├─ createdAt

assetHistory
├─ id, assetId, action
├─ fromEmployee, toEmployee
├─ actionDate, notes, createdBy

-- ACCOMMODATION
camps
├─ id, campName (UNIQUE)
├─ location, city, state, country
├─ manager, managerPhone, managerEmail
├─ totalCapacity, createdAt

subdivisions
├─ id, campId, subdivisionName
├─ capacity, description, createdAt

rooms
├─ id, campId, subdivisionId
├─ roomNumber (UNIQUE per camp)
├─ roomType (Single/Double/Dorm)
├─ capacity, status (Available/Occupied/Maintenance)
├─ amenities (JSON), condition, createdAt

roomAssignments
├─ id, roomId, employeeId, campId
├─ checkInDate, checkOutDate
├─ status (Active/Completed)
├─ checkoutRequestDate, approvedBy, approvalDate
├─ CONSTRAINT: one employee one active room
├─ createdAt

-- DOCUMENTS
documents
├─ id, employeeId, documentType
├─ documentName, filename, filePath
├─ uploadedAt, uploadedBy, expiryDate
├─ importedFromGoogleDrive (boolean)
├─ status (Active/Expired)

documentCategories
├─ id, categoryName
├─ requiredForOnboarding, createdAt

-- NOTIFICATIONS
notifications
├─ id, employeeId, type
├─ title, content, relatedId
├─ isRead, createdAt

-- IMPORT LOGS
importLogs
├─ id, importType (assets/employees/rooms)
├─ totalRecords, successRecords, failureRecords
├─ importedBy, importedAt
├─ duplicatesFound, duplicatesList (JSON)
├─ filePath, notes
```

---

## 7. API ENDPOINTS (FINAL)

### ASSET MANAGEMENT
```
GET    /api/assets                              -- List all assets
POST   /api/assets                              -- Create asset
GET    /api/assets/:id                          -- Get asset details
PATCH  /api/assets/:id                          -- Update asset
DELETE /api/assets/:id                          -- Delete asset

POST   /api/assets/:id/assign                   -- Assign to employee
POST   /api/assets/:id/return                   -- Return from employee
GET    /api/assets/:id/history                  -- Assignment history
GET    /api/assets/employee/:empId              -- Assets of employee

POST   /api/assets/import                       -- Bulk import
GET    /api/assets/report                       -- Asset report
GET    /api/assets/duplicates                   -- Check duplicates
```

### ACCOMMODATION MANAGEMENT
```
GET    /api/accommodation/camps                 -- List camps
POST   /api/accommodation/camps                 -- Create camp
PATCH  /api/accommodation/camps/:id             -- Update camp

GET    /api/accommodation/subdivisions/:campId  -- Subdivisions in camp
POST   /api/accommodation/subdivisions          -- Create subdivision

GET    /api/accommodation/rooms/:campId         -- Rooms in camp
POST   /api/accommodation/rooms                 -- Create room
PATCH  /api/accommodation/rooms/:id             -- Update room

POST   /api/accommodation/assign                -- Assign room to employee
POST   /api/accommodation/checkout-request      -- Request checkout
PATCH  /api/accommodation/approve-checkout/:id  -- Admin approves exit
POST   /api/accommodation/confirm-checkout/:id  -- Confirm vacated

GET    /api/accommodation/employee/:empId       -- Employee's room
GET    /api/accommodation/occupancy             -- Occupancy report
GET    /api/accommodation/pending-checkouts     -- Pending requests
GET    /api/accommodation/import                -- Bulk import
```

### DOCUMENT MANAGEMENT
```
POST   /api/documents/upload                    -- Upload document
POST   /api/documents/import-from-drive         -- Import from Google Drive
GET    /api/documents/employee/:empId           -- Employee docs
GET    /api/documents/:id/download              -- Download
DELETE /api/documents/:id                       -- Delete
PATCH  /api/documents/:id                       -- Update metadata

GET    /api/documents/expiring-soon             -- Expiring docs report
GET    /api/documents/missing                   -- Missing docs report
```

### NOTIFICATION MANAGEMENT
```
GET    /api/notifications                       -- User's notifications
PATCH  /api/notifications/:id/read              -- Mark as read
PATCH  /api/notifications/read-all              -- Mark all read
```

### IMPORT & REPORTS
```
POST   /api/import/start                        -- Start import
GET    /api/import/status/:id                   -- Import status
GET    /api/import/logs                         -- Import history

GET    /api/reports/assets                      -- Asset report
GET    /api/reports/accommodation               -- Accommodation report
GET    /api/reports/documents                   -- Document report
```

---

## 8. VALIDATION & ERROR PREVENTION

### Duplicate Prevention
```
1. ON ASSET CREATION:
   - Check bike number not exists (for bikes)
   - Check phone number not exists (for SIMs)
   - Check serial number not exists
   - Show error if duplicate found

2. ON ASSIGNMENT:
   - Check asset not already assigned
   - Check employee not assigned same asset
   - Prevent double assignment
   
3. ON ACCOMMODATION:
   - Check room number unique per camp
   - Check employee not in another active room
   - Prevent double assignment
```

### Business Rule Enforcement
```
1. ASSET:
   ✅ One asset = one employee at a time
   ❌ Cannot assign if already assigned
   ✅ Can return and reassign later
   ✅ Track full history
   
2. ROOM:
   ✅ One employee = one active room
   ❌ Cannot assign to 2 rooms simultaneously
   ✅ Must checkout before new assignment
   ✅ Checkout requires admin approval
   
3. GENERAL:
   ✅ All changes logged with timestamp
   ✅ All changes logged with user who made it
   ✅ No data deletion (only status changes)
   ✅ Full audit trail
```

---

## 9. IMPLEMENTATION CHECKLIST

- [ ] Database schema created
- [ ] Asset tables with custom fields
- [ ] Accommodation hierarchy (camp → subdivision → room)
- [ ] Assignment tables with validation rules
- [ ] Notification system implemented
- [ ] Import system with duplicate prevention
- [ ] All 30+ APIs developed
- [ ] Authentication & authorization
- [ ] File upload for documents
- [ ] Reports & analytics
- [ ] Mobile responsive UI
- [ ] Testing (unit + integration)
- [ ] Deployment to Render
- [ ] Data migration from Google Drive
- [ ] User training

---

## 10. SUCCESS CRITERIA

✅ Assets can be assigned, not duplicated  
✅ Rooms uniquely assigned, no double booking  
✅ Exit request workflow working  
✅ Notifications sent on assignment/exit  
✅ Data can be imported in bulk  
✅ No duplicates allowed  
✅ Full audit trail maintained  
✅ All reports generating  
✅ Mobile app functional  
✅ Zero data loss or corruption  

---

## APPROVAL SIGN-OFF

**Plan reviewed and approved by:** [User]  
**Date:** [Date]  
**Status:** Ready for development

**Next Step:** I'll build the complete backend system with all APIs.

