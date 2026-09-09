'use client';

import DashboardLayout from '@/components/DashboardLayout';

export default function AdminReportsPage() {
  return (
    <DashboardLayout>
      <div className="flex items-center text-sm text-gray-500 mb-6">
        <span>Admin</span><span className="mx-2">/</span><span className="font-medium text-gray-900">Reports & Analytics</span>
      </div>
      
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Reports & Analytics</h1>
      <p className="text-gray-500 mb-8">System overview and network engagement metrics.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* User Growth Chart */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Network Growth</h2>
          <div className="h-64 flex items-end justify-between gap-4 border-b border-gray-100 pb-2">
            {[30, 45, 40, 60, 80, 95].map((v, i) => (
              <div key={i} className="flex-1 flex flex-col justify-end items-center gap-1">
                <div className="w-full bg-indigo-100 rounded-t-md relative group flex items-end justify-center" style={{ height: `${v}%` }}>
                  <div className="w-full bg-indigo-500 rounded-t-md opacity-80 group-hover:opacity-100 transition-opacity" style={{ height: `${v}%` }}></div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs font-semibold text-gray-400">
            <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span>
          </div>
        </div>

        {/* Demographics */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 mb-6">User Distribution</h2>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-sm font-bold text-gray-700 mb-2">
                <span>Students</span>
                <span>65%</span>
              </div>
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: '65%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm font-bold text-gray-700 mb-2">
                <span>Alumni</span>
                <span>30%</span>
              </div>
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: '30%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm font-bold text-gray-700 mb-2">
                <span>Admin</span>
                <span>5%</span>
              </div>
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full" style={{ width: '5%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Metrics */}
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Engagement Metrics</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-gray-50 rounded-xl border border-gray-100">
            <div className="text-gray-500 font-medium mb-1">Total Announcements</div>
            <div className="text-3xl font-black text-gray-900">342</div>
            <div className="text-sm text-green-600 font-bold mt-2">↑ 12% this month</div>
          </div>
          <div className="p-6 bg-gray-50 rounded-xl border border-gray-100">
            <div className="text-gray-500 font-medium mb-1">Job Applications</div>
            <div className="text-3xl font-black text-gray-900">1,204</div>
            <div className="text-sm text-green-600 font-bold mt-2">↑ 8% this month</div>
          </div>
          <div className="p-6 bg-gray-50 rounded-xl border border-gray-100">
            <div className="text-gray-500 font-medium mb-1">Event Attendance</div>
            <div className="text-3xl font-black text-gray-900">85%</div>
            <div className="text-sm text-orange-600 font-bold mt-2">↓ 2% this month</div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
