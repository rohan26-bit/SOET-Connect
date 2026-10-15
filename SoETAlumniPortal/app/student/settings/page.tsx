'use client';
import DashboardLayout from '@/components/DashboardLayout';
import ReportIssueForm from '@/components/ReportIssueForm';

import NotificationPreferencesCard from '@/components/NotificationPreferencesCard';

export default function SettingsPage() {
  return (
    <DashboardLayout>
      <div className="flex items-center text-sm text-gray-500 mb-6">
        <span>Home</span><span className="mx-2">/</span><span className="font-medium text-gray-900">Settings</span>
      </div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Settings</h1>

      <div className="max-w-3xl space-y-8">
        <NotificationPreferencesCard />

        <div className="pt-8 border-t border-gray-100">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-gray-900">Support & Report an Issue</h2>
            <p className="text-xs text-gray-500 mt-0.5">Found a bug or having trouble? Let the technical team know.</p>
          </div>
          <ReportIssueForm initialRoute="/student/settings" />
        </div>
      </div>
    </DashboardLayout>
  );
}
