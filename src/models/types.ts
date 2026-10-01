import {
    type TimeEntryStatus,
    type BillingType,
    type TimeEntryType,
    type ActivityType,
    type WorkerType,
    type JobStatus,
    type JobStageStatus,
    type JobStageType,
    type JobBillingType,
    type JobRiskFlag,
    type JobPriority,
    TIME_ENTRY_STATUSES,
    WORKER_ALLOWED_TIME_ENTRY_STATUSES,
    FOREMAN_ALLOWED_TIME_ENTRY_STATUSES,
    BILLING_TYPES,
    TIME_ENTRY_TYPES,
    ACTIVITY_TYPES,
    WORKER_TYPES,
    JOB_STATUSES,
    JOB_STAGE_STATUSES,
    JOB_STAGE_TYPES,
    JOB_BILLING_TYPES,
    JOB_RISK_FLAGS,
    JOB_PRIORITIES
} from '../../shared/contracts';

export type {
    TimeEntryStatus,
    BillingType,
    TimeEntryType,
    ActivityType,
    WorkerType,
    JobStatus,
    JobStageStatus,
    JobStageType,
    JobBillingType,
    JobRiskFlag,
    JobPriority
};
export {
    TIME_ENTRY_STATUSES,
    WORKER_ALLOWED_TIME_ENTRY_STATUSES,
    FOREMAN_ALLOWED_TIME_ENTRY_STATUSES,
    BILLING_TYPES,
    TIME_ENTRY_TYPES,
    ACTIVITY_TYPES,
    WORKER_TYPES,
    JOB_STATUSES,
    JOB_STAGE_STATUSES,
    JOB_STAGE_TYPES,
    JOB_BILLING_TYPES,
    JOB_RISK_FLAGS,
    JOB_PRIORITIES
};

export type ConstructionType =
    | 'okno_pvc'
    | 'okno_alu'
    | 'okno_drewno'
    | 'drzwi_pvc'
    | 'drzwi_alu'
    | 'drzwi_drewno'
    | 'hs_pvc'
    | 'hs_alu'
    | 'hs_drewno'
    | 'fasada'
    | 'witryna'
    | 'fix'
    | 'pergola'
    | 'roleta_zew'
    | 'zaluzja_fasadowa'
    | 'zaluzja_fasadowa'
    | 'zip_screen'
    | (string & {});

export type OfferStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'converted' | 'archived';
export type InstallationLocation = 'wew' | 'zew';
export type SideType = 'vertical' | 'top' | 'bottom' | 'perimeter';
export type MaterialCategory =
    | 'elementy_zlacze'
    | 'izolacyjne'
    | 'uszczelniajace'
    | 'dodatkowe'
    | 'sprzet_wynajem';

export interface Address {
    street: string;
    city: string;
    zipCode: string;
    country: string;
    isBillingAddress?: boolean;
}

export interface Client {
    id: string;
    name: string;
    lastName: string; // Added to match original
    type: 'individual' | 'company'; // Changed to match ported component logic
    status: 'active' | 'potential' | 'inactive'; // Added
    company?: string; // Added for company name separate from taxId
    taxId?: string; // NIP
    nip?: string; // Alias for taxId to match original if needed, or we can just use taxId. Let's use nip for better parity if UI expects it.
    address: Address[]; // Changed from string to Address[]
    // city?: string; // Deprecated by Address[]
    // postalCode?: string; // Deprecated by Address[]
    // country?: string; // Deprecated by Address[]
    phone: string;
    countryCode?: number; // Added
    email: string;
    notes?: string;
    isActive?: boolean;
    createdAt: string;
    updatedAt: string;
}

export type VatRate = 0 | 8 | 23;
export type DiscountType = 'none' | 'percent' | 'amount';

// Rental Equipment Item
export interface RentalItem {
    id: string;
    name: string;
    unit: 'doba' | 'godz' | 'ryczałt';
    quantity: number;
    duration: number; // number of units (days/hours)
    unitPrice: number;
    totalPrice: number;
}

export interface Offer {
    id: string;
    number: string;
    clientId: string;
    location: string; // Added to match reference
    placeOfInstallation?: string; // Legacy
    status: OfferStatus; // Simplified status to match reference
    createdAt: string;
    updatedAt: string;
    validUntil?: string;

    // Costs
    rentalItems: RentalItem[]; // New field
    materialsCost: number;
    laborCost: number; // Combined labor cost (installation + workTime)
    totalCost: number; // Total net (Legacy, kept for compatibility, same as totalNet)

    // VAT & Discount Logic
    vatRate: VatRate;
    discountType: DiscountType;
    discountValue: number;

    subtotalNet: number;         // Sum of positions before discount
    discountAmount: number;      // Calculated discount amount
    totalNet: number;            // Net after discount
    vatAmount: number;           // Calculated VAT
    totalGross: number;          // Final Gross

    // Detailed cost breakdown — 4 main cost buckets (KOSTIQ)
    costBreakdown?: {
        material_cost: number;
        assembly_cost: number;
        transport_cost: number;
        equipment_rental_cost: number;
    };

    // Legacy detailed costs (kept for compatibility)
    installationLaborCost?: number;
    constructionTransportCost?: number;
    workerTransportCost?: number;
    workTimeCost?: number;
    equipmentRentalCost?: number;
    flashingsCost?: number;
    logisticsCost?: number;
    otherCosts?: number;

    // Settings & Configurations
    settings?: {
        installationRates: Record<string, { rate: number; unit: 'm²' | 'mb' | 'szt.' }>;
        workTime: {
            workTime: number;
            workerCount: number;
            hourlyRate: number;
        };
        margin: number;
        discount: number;
    };

    // Legacy fields (Deprecated / Kept for compatibility during migration)
    // marginPercent?: number; -- Moved to settings or calculated
    // marginValue?: number;
    // placeOfInstallation?: string; -- Replaced by location
    offerTemplateType?: 'detailed' | 'summary';
    // remarkIds?: string[]; -- Might be useful/keep
    // jobId?: string; -- Reverse link, keep
    // plannedDifficulty?: JobDifficulty; -- Keep if used

    // Legacy cost mappings
    // installationLaborCost?: number; 
    // constructionTransportCost?: number;
    // workerTransportCost?: number;
    // workTimeCost?: number; 
    // equipmentRentalCost?: number;
    // flashingsCost?: number;
    // logisticsCost?: number;
    // otherCosts?: number;
    title?: string;
    scopeOfWork?: string[];
    customMaterials?: {
        providedByUs: string[];
        providedByClient: string[];
    };
    notes?: string[];

    // Print settings
    printLayout?: 'standard' | 'simple';
    printMode?: 'detailed' | 'summary';
}

export interface Construction {
    id: string;
    offerId?: string;
    number: number;
    name: string;
    type: string; // Changed from ConstructionType to allow flexibility or matched enum
    width: number; // matched reference
    height: number; // matched reference
    widthMm?: number; // legacy
    heightMm?: number; // legacy
    quantity: number;
    area: number; // added
    totalArea: number; // matched reference
    perimeter: number; // added
    totalPerimeter: number; // matched reference
    installationLocation: 'wew' | 'zew'; // matched
    weight: number; // matched reference

    // Cost structures from reference
    materialCosts: {
        items: Array<{
            name: string;
            quantity: number;
            unitPrice: number;
            total: number;
        }>;
        total: number;
    };
    installationCosts: {
        rate: number;
        total: number;
    };

    // Legacy/Existing fields optional or mapped
    materialBreakdown?: ConstructionMaterialUsage[];
    installationStandardId?: string;
    equipmentRentalCost?: number;
    flashingsCost?: number;

    // Planned Labor fields (Sprint 4 Refinement)
    plannedLaborHours?: number;
    plannedLaborCostNet?: number;

    totalCost: number;
    createdAt: string;
    updatedAt: string;
}

export interface Material {
    id: string;
    name: string;
    category: MaterialCategory;
    unit: 'szt' | 'm' | 'm2' | 'l' | 'kg' | 'opak';
    defaultUnitPrice: number;
    producer?: string;
    sku?: string;
    notes?: string;
    isActive: boolean;
    wastePercent?: number; // default waste margin %
    createdAt: string;
    updatedAt: string;
}



export interface InstallationStandardSideRule {
    id: string; // Added ID
    standardId?: string; // Optional linkage
    edge: SideType; // Renamed from side to edge for clarity, or kept as side? Prompt says 'edge'. But let's stick to SideType which is used elsewhere if possible. Actually prompt says 'edge' in rule. Let's align.
    materialId: string;
    usagePerMeter: number;
    usageUnit?: string; // e.g. 'szt/m'
    basis?: 'mb' | 'szt'; // per meter vs per piece of construction
    wastePercent?: number; // rule override waste margin %
}

export interface InstallationStandard {
    id: string;
    name: string;
    description?: string;
    applicableTypes: ConstructionType[];
    rules: InstallationStandardSideRule[];
    isDefault: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface ConstructionMaterialUsage {
    id?: string; // added
    materialId: string;
    materialName: string; // denormalized
    category: MaterialCategory; // maybe optional?
    side?: SideType | 'global'; // from legacy
    unit: string;
    quantity: number;
    unitPrice: number;
    totalCost: number; // cost -> totalCost? Prompt uses totalCost.

    // New fields
    source?: 'standard_montazu' | 'manual';
    ruleId?: string;
}

export interface TransportSettings {
    offerId: string;
    constructionTransport: {
        vehicleType: string;
        roundTrips: number;
        distanceKm: number;
        ratePerKm: number;
    };
    workerTransport: {
        vehicleType: string;
        roundTrips: number;
        distanceKm: number;
        ratePerKm: number;
    };
    workTime: {
        plannedHours: number;
        workerCount: number;
        hourlyRate: number;
    };
}

export interface RemarkTemplate {
    id: string;
    label: string;
    text: string;
    createdAt: string;
    updatedAt: string;
}

export interface CompanySettings {
    id: string;
    companyName: string;
    address: string;
    baseCity?: string;
    basePostalCode?: string;
    taxId?: string;
    logoUrl?: string;
    defaultVatRate?: number;
    defaultHourlyRate?: number;
    defaultMarginPercent?: number;
    createdAt: string;
    updatedAt: string;
}

export interface SubcontractorContract {
    id: string;
    subcontractorId: string;   // Worker.type = 'subcontractor'
    jobId: string;
    stageId?: string | null;   // null => kontrakt na całe zlecenie

    description: string;
    totalAmountNet: number;
    currency: 'PLN' | 'EUR';

    plannedStartDate?: string;
    plannedEndDate?: string;

    createdAt: string;
    updatedAt: string;
}

// --- KOSTIQ Mobile Integration Types ---

export type WorkerRole = 'worker' | 'foreman' | 'admin';

export interface Crew {
    id: string;
    name: string;
    foremanId: string;       // Worker.id with role 'foreman'
    memberIds: string[];     // includes foreman as member or not
    active: boolean;
}

// TimeEntryType is derived and re-exported from shared/contracts above

export type SettlementMethod = 'hourly' | 'fixed' | 'per_m2' | 'per_mb';

export interface WorkerBase {
    id: string;
    type: WorkerType;
    name: string;
    code?: string;
    isActive: boolean;
    defaultHourlyRate?: number;
    currency: 'PLN';
}

export interface SettlementStatusType {
    type: 'open' | 'closed' | 'exported';
}

export type SettlementStatus = 'open' | 'closed' | 'exported';

export interface Settlement {
    id: string;
    workerId: string;
    workerType: WorkerType;
    workerName: string; // Denormalized for display

    periodFrom: string;
    periodTo: string;

    createdAt: string;
    updatedAt: string;

    timeEntryIds: string[];

    totalHours: number;
    totalAmount: number;
    currency: 'PLN';

    status: SettlementStatus;
    notes?: string;

    // --- Financial Breakdown (Stage 20) ---
    grossAmount: number;         // Amount before deductions
    overtimeHours: number;       // Hours > 8h/day
    overtimePay: number;         // Additional pay for overtime
    advanceDeductions: number;   // Total subtracted from gross

    // --- Lump-Sum / Contract Integration ---
    type?: 'hourly' | 'contract'; // Defaults to 'hourly' if missing
    contractId?: string;          // For 'contract' type
    jobId?: string;               // For 'contract' type (or if single job settlement)
    stageId?: string;             // For 'contract' type
}

export interface TimeEntry {
    id: string;
    employeeId: string; // Used for both Employee and Subcontractor ID
    employeeName?: string; // Optional/Denormalized
    // Expanded for full integration
    jobId: string;
    jobCode: string;
    jobName: string;
    stageId: string;
    stageName: string;

    date: string;
    hours: number;
    billingType: BillingType;
    hourlyRate?: number;         // Snapshot of rate at time of log
    cost: number;                // Calculated: hours * rate

    description?: string;
    status: TimeEntryStatus;

    crewId?: string | null;
    foremanId?: string | null;
    foremanApprovedAt?: string | null;
    adminId?: string | null;
    adminApprovedAt?: string | null;

    // Payroll Integration
    settlementId?: string | null;

    // Legacy fields specific to simple version
    type?: TimeEntryType;
    activityType?: ActivityType;
    workerType?: WorkerType;
    workType?: string;
    quantity?: number; // for non-hourly billing if needed
    rate?: number;

    approved?: boolean; // Deprecated, use status='approved'

    createdAt: string;
    updatedAt: string;
}

export interface Message {
    id: string;
    fromId: string; // Employee ID or 'system'
    toId: string; // Employee ID or 'all'
    subject: string;
    content: string;
    read: boolean;
    createdAt: string;
    type: 'message' | 'memo';
}

export type RequestType = 'urlop' | 'zaliczka' | 'koszt';
export type RequestStatus = 'oczekujący' | 'zaakceptowany' | 'odrzucony';

export interface Request {
    id: string;
    employeeId: string;
    type: RequestType;
    status: RequestStatus;
    amount?: number; // For zaliczka/koszt
    dateFrom?: string; // For urlop
    dateTo?: string; // For urlop
    description?: string;
    createdAt: string;
    updatedAt?: string;
    comment?: string; // Manager comment
    settlementId?: string | null; // Linked to a payroll settlement
}

export type JobDifficulty = 1 | 2 | 3 | 4 | 5;

export interface DifficultyBreakdownItem {
    difficulty: JobDifficulty;
    jobsCount: number;
    avgHoursPerJob: number;
}

export interface EmployeePerformanceSummary {
    employeeName: string;
    periodFrom: string;
    periodTo: string;
    totalHours: number;
    workHours: number;
    driveHours: number;
    jobsCount: number;
    averageHoursPerJob: number;
    efficiencyIndex: number; // 1.0 = average, <1 faster, >1 slower
    difficultyBreakdown: DifficultyBreakdownItem[];
}

// JobStatus and JobRiskFlag are imported directly from shared/contracts

export interface JobChecklistItem {
    id: string;
    name: string;
    status: 'pending' | 'completed' | 'not_applicable';
    comment?: string;
    completedBy?: string;
    completedAt?: string;
}

export interface JobMaterialItem {
    id: string;
    name: string;
    quantity: number;
    status: 'to_order' | 'in_stock' | 'packed';
}

export interface JobStructureItem {
    id: string;
    lp: string;
    type: string;
    width: number;
    height: number;
    quantity: number;
    priceNet: number;
    notes?: string;
}

export interface JobDocument {
    id: string;
    name: string;
    type: 'contract' | 'protocol' | 'photo' | 'other';
    url: string; // or base64/blob url
    uploadedAt: string;
    isKeyDocument?: boolean;
    isClientVisible?: boolean;
}

// --- Labor Budget Types (Sprint Sync) ---
export type LaborSource = 'own' | 'subcontractor';

export interface JobLaborBudget {
    totalPlannedNet: number;      // suma robocizny z oferty
    ownPlannedNet: number;        // własna ekipa
    subcontractorPlannedNet: number;
}

export interface JobStageLaborBudget {
    jobStageId: string;
    plannedNet: number;
    plannedHours?: number;        // wyliczane ze stawek montażu
    source: LaborSource;          // own / subcontractor
}

export type JobExpenseCategory = 'material' | 'transport' | 'equipment' | 'other';

export interface JobExpense {
    id: string;
    jobId: string;
    category: JobExpenseCategory;
    description: string;
    vendorName?: string;
    invoiceNumber?: string;
    amountNet: number;
    date: string;
    createdAt: string;
}

export interface Job {
    id: string;
    jobCode: string; // e.g., CF-2026-001
    name: string;
    clientId: string;
    clientName: string; // Denormalized for easier display
    offerId?: string;
    offerNumber?: string;
    projectManager?: string;

    status: JobStatus;
    priority?: 'low' | 'normal' | 'high';

    location: string;
    country?: string;
    notesInternal?: string;

    plannedStartDate?: string;
    plannedEndDate?: string;
    actualStartDate?: string;
    actualEndDate?: string;

    plannedWorkHours?: number;
    plannedTeam?: string[]; // IDs or Names
    assignedTeams?: string[];

    // Costs & Revenue — 4 KOSTIQ buckets
    materialsPlannedNet?: number;
    materialsActualNet?: number;
    laborPlannedNet?: number;
    laborActualNet?: number;
    logisticsPlannedNet?: number;
    logisticsActualNet?: number;
    equipmentPlannedNet?: number;
    equipmentActualNet?: number;
    otherCostsNet?: number;

    // Actual expenses (invoices)
    expenses?: JobExpense[];

    // Legacy mapping for compatibility
    plannedTotalCost?: number;
    actualTotalCost?: number;

    revenuePlannedNet?: number;
    revenueActualNet?: number;

    marginPlannedPercent?: number;
    marginActualPercent?: number;

    riskFlag: JobRiskFlag;
    riskComment?: string;

    // Added to resolve build errors
    totalArea?: number;
    actualRevenue?: number;
    plannedDifficulty?: JobDifficulty;

    // KOSTIQ Mobile integration placeholders
    timeEntriesCount?: number;
    timeEntriesHours?: number;
    timeEntries?: TimeEntry[];

    checklists?: JobChecklistItem[];
    documents?: JobDocument[];

    createdAt: string;
    updatedAt: string;

    // --- New Refactor Fields (Sprint 1) ---
    sourceOfferId?: string;
    totalPlannedRevenueNet?: number;
    totalPlannedCostNet?: number;
    stages?: JobStage[];
    allocations?: OfferItemAllocation[];
    siteLogEntries?: SiteLogEntry[];
    extraWorks?: ExtraWork[];
    employeeAssignments?: AssignmentEmployee[];
    subcontractorAssignments?: AssignmentSubcontractor[];

    // --- TiCo Integration Fields ---
    plannedLaborHours?: number;   // Calculated from stages or assignments
    plannedLaborCost?: number;    // Calculated from stages or assignments
    actualLaborHours?: number;    // Aggregated from approved TimeEntries
    actualLaborCost?: number;     // Aggregated from approved TimeEntries
    settledLaborCost?: number;    // Aggregated from finalized Settlements

    materials?: JobMaterialItem[];
    structures?: JobStructureItem[];
    estimatedLaborTime?: number;

    // --- Labor Budget Integration ---
    laborBudget?: JobLaborBudget;
    stageLaborBudgets?: JobStageLaborBudget[];
}

export interface JobStage {
    id: string;
    jobId: string;
    name: string;
    type: JobStageType;
    status: JobStageStatus;

    plannedRevenueNet: number;
    plannedCostNet?: number;
    actualRevenueNet?: number;
    actualCostNet?: number;

    revenueSharePercent?: number;

    startPlanned?: string;
    endPlanned?: string;
    startActual?: string;
    endActual?: string;

    description?: string;

    plannedLaborHours?: number;
    assignedTeams?: string[];

    // New fields
    assignedStartTime?: string;
    assignedLocation?: string;
    assignedNotes?: string;


    // --- TiCo Integration Fields ---
    billingType: 'hourly' | 'fixed' | 'm2' | 'mb';
    billingRate?: number;         // PLN/h, PLN/m2 etc.

    plannedLaborCost?: number;    // Manual budget or calc
    actualLaborHours?: number;    // From TimeEntries
    actualLaborCost?: number;     // From TimeEntries

    // Links to OfferItems (allocations) will be added in Sprint 2
}

export interface JobStageItem {
    id: string;
    jobId: string;
    stageId: string;

    constructionId: string;    // links to Construction from Offer
    constructionName: string;  // snapshot of construction name at assignment time
    offerId: string;

    quantityFromOffer: number; // original quantity from Offer
    quantityInStage: number;   // quantity assigned to this stage

    // optional helper if you want ratio:
    shareOfOfferItem?: number; // e.g. 0.6 = 60% of that offer position belongs to this stage

    createdAt: string;
    updatedAt: string;
}

export type ExtraWorkStatus = 'draft' | 'wysłana_do_akceptacji' | 'zaakceptowana' | 'odrzucona';

export interface ExtraWork {
    id: string;
    jobId: string;
    relatedStageId?: string;
    newStageId?: string;

    createdAt: string;
    createdById: string;

    title: string;
    reason: string;
    status: ExtraWorkStatus;

    requestedBy?: string;
    requestedDate?: string;
    employeeId?: string;
    photo?: string;
    estimatedHours?: number;

    offerId?: string;
    approvedBy?: string;
    approvedAt?: string;

    plannedRevenueNet: number;
    plannedCostNet: number;

    notesInternal?: string;
    sourceSiteLogEntryId?: string;
}

export type SiteLogEntryType = 'dzienny' | 'problem' | 'zmiana_zakresu' | 'odbiór_częściowy';

export interface SiteLogEntry {
    id: string;
    jobId: string;
    jobStageId?: string;

    createdAt: string;
    createdById: string;

    date: string;
    type: SiteLogEntryType;

    weather?: string;
    workersPresent?: number;
    clientRepresentative?: string;

    description: string;

    attachments: {
        id: string;
        type: 'photo' | 'file';
        url: string;
        description?: string;
    }[];
}


export interface OfferItem {
    id: string;
    offerId: string;
    name: string;
    description?: string;
    quantity: number;
    unit: string;
    unitPriceNet: number;
    valueNet: number;
    vatRate: number;
    valueGross: number;

    // Optional reference to source Construction if this item comes from it
    sourceConstructionId?: string;

    // Allocations
    allocations?: OfferItemAllocation[];
}

export interface OfferItemAllocation {
    id: string;
    offerItemId: string;
    jobId: string;
    jobStageId: string;
    allocatedValueNet: number;
    allocatedQuantity?: number;
    // Context fields for JobStageItem creation
    offerItemName?: string;
    originalQuantity?: number;
}

export interface Employee {
    id: string;
    type: 'employee'; // Discriminator
    firstName: string;
    lastName: string;
    role: WorkerRole | string;
    hourlyRate: number;
    dailyRate?: number;
    projectRate?: number;
    isActive: boolean;
    email?: string;       // Login identifier for web panel
    login?: string;       // Alternative login (if no email)
    pwaPassword?: string; // Hashed password for PWA / web login
    crewId?: string | null;
    // WorkerBase compat
    currency?: 'PLN';
    code?: string;
    defaultHourlyRate?: number;
}

export interface Subcontractor {
    id: string;
    type: 'subcontractor'; // Discriminator
    name: string;
    specialization: string;
    settlementType: 'ryczałt' | 'godzina' | 'm2' | 'mb';
    rate: number;
    isActive: boolean;
    crewId?: string | null;
    // WorkerBase compat
    currency?: 'PLN';
    code?: string;
    companyName?: string;
    settlementMethod?: SettlementMethod;
    defaultHourlyRate?: number;
}

export interface AssignmentEmployee {
    id: string;
    jobId: string;
    employeeId: string;
    stageId?: string; // Optional: Link to specific stage
    plannedHours: number;
    actualHours?: number; // Placeholder for KOSTIQ Mobile
    plannedCost: number;
    actualCost?: number;
}

export interface AssignmentSubcontractor {
    id: string;
    jobId: string;
    subcontractorId: string;
    stageId?: string;
    plannedBudget: number;
    actualCost?: number;
    scopeDescription: string;
    status: 'planowany' | 'w_toku' | 'zakończony' | 'rozliczony';
}

export interface TiCoState {
    timeEntries: TimeEntry[];
    settlements: Settlement[]; // Added
    currentUser: { name: string; role: 'admin' | 'employee' } | null;
    adminFilters: {
        dateRange: { from: string | null; to: string | null };
        selectedEmployee: string | null;
        selectedJobCode: string | null;
        status: 'ALL' | 'PENDING' | 'APPROVED';
    };

}

// --- Site Diary & Client Reports (Sprint 1) ---

export type JobLogEntryType =
    | 'work_day'        // dzień pracy
    | 'note'            // uwaga / informacja
    | 'issue'           // problem
    | 'extra_work'      // prace dodatkowe
    | 'milestone';      // kamień milowy

export interface JobLogExtraCost {
    id: string;
    description: string;
    amount: number;
    currency: string;
}

export interface JobLogEntry {
    id: string;
    jobId: string;
    jobStageId?: string;
    date: string;              // dzień, którego dotyczy wpis
    authorId: string;
    type: JobLogEntryType;
    title?: string;
    text: string;
    photos: string[];          // urls
    extraCosts?: JobLogExtraCost[];
    timeEntryIds?: string[];   // linked time entries
    visibleToClient: boolean;  // kandydat do raportu
    source?: 'internal' | 'pwa'; // 'internal' = created on web, 'pwa' = from mobile app
    createdAt: string;
    updatedAt: string;
}

export type ClientReportStatus = 'draft' | 'ready' | 'sent';

export interface ClientReportEntry {
    logEntryId: string;
    include: boolean;          // czy ten wpis ma wejść do raportu

    // SNAPSHOT / EDITABLE CONTENT
    originalText: string;      // Snapshot z momentu generowania
    customTitle?: string;      // tytuł pod klienta
    customText?: string;       // wygładzony opis pod klienta

    order: number;             // kolejność w raporcie

    // Metadata snapshot (optional but useful)
    entryDate: string;
    entryType: JobLogEntryType;
    photos?: string[];
}

export interface ClientReportSummary {
    intro?: string;
    progressDescription?: string;
    progressPercent?: number;
    workedDays?: number;
    workedHours?: number;
    issues?: string;
    nextSteps?: string;
    extraCostsSummary?: number;
}

export interface ClientReport {
    id: string;
    jobId: string;
    periodStart: string;
    periodEnd: string;
    type: 'daily' | 'weekly' | 'monthly' | 'custom';
    title: string;

    generatedBy: string;
    generatedAt: string;

    entries: ClientReportEntry[];

    summary: ClientReportSummary;

    status: ClientReportStatus;
    sentAt?: string;
    sentBy?: string;
    pdfUrl?: string;
}

export interface MaterialDemand {
    materialId: string;
    materialName: string;
    unit: string;
    quantity: number;
    wastePercent: number;
    totalQuantity: number; // inc. waste
    unitPrice: number;
    totalCost: number;
    sourceBreakdown: {
        constructionId: string;
        constructionName: string;
        baseQuantity: number;
        ruleId?: string;
    }[];
}

export interface StageMaterialDemand {
    stageId: string;
    items: MaterialDemand[];
    totalCost: number;
    createdAt: string; // valid at
}



// --- Equipment Catalog (KOSTIQ) ---
export interface Equipment {
    id: string;
    name: string;              // e.g. "Podnośnik nożycowy 12m"
    category: string;          // e.g. "podnośniki", "rusztowania"
    unit: 'rbh' | 'dzień';     // rental time unit
    defaultRate: number;       // PLN per unit
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}
