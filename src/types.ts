export interface Project {
  id: string;
  name: string;
  constituency: string;
  province: string;
  sector: string;
  budget: number;
  spent: number;
  pct: number;
  status: 'planned' | 'ongoing' | 'stalled' | 'complete';
  mp: string;
  lastUpdated?: string;
}

export interface Report {
  id: string;
  constituency: string;
  type: string;
  proj: string;
  amount: string;
  contact: string;
  email?: string;
  desc: string;
  date: string;
  status: 'Received' | 'Under review' | 'Escalated to ACC' | 'Closed';
  acc: boolean;
  /** Optional evidence photo attached by the whistleblower, stored as a data URL. */
  photoUrl?: string;
}

export interface ProjectRequest {
  id: string;
  submitterName: string;
  submitterContact: string;
  submitterEmail?: string;
  constituency: string;
  sector: string;
  name: string;
  cost: string;
  beneficiaries: string;
  desc: string;
  date: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Under Review';
  /** Number of community upvotes ("I support this too") this request has received. */
  votes?: number;
  /** Number of community downvotes ("I don't support this") this request has received. */
  rejects?: number;
  /** Citizen comments/discussion on this request — surfaced to admins for review. */
  comments?: RequestComment[];
  /**
   * One vote per identified user, keyed by their lowercased account identity
   * (citizen account email, or admin email/username). Each identity can only
   * appear once — voting locks in either 'yes' or 'no' and cannot be changed
   * or repeated. Anonymous (logged-out) visitors cannot vote.
   */
  voters?: Record<string, 'yes' | 'no'>;
}

export interface RequestComment {
  id: string;
  author: string;
  text: string;
  date: string;
}

export interface ConstituencyAdmin {
  constituency: string;
  name: string;
  email: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  icon: string;
  color: string;
  detailLabel: string;
  detail: string;
  note: string;
}

export interface CitizenAccount {
  email: string;
  name: string;
  /** Login identifier used for the fast username+password path (premium citizens). Defaults to the email's local part if not set explicitly. */
  username: string;
  /** SHA-256 hash of the citizen's password — the plaintext is never stored or transmitted anywhere. */
  passwordHash: string;
  wallet: string;
  plan: 'monthly' | 'yearly';
  amount: number;
  verified: boolean;
  premium: boolean;
  createdAt: string;
}

export interface SystemUser {
  username: string;
  role: 'Admin' | 'Officer' | 'ACC' | 'Constituency Admin';
  name: string;
  constituency?: string;
  email?: string;
}

export interface Application {
  id: string;
  category: 'Grant' | 'Bursary' | 'Agricultural Support';
  applicantName: string;
  nrc: string;
  contact: string;
  email: string;
  constituency: string;
  amount: string;
  purpose: string;
  // Specific to Grant:
  businessName?: string;
  businessSector?: string;
  // Specific to Bursary:
  institution?: string;
  levelOfStudy?: string;
  guardianName?: string;
  // Specific to Agricultural Support:
  farmSize?: string;
  farmingType?: string;
  // Geolocation details
  lat?: number;
  lng?: number;
  date: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Under Review';
}

export interface LiveUpdate {
  id: string;
  adminName: string;
  actionType:
    | 'create_project' | 'update_project' | 'delete_project'
    | 'create_report' | 'update_report' | 'delete_report'
    | 'create_request' | 'update_request' | 'delete_request' | 'vote_request' | 'comment_request'
    | 'create_application' | 'update_application' | 'delete_application'
    | 'create_announcement' | 'delete_announcement'
    | 'create_constituency' | 'update_constituency' | 'delete_constituency'
    | 'create_payment' | 'update_payment' | 'delete_payment'
    | 'create_citizen' | 'update_citizen'
    | 'login' | 'logout' | 'failed_login'
    | 'general';
  targetId: string;
  targetName: string;
  description: string;
  timestamp: string;
  /** Constituency this entry belongs to ('' / missing = national). Drives who can see it. */
  constituency?: string;
  /** 'public' entries show on the public transparency feed; 'private' are admin-only. */
  visibility?: 'public' | 'private';
  /** Set when a project's disbursed amount changed — powers the before → after highlight. */
  spentBefore?: number;
  spentAfter?: number;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  type: 'Tender' | 'Meeting' | 'Budget Release' | 'General';
  constituency?: string; // blank/'' = national / all constituencies
  postedBy: string; // display name shown publicly
  /** Reliable identifier of the publishing admin (SystemUser.username), used to scope
   *  what a Constituency Admin can see in the admin panel (their own posts only). */
  postedByUsername?: string;
  date: string;
}

