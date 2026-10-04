'use client';
import DashboardLayout from '@/components/DashboardLayout';

export default function AboutPage() {
  return (
    <DashboardLayout>
      {/* Breadcrumbs */}
      <div className="flex items-center text-xs font-semibold text-[#6B6B6B] mb-6 uppercase tracking-wider">
        <span>Portal</span>
        <span className="mx-2 text-[#DDD7D2]">/</span>
        <span className="text-[#F28C38]">About SOET Connect</span>
      </div>
      <h1 className="text-2xl font-black text-[#4A3832] tracking-tight mb-6">About SOET Connect</h1>

      <div className="bg-white rounded-3xl shadow-sm border border-[#DDD7D2] max-w-3xl p-8 prose">
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
