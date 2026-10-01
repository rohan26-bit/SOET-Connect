

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
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  poster_name?: string;
  poster_avatar?: string;
  poster_email?: string;
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
  job?: JobItem;
  student_name?: string;
  student_email?: string;
  department?: string;
}

const API_URL = 'http://127.0.0.1:8000';

function getAuthHeaders() {
  const token = localStorage.getItem('soet_access_token');

  if (!token) {
    throw new Error('Please log in again.');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
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

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || 'Failed to load jobs.');
    }

    let result: JobItem[] = data || [];

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

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.detail || 'Failed to load jobs.'
      );
    }

    return data || [];
  },


  // ============================================================
  // GET MY POSTED JOBS
  // ============================================================

  async getMyPostedJobs(
    userId: string
  ): Promise<JobItem[]> {

    const response = await fetch(
      `${API_URL}/jobs/mine`,
      {
        headers: getAuthHeaders(),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.detail || 'Failed to load your jobs.'
      );
    }

    return data || [];
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
  }) {

    const response = await fetch(
      `${API_URL}/jobs`,
      {
        method: 'POST',
        headers: getAuthHeaders(),

        body: JSON.stringify({
          title: jobData.title,
          company: jobData.company,
          description: jobData.description,
          location: jobData.location,
          employment_type: jobData.employment_type,
          experience: jobData.experience || '',
          salary: jobData.salary || '',
          skills: jobData.skills || [],
          application_url:
            jobData.application_url || '',
          deadline: jobData.deadline || null,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.detail || 'Job posting failed.'
      );
    }

    return data.job;
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

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.detail ||
          'Failed to update job status.'
      );
    }

    return data.job;
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

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.detail || 'Failed to delete job.'
      );
    }

    return data;
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

    const response = await fetch(
      `${API_URL}/applications`,
      {
        method: 'POST',
        headers: getAuthHeaders(),

        body: JSON.stringify({
          job_id: applicationData.job_id,
          cover_letter:
            applicationData.cover_letter || '',
          resume_url: '',
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.detail ||
          'Application submission failed.'
      );
    }

    return data;
  },


  // ============================================================
  // GET MY APPLICATIONS
  // ============================================================

  async getMyApplications(
    studentId: string
  ): Promise<JobApplicationItem[]> {

    const response = await fetch(
      `${API_URL}/applications/mine`,
      {
        headers: getAuthHeaders(),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.detail ||
          'Failed to load applications.'
      );
    }

    return (data || []).map(
      (app: any) => ({
        id: app.id,
        job_id: app.job_id,
        student_id: app.student_id,
        resume_url: app.resume_url,
        cover_letter: app.cover_letter,
        status: app.status,
        created_at: app.created_at,
        job: app.job,
      })
    );
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

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.detail ||
          'Failed to load applicants.'
      );
    }

    return (data || []).map(
      (app: any) => ({
        id: app.id,
        job_id: app.job_id,
        student_id: app.student_id,
        resume_url: app.resume_url,
        cover_letter: app.cover_letter,
        status: app.status,
        created_at: app.created_at,
        student_name: app.student_name,
        student_email: app.student_email,
        department: app.department,
      })
    );
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

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.detail ||
          'Failed to update application status.'
      );
    }

    return data;
  },
};