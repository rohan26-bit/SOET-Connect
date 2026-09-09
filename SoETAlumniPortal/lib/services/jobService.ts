import { createClient } from '@/utils/supabase/client';

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

    const supabase = createClient();

    // Check duplicate application
    const { data: existing } = await supabase
      .from('job_applications')
      .select('id')
      .eq('job_id', applicationData.job_id)
      .eq(
        'student_id',
        applicationData.student_id
      )
      .maybeSingle();

    if (existing) {
      throw new Error(
        'You have already applied for this position.'
      );
    }

    let resumeUrl = '';

    // Upload resume
    if (applicationData.resume_file) {

      const file = applicationData.resume_file;

      const fileExt =
        file.name.split('.').pop();

      const filePath =
        `${applicationData.student_id}/${Date.now()}.${fileExt}`;

      const {
        error: uploadError
      } = await supabase.storage
        .from('resumes')
        .upload(filePath, file);

      if (uploadError) {
        throw new Error(
          'Resume upload failed: ' +
          uploadError.message
        );
      }

      const {
        data: { publicUrl }
      } =
        supabase.storage
          .from('resumes')
          .getPublicUrl(filePath);

      resumeUrl = publicUrl;
    }

    // Insert application
    const { error } = await supabase
      .from('job_applications')
      .insert({
        job_id: applicationData.job_id,
        student_id: applicationData.student_id,
        resume_url:
          resumeUrl || undefined,
        cover_letter:
          applicationData.cover_letter,
        status: 'applied',
      });

    if (error) {
      throw new Error(error.message);
    }

    // Notify student
    await supabase
      .from('notifications')
      .insert({
        user_id: applicationData.student_id,
        title: 'Application Submitted',
        message:
          'Your application has been received and is under review.',
        type: 'application',
      });
  },


  // ============================================================
  // GET MY APPLICATIONS
  // ============================================================

  async getMyApplications(
    studentId: string
  ): Promise<JobApplicationItem[]> {

    const supabase = createClient();

    const { data, error } =
      await supabase
        .from('job_applications')
        .select(`
          *,
          jobs (
            id,
            title,
            company,
            location,
            employment_type,
            status
          )
        `)
        .eq('student_id', studentId)
        .order('created_at', {
          ascending: false,
        });

    if (error) {
      throw new Error(error.message);
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
        job: app.jobs,
      })
    );
  },


  // ============================================================
  // GET JOB APPLICANTS
  // ============================================================

  async getJobApplicants(
    jobId: string
  ): Promise<JobApplicationItem[]> {

    const supabase = createClient();

    const { data, error } =
      await supabase
        .from('job_applications')
        .select(`
          *,
          profiles:student_id (
            full_name,
            email,
            student_profiles (
              department
            )
          )
        `)
        .eq('job_id', jobId)
        .order('created_at', {
          ascending: false,
        });

    if (error) {
      throw new Error(error.message);
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
        student_name:
          app.profiles?.full_name,
        student_email:
          app.profiles?.email,
        department:
          app.profiles?.student_profiles?.[0]
            ?.department ||
          app.profiles?.student_profiles
            ?.department,
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

    const supabase = createClient();

    const { data: app, error } =
      await supabase
        .from('job_applications')
        .update({
          status,
          updated_at:
            new Date().toISOString(),
        })
        .eq('id', applicationId)
        .select(
          'student_id, jobs(title)'
        )
        .single();

    if (error) {
      throw new Error(error.message);
    }

    if (app) {
      await supabase
        .from('notifications')
        .insert({
          user_id: app.student_id,
          title:
            'Job Application Status Updated',
          message:
            `Your application for "${(app.jobs as any)?.title || 'Job'}" status changed to: ${status
              .replace('_', ' ')
              .toUpperCase()}`,
          type: 'application',
        });
    }
  },
};