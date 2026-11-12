import {
  DocumentAttachmentData,
  serializeAttachmentIntoText,
  parseAttachmentFromText,
} from '@/components/DocumentAttachment';

export interface JobItem {
  id: string;
  posted_by: string;
  title: string;
  company: string;
  description: string;
  location: string;
  employment_type: string;
  experience?: string;
  salary?: string;
  skills?: string[];
  application_url?: string;
  deadline?: string;
  application_deadline?: string;
  is_expired?: boolean;
  expired_at?: string | null;
  auto_delete_at?: string | null;
  days_until_auto_delete?: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'closed';
  created_at: string;
  poster_name?: string;
  poster_avatar?: string;
  poster_email?: string;
  attachment?: {
    name: string;
    type: string;
    size: number;
    url?: string;
  } | null;
}

export interface JobApplicationItem {
  id: string;
  job_id: string;
  student_id: string;
  resume_url?: string;
  cover_letter?: string;
  status:
    | 'applied'
    | 'under_review'
    | 'shortlisted'
    | 'interview'
    | 'selected'
    | 'rejected';
  created_at: string;
  job?: Pick<JobItem, 'id'> & Partial<Omit<JobItem, 'id'>>;
  student_name?: string;
  student_email?: string;
  department?: string;
}

const API_URL = '/api';

function getAuthHeaders() {
  return { 'Content-Type': 'application/json' };
}

type ApiRecord = Record<string, unknown>;

const JOB_STATUSES = ['pending', 'approved', 'rejected', 'closed'] as const;
const APPLICATION_STATUSES = [
  'applied',
  'under_review',
  'shortlisted',
  'interview',
  'selected',
  'rejected',
] as const;

function isRecord(value: unknown): value is ApiRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, label: string): ApiRecord {
  if (!isRecord(value)) throw new Error('Unexpected ' + label + ' response format.');
  return value;
}

function requiredString(record: ApiRecord, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new Error('The ' + label + ' response is missing a valid ' + key + ' value.');
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeAttachment(value: unknown): DocumentAttachmentData | null {
  if (!isRecord(value) || typeof value.name !== 'string') return null;
  return {
    name: value.name,
    type: typeof value.type === 'string' ? value.type : 'DOCUMENT',
    size: optionalNumber(value.size) ?? 0,
    url: optionalString(value.url),
  };
}

function normalizeJob(value: unknown): JobItem {
  const job = asRecord(value, 'job');
  const description = requiredString(job, 'description', 'job');
  const parsed = parseAttachmentFromText(description);
  const status = requiredString(job, 'status', 'job');

  if (!JOB_STATUSES.includes(status as (typeof JOB_STATUSES)[number])) {
    throw new Error('The jobs response contains an unsupported job status.');
  }

  return {
    id: requiredString(job, 'id', 'job'),
    posted_by: requiredString(job, 'posted_by', 'job'),
    title: requiredString(job, 'title', 'job'),
    company: requiredString(job, 'company', 'job'),
    description: parsed.cleanText,
    location: requiredString(job, 'location', 'job'),
    employment_type: requiredString(job, 'employment_type', 'job'),
    experience: optionalString(job.experience),
    salary: optionalString(job.salary),
    skills: Array.isArray(job.skills)
      ? job.skills.filter((skill): skill is string => typeof skill === 'string')
      : undefined,
    application_url: optionalString(job.application_url),
    deadline: optionalString(job.deadline),
    application_deadline: optionalString(job.application_deadline),
    is_expired: optionalBoolean(job.is_expired),
    expired_at: job.expired_at === null ? null : optionalString(job.expired_at),
    auto_delete_at: job.auto_delete_at === null ? null : optionalString(job.auto_delete_at),
    days_until_auto_delete:
      job.days_until_auto_delete === null ? null : optionalNumber(job.days_until_auto_delete),
    status: status as JobItem['status'],
    created_at: requiredString(job, 'created_at', 'job'),
    poster_name: optionalString(job.poster_name),
    poster_avatar: optionalString(job.poster_avatar),
    poster_email: optionalString(job.poster_email),
    attachment: normalizeAttachment(job.attachment) || parsed.attachment || null,
  };
}

function normalizeRelatedJob(value: unknown): JobApplicationItem['job'] {
  if (value === null || value === undefined) return undefined;
  const job = asRecord(value, 'application job');
  const id = optionalString(job.id);
  if (!id) return undefined;

  const status = optionalString(job.status);
  return {
    id,
    title: optionalString(job.title),
    company: optionalString(job.company),
    location: optionalString(job.location),
    employment_type: optionalString(job.employment_type),
    status:
      status && JOB_STATUSES.includes(status as (typeof JOB_STATUSES)[number])
        ? (status as JobItem['status'])
        : undefined,
  };
}

function normalizeApplication(value: unknown): JobApplicationItem {
  const application = asRecord(value, 'application');
  const status = requiredString(application, 'status', 'application');

  if (!APPLICATION_STATUSES.includes(status as (typeof APPLICATION_STATUSES)[number])) {
    throw new Error('The applications response contains an unsupported application status.');
  }

  return {
    id: requiredString(application, 'id', 'application'),
    job_id: requiredString(application, 'job_id', 'application'),
    student_id: requiredString(application, 'student_id', 'application'),
    resume_url: optionalString(application.resume_url),
    cover_letter: optionalString(application.cover_letter),
    status: status as JobApplicationItem['status'],
    created_at: requiredString(application, 'created_at', 'application'),
    job: normalizeRelatedJob(application.job),
    student_name: optionalString(application.student_name),
    student_email: optionalString(application.student_email),
    department: optionalString(application.department),
  };
}

async function parseResponse(response: Response, fallbackMessage: string): Promise<unknown> {
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // Keep the fallback for empty, malformed, or non-JSON responses.
  }

  if (!response.ok) {
    const detail = isRecord(data) && typeof data.detail === 'string' ? data.detail : fallbackMessage;
    throw new Error(detail);
  }

  return data;
}

function responseArray(data: unknown, label: string): unknown[] {
  if (!Array.isArray(data)) {
    throw new Error('Unexpected ' + label + ' response format. Please refresh and try again.');
  }
  return data;
}

function responseJob(data: unknown, label: string): JobItem {
  const payload = asRecord(data, label);
  return normalizeJob(payload.job);
}

function newestFirst<T extends { created_at?: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.created_at || '');
    const bTime = Date.parse(b.created_at || '');
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });
}

export const jobService = {

  // ============================================================
  // GET APPROVED JOBS
  // ============================================================

  async getApprovedJobs(filters?: {
    search?: string;
    employmentType?: string;
    location?: string;
  }): Promise<JobItem[]> {

    const response = await fetch(`${API_URL}/jobs`, {
      headers: getAuthHeaders(),
    });

    const data = await parseResponse(response, 'Failed to load jobs.');

    let result: JobItem[] = newestFirst(responseArray(data, 'jobs').map(normalizeJob));

    if (
      filters?.employmentType &&
      filters.employmentType !== 'all'
    ) {
      result = result.filter(
        (job) =>
          job.employment_type === filters.employmentType
      );
    }

    if (filters?.location) {
      const location = filters.location.toLowerCase();

      result = result.filter((job) =>
        job.location.toLowerCase().includes(location)
      );
    }

    if (filters?.search) {
      const search = filters.search.toLowerCase();

      result = result.filter(
        (job) =>
          job.title.toLowerCase().includes(search) ||
          job.company.toLowerCase().includes(search) ||
          job.description.toLowerCase().includes(search) ||
          job.skills?.some((skill) =>
            skill.toLowerCase().includes(search)
          )
      );
    }

    return result;
  },


  // ============================================================
  // ADMIN - GET ALL JOBS
  // ============================================================

  async getAllJobsForAdmin(): Promise<JobItem[]> {

    const response = await fetch(
      `${API_URL}/jobs/admin`,
      {
        headers: getAuthHeaders(),
      }
    );

    const data = await parseResponse(response, 'Failed to load jobs.');

    return newestFirst(responseArray(data, 'jobs').map(normalizeJob));
  },


  // ============================================================
  // GET MY POSTED JOBS
  // ============================================================

  async getMyPostedJobs(
    _userId: string
  ): Promise<JobItem[]> {
    // Preserve the caller signature; the API resolves the owner from the session.

    const response = await fetch(
      `${API_URL}/jobs/mine`,
      {
        headers: getAuthHeaders(),
      }
    );

    const data = await parseResponse(response, 'Failed to load your jobs.');

    return newestFirst(responseArray(data, 'jobs').map(normalizeJob));
  },


  // ============================================================
  // CREATE JOB
  // ============================================================

  async createJob(jobData: {
    posted_by: string;
    title: string;
    company: string;
    description: string;
    location: string;
    employment_type: string;
    experience?: string;
    salary?: string;
    skills?: string[];
    application_url?: string;
    deadline?: string;
    application_deadline?: string;
    attachment?: DocumentAttachmentData | null;
  }) {
    const serializedDescription = serializeAttachmentIntoText(
      jobData.description,
      jobData.attachment
    );

    const deadlineVal = jobData.application_deadline || jobData.deadline || null;

    const response = await fetch(
      `${API_URL}/jobs`,
      {
        method: 'POST',
        headers: getAuthHeaders(),

        body: JSON.stringify({
          title: jobData.title,
          company: jobData.company,
          description: serializedDescription,
          location: jobData.location,
          employment_type: jobData.employment_type,
          experience: jobData.experience || '',
          salary: jobData.salary || '',
          skills: jobData.skills || [],
          application_url:
            jobData.application_url || '',
          deadline: deadlineVal,
          application_deadline: deadlineVal,
          attachment: jobData.attachment ? {
            name: jobData.attachment.name,
            type: jobData.attachment.type,
            size: jobData.attachment.size,
            url: jobData.attachment.url,
          } : null,
        }),
      }
    );

    const data = await parseResponse(response, 'Job posting failed.');
    return responseJob(data, 'job creation');
  },


  // ============================================================
  // UPDATE JOB DEADLINE
  // ============================================================

  async updateJobDeadline(jobId: string, deadline: string | null): Promise<JobItem> {
    const response = await fetch(`${API_URL}/jobs/${jobId}/deadline`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        deadline,
        application_deadline: deadline,
      }),
    });

    const data = await parseResponse(response, 'Failed to update job deadline.');
    return responseJob(data, 'job deadline update');
  },


  // ============================================================
  // ADMIN - APPROVE / REJECT JOB
  // ============================================================

  async updateJobStatus(
    jobId: string,
    status: 'approved' | 'rejected'
  ) {

    const response = await fetch(
      `${API_URL}/jobs/${jobId}/status`,
      {
        method: 'PATCH',
        headers: getAuthHeaders(),

        body: JSON.stringify({
          status,
        }),
      }
    );

    const data = await parseResponse(response, 'Failed to update job status.');
    return responseJob(data, 'job status update');
  },


  // ============================================================
  // DELETE JOB
  // ============================================================

  async deleteJob(jobId: string) {

    const response = await fetch(
      `${API_URL}/jobs/${jobId}`,
      {
        method: 'DELETE',
        headers: getAuthHeaders(),
      }
    );

    return await parseResponse(response, 'Failed to delete job.');
  },


  // ============================================================
  // APPLY FOR JOB
  // ============================================================

  async applyForJob(applicationData: {
    job_id: string;
    student_id: string;
    resume_file?: File;
    cover_letter?: string;
  }) {



    const formData = new FormData();
    formData.append('job_id', applicationData.job_id);
    formData.append('cover_letter', applicationData.cover_letter || '');
    if (applicationData.resume_file) {
      formData.append('resume_file', applicationData.resume_file);
    }

    const response = await fetch(
      `${API_URL}/applications`,
      {
        method: 'POST',
        headers: {
        },
        body: formData,
      }
    );

    return await parseResponse(response, 'Application submission failed.');
  },


  // ============================================================
  // GET MY APPLICATIONS
  // ============================================================

  async getMyApplications(
    _studentId: string
  ): Promise<JobApplicationItem[]> {
    // Preserve the caller signature; the API resolves the applicant from the session.

    const response = await fetch(
      `${API_URL}/applications/mine`,
      {
        headers: getAuthHeaders(),
      }
    );

    const data = await parseResponse(response, 'Failed to load applications.');

    return newestFirst(responseArray(data, 'applications').map(normalizeApplication));
  },


  // ============================================================
  // GET JOB APPLICANTS
  // ============================================================

  async getJobApplicants(
    jobId: string
  ): Promise<JobApplicationItem[]> {

    const response = await fetch(
      `${API_URL}/applications/job/${encodeURIComponent(jobId)}`,
      {
        headers: getAuthHeaders(),
      }
    );

    const data = await parseResponse(response, 'Failed to load applicants.');

    return newestFirst(responseArray(data, 'applicants').map(normalizeApplication));
  },


  // ============================================================
  // UPDATE APPLICATION STATUS
  // ============================================================

  async updateApplicationStatus(
    applicationId: string,
    status:
      | 'applied'
      | 'under_review'
      | 'shortlisted'
      | 'interview'
      | 'selected'
      | 'rejected'
  ) {

    const response = await fetch(
      `${API_URL}/applications/${encodeURIComponent(applicationId)}/status`,
      {
        method: 'PATCH',
        headers: getAuthHeaders(),

        body: JSON.stringify({
          status,
        }),
      }
    );

    return await parseResponse(response, 'Failed to update application status.');
  },
};