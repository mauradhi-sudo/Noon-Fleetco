// Employee field definitions — all fields from your onboarding tracker
// Admins can add/edit/delete fields dynamically via API
'use strict';

// Core/mandatory fields (always present, can't be deleted but admins can rename them in UI)
const CORE_FIELDS = [
  'empId', 'name', 'email', 'passportNo', 'firstName', 'lastName',
];

// Default field schema extracted from your data sheet
const DEFAULT_FIELDS = {
  // Identification
  empId: { label: 'Employee ID', type: 'text', required: true, readonly: false, section: 'Personal Info' },
  name: { label: 'Full Name (Passport)', type: 'text', required: true, readonly: false, section: 'Personal Info' },
  firstName: { label: 'First Name', type: 'text', required: false, readonly: false, section: 'Personal Info' },
  lastName: { label: 'Last Name', type: 'text', required: false, readonly: false, section: 'Personal Info' },
  fatherName: { label: 'Father Name', type: 'text', required: false, readonly: false, section: 'Personal Info' },
  passportNo: { label: 'Passport Number', type: 'text', required: true, readonly: false, section: 'Personal Info' },
  dob: { label: 'Date of Birth', type: 'date', required: false, readonly: false, section: 'Personal Info' },
  gender: { label: 'Gender', type: 'select', options: ['Male', 'Female', 'Other'], required: false, readonly: false, section: 'Personal Info' },
  nationality: { label: 'Nationality', type: 'select', options: ['India', 'Pakistan', 'Nepal', 'Bangladesh', 'Philippines', 'Sri Lanka', 'Other'], required: false, readonly: false, section: 'Personal Info' },
  contact: { label: 'Contact Number', type: 'text', placeholder: 'Country Code + Mobile (971501234567)', required: false, readonly: false, section: 'Personal Info' },
  email: { label: 'Email Address', type: 'email', required: true, readonly: false, section: 'Personal Info' },

  // Employment Details
  collar: { label: 'Collar Type', type: 'select', options: ['White Collar', 'Blue Collar'], required: false, readonly: false, section: 'Employment' },
  position: { label: 'Position', type: 'text', required: false, readonly: false, section: 'Employment' },
  workLevel: { label: 'Work Level', type: 'text', required: false, readonly: false, section: 'Employment' },
  contractType: { label: 'Contract Type', type: 'select', options: ['full_time', 'part_time', 'contract', 'intern', 'temp'], required: false, readonly: false, section: 'Employment' },
  contractStartDate: { label: 'Contract Start Date', type: 'date', required: false, readonly: false, section: 'Employment' },
  contractEndDate: { label: 'Contract End Date', type: 'date', required: false, readonly: false, section: 'Employment' },
  joiningDate: { label: 'Official Joining Date', type: 'date', required: false, readonly: false, section: 'Employment' },
  tentativeJoiningDate: { label: 'Tentative Joining Date', type: 'date', required: false, readonly: false, section: 'Employment' },
  status: { label: 'Employee Status', type: 'select', options: ['Active', 'Inactive', 'On Leave', 'Contract Ended', 'Resigned'], required: false, readonly: false, section: 'Employment' },

  // Organization
  department: { label: 'Department', type: 'text', required: false, readonly: false, section: 'Organization' },
  location: { label: 'Location', type: 'text', required: false, readonly: false, section: 'Organization' },
  lineManager: { label: 'Line Manager Name', type: 'text', required: false, readonly: false, section: 'Organization' },
  lineManagerEmail: { label: 'Line Manager Email', type: 'email', required: false, readonly: false, section: 'Organization' },
  orgUnit: { label: 'Org Unit', type: 'text', required: false, readonly: false, section: 'Organization' },
  nubDetails: { label: 'Nub Details', type: 'text', required: false, readonly: false, section: 'Organization' },
  agencyName: { label: 'Agency Name', type: 'text', required: false, readonly: false, section: 'Organization' },
  recruiter: { label: 'Recruiter', type: 'text', required: false, readonly: false, section: 'Organization' },
  recruiterCompanyName: { label: 'Recruiter Company Name', type: 'text', required: false, readonly: false, section: 'Organization' },
  hireType: { label: 'Type of Hire (Overseas/Local)', type: 'select', options: ['Local', 'Overseas'], required: false, readonly: false, section: 'Organization' },

  // Visa & Immigration
  visaStatus: { label: 'Current Visa Status', type: 'select', options: ['Employment Visa', 'Visit/Tourist Visa', 'Visa Cancelled', 'E-Visa', 'No Visa'], required: false, readonly: false, section: 'Visa & Immigration' },
  evisaExpiry: { label: 'E-Visa Expiry Date', type: 'date', required: false, readonly: false, section: 'Visa & Immigration' },
  visaTitle: { label: 'Visa Title', type: 'text', required: false, readonly: false, section: 'Visa & Immigration' },
  visaChargeStatus: { label: 'Visa Charge Status', type: 'text', required: false, readonly: false, section: 'Visa & Immigration' },
  evisaDate: { label: 'E-Visa Date', type: 'date', required: false, readonly: false, section: 'Visa & Immigration' },
  relocationRequired: { label: 'Relocation Required', type: 'select', options: ['Yes', 'No'], required: false, readonly: false, section: 'Visa & Immigration' },
  travelToKSA: { label: 'Required to travel to KSA for business trip', type: 'select', options: ['Yes', 'No'], required: false, readonly: false, section: 'Visa & Immigration' },

  // Onboarding & Process
  onbRepresentative: { label: 'ONB Representative', type: 'text', required: false, readonly: false, section: 'Onboarding' },
  onbCallDate: { label: 'ONB Call Date', type: 'date', required: false, readonly: false, section: 'Onboarding' },
  onbFormFilled: { label: 'ONB Form Filled (Yes/No)', type: 'select', options: ['Yes', 'No'], required: false, readonly: false, section: 'Onboarding' },
  handoverToONBDate: { label: 'Handover to ONB Date', type: 'date', required: false, readonly: false, section: 'Onboarding' },
  handoverToONBMonth: { label: 'Handover to ONB Month', type: 'text', required: false, readonly: false, section: 'Onboarding' },
  docsReceivedDate: { label: 'Docs Received Date', type: 'date', required: false, readonly: false, section: 'Onboarding' },
  employmentContractSentDate: { label: 'Employment contract sent date', type: 'date', required: false, readonly: false, section: 'Onboarding' },
  employmentContractAcceptedDate: { label: 'Employment contract accepted date', type: 'date', required: false, readonly: false, section: 'Onboarding' },
  employmentOfferRejectedDate: { label: 'Employment offer Rejected/Retracted date', type: 'date', required: false, readonly: false, section: 'Onboarding' },
  onbStatus: { label: 'ONB Status', type: 'select', options: ['Pending', 'In Progress', 'Completed', 'On Hold'], required: false, readonly: false, section: 'Onboarding' },
  currentStatus: { label: 'Current Status', type: 'text', required: false, readonly: false, section: 'Onboarding' },

  // Government/MOHRE
  requestForMOHREJODate: { label: 'Request for MOHRE JO- Date', type: 'date', required: false, readonly: false, section: 'Government/MOHRE' },
  mohreJOReceivedDate: { label: 'MOHRE JO Received- Date', type: 'date', required: false, readonly: false, section: 'Government/MOHRE' },
  mohreJOSignedDate: { label: 'MOHRE JO Signed- Date', type: 'date', required: false, readonly: false, section: 'Government/MOHRE' },
  laborApprovalDate: { label: 'Labor Approval Date', type: 'date', required: false, readonly: false, section: 'Government/MOHRE' },
  molPersonCode: { label: 'MOL Person Code', type: 'text', required: false, readonly: false, section: 'Government/MOHRE' },
  statusChangeCompletionDate: { label: 'Status Change Completion Date', type: 'date', required: false, readonly: false, section: 'Government/MOHRE' },

  // Medical & EID
  medicalDate: { label: 'Medical Test Date', type: 'date', required: false, readonly: false, section: 'Medical & EID' },
  medicalInsuranceEnrollmentDate: { label: 'Medical Insurance - Enrollment Date', type: 'date', required: false, readonly: false, section: 'Medical & EID' },
  medicalInsuranceCardReceivedDate: { label: 'Medical Insurance Card Received Date', type: 'date', required: false, readonly: false, section: 'Medical & EID' },
  eidApplicationDate: { label: 'EID Application + biometrics Date', type: 'date', required: false, readonly: false, section: 'Medical & EID' },
  eresidencyReceivedDate: { label: 'E-residency received date', type: 'date', required: false, readonly: false, section: 'Medical & EID' },
  eidReceivedDate: { label: 'EID Received Date', type: 'date', required: false, readonly: false, section: 'Medical & EID' },
  eidDispatchDate: { label: 'EID Dispatch Date', type: 'date', required: false, readonly: false, section: 'Medical & EID' },
  passportReceivedDate: { label: 'Passport Received Date', type: 'date', required: false, readonly: false, section: 'Medical & EID' },

  // Biometric & Documents
  biometricDate: { label: 'Biometric Date', type: 'date', required: false, readonly: false, section: 'Biometric & Documents' },
  myzoiCardsRequestDate: { label: 'MyZoi Cards - Request Date', type: 'date', required: false, readonly: false, section: 'Biometric & Documents' },
  myzoiCardsDispatchDate: { label: 'MyZoi Cards - Dispatch Date', type: 'date', required: false, readonly: false, section: 'Biometric & Documents' },

  // Salary & Banking
  basicSalary: { label: 'Basic Salary', type: 'number', required: false, readonly: false, section: 'Salary & Banking' },
  housingSalary: { label: 'Housing Allowance', type: 'number', required: false, readonly: false, section: 'Salary & Banking' },
  transportSalary: { label: 'Transport Allowance', type: 'number', required: false, readonly: false, section: 'Salary & Banking' },
  foodSalary: { label: 'Food Allowance', type: 'number', required: false, readonly: false, section: 'Salary & Banking' },
  bankName: { label: 'Bank Name', type: 'text', required: false, readonly: false, section: 'Salary & Banking' },
  iban: { label: 'IBAN', type: 'text', required: false, readonly: false, section: 'Salary & Banking' },

  // Travel & Onboarding
  tawjeehContractSubmissionDate: { label: 'Tawjeeh Contract submission date', type: 'date', required: false, readonly: false, section: 'Travel & Logistics' },
  laborCardGeneratedDate: { label: 'Labor card & contract - Generated / Saved date', type: 'date', required: false, readonly: false, section: 'Travel & Logistics' },
  iloeRegistrationDate: { label: 'ILOE Registration Completed Date', type: 'date', required: false, readonly: false, section: 'Travel & Logistics' },
  travelDate: { label: 'Travel Date', type: 'date', required: false, readonly: false, section: 'Travel & Logistics' },
  travelFrom: { label: 'Travel From', type: 'text', required: false, readonly: false, section: 'Travel & Logistics' },
  travelBooked: { label: 'Travel Booked', type: 'select', options: ['Yes', 'No'], required: false, readonly: false, section: 'Travel & Logistics' },
  airline: { label: 'Airline', type: 'text', required: false, readonly: false, section: 'Travel & Logistics' },
  arrivalAirport: { label: 'Arrival Airport', type: 'text', required: false, readonly: false, section: 'Travel & Logistics' },
  arrivalTime: { label: 'Arrival Time', type: 'time', required: false, readonly: false, section: 'Travel & Logistics' },
  accommodationCamp: { label: 'Accommodation Camp', type: 'text', required: false, readonly: false, section: 'Travel & Logistics' },
  accommodationArrivalDate: { label: 'Accommodation Arrival Date', type: 'date', required: false, readonly: false, section: 'Travel & Logistics' },
  drivingSchool: { label: 'Driving School', type: 'text', required: false, readonly: false, section: 'Travel & Logistics' },
  drivingSchoolStartDate: { label: 'Driving School Start Date', type: 'date', required: false, readonly: false, section: 'Travel & Logistics' },
  driveName: { label: 'Drive Name', type: 'text', required: false, readonly: false, section: 'Travel & Logistics' },

  // Other
  rehire: { label: 'Rehire', type: 'select', options: ['Yes', 'No'], required: false, readonly: false, section: 'Other' },
  induction: { label: 'Induction Date', type: 'date', required: false, readonly: false, section: 'Other' },
  deploymentDate: { label: 'Deployment Date', type: 'date', required: false, readonly: false, section: 'Other' },
  riderId: { label: 'Rider ID', type: 'text', required: false, readonly: false, section: 'Other' },
  taComments: { label: 'TA Comments', type: 'textarea', required: false, readonly: false, section: 'Other' },
  remarks: { label: 'Remarks', type: 'textarea', required: false, readonly: false, section: 'Other' },
  commentsEidNumbers: { label: 'Comments/EID Numbers', type: 'textarea', required: false, readonly: false, section: 'Other' },
  joined: { label: 'Joined', type: 'select', options: ['Yes', 'No'], required: false, readonly: false, section: 'Other' },
};

module.exports = {
  CORE_FIELDS,
  DEFAULT_FIELDS,
  getSectionFields(section) {
    return Object.entries(DEFAULT_FIELDS)
      .filter(([, field]) => field.section === section)
      .reduce((acc, [key, field]) => ({ ...acc, [key]: field }), {});
  },
  getAllSections() {
    return [...new Set(Object.values(DEFAULT_FIELDS).map(f => f.section))];
  },
  validateFieldValue(fieldName, value, fieldDef) {
    if (!fieldDef) return { valid: true };
    if (value === '' || value === null || value === undefined) {
      return { valid: !fieldDef.required, error: fieldDef.required ? `${fieldDef.label} is required` : null };
    }
    if (fieldDef.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return { valid: false, error: 'Invalid email format' };
    }
    if (fieldDef.type === 'number' && value && isNaN(value)) {
      return { valid: false, error: 'Must be a number' };
    }
    if (fieldDef.type === 'date' && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return { valid: false, error: 'Invalid date format (YYYY-MM-DD)' };
    }
    return { valid: true };
  },
};
