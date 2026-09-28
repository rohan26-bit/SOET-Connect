'use client';
import DashboardLayout from '@/components/DashboardLayout';

export default function SettingsPage() {
  return (
    <DashboardLayout>
      <div className="flex items-center text-sm text-gray-500 mb-6">
        <span>Home</span><span className="mx-2">/</span><span className="font-medium text-gray-900">Settings</span>
      </div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Settings</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 max-w-2xl p-8 space-y-8">
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-4">Email Notifications</h2>
          <div className="space-y-4">
            <label className="flex items-center space-x-3">
              <input type="checkbox" className="form-checkbox h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500" defaultChecked />
              <span className="text-gray-700">New job postings matching your skills</span>
            </label>
            <label className="flex items-center space-x-3">
              <input type="checkbox" className="form-checkbox h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500" defaultChecked />
              <span className="text-gray-700">Messages from alumni</span>
            </label>
            <label className="flex items-center space-x-3">
              <input type="checkbox" className="form-checkbox h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
              <span className="text-gray-700">Upcoming SOET events</span>
            </label>
          </div>
        </div>

        <div className="pt-8 border-t border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Privacy</h2>
          <div className="space-y-4">
            <label className="flex items-center space-x-3">
              <input type="checkbox" className="form-checkbox h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500" defaultChecked />
              <span className="text-gray-700">Show my profile to Alumni</span>
            </label>
          </div>
        </div>

        <button className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium">Save Settings</button>
      </div>
    </DashboardLayout>
  );
}
