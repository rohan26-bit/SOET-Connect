'use client';
import DashboardLayout from '@/components/DashboardLayout';

export default function AboutPage() {
  return (
    <DashboardLayout>
      <div className="flex items-center text-sm text-gray-500 mb-6">
        <span>Home</span><span className="mx-2">/</span><span className="font-medium text-gray-900">About</span>
      </div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">About SOET Connect</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 max-w-3xl p-8 prose">
        <p className="text-lg text-gray-700 mb-4">
          The School of Engineering and Technology (SOET) Alumni Portal is a dedicated platform designed to bridge the gap between current students and our esteemed alumni network.
        </p>
        <p className="text-gray-700 mb-4">
          Our mission is to foster professional growth and career opportunities by connecting students directly with alumni who are established in their respective fields across the globe.
        </p>
        <h3 className="text-xl font-bold text-gray-900 mt-8 mb-2">Key Features</h3>
        <ul className="list-disc pl-5 text-gray-700 space-y-2">

          <li><strong>Job Opportunities:</strong> Access exclusive job and internship postings directly from alumni companies.</li>
          <li><strong>Networking Events:</strong> Stay updated on alumni meetups, tech talks, and workshops.</li>
        </ul>
        <p className="text-sm text-gray-400 mt-12 border-t pt-4">
          Version 1.0.0 &copy; 2026 SOET. All rights reserved.
        </p>
      </div>
    </DashboardLayout>
  );
}
