'use client';
import DashboardLayout from '@/components/DashboardLayout';
import { Send } from 'lucide-react';

export default function ChatPage() {
  return (
    <DashboardLayout>
      <div className="flex items-center text-sm text-gray-500 mb-6">
        <span>Home</span><span className="mx-2">/</span><span className="font-medium text-gray-900">Chat</span>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex h-[calc(100vh-12rem)] overflow-hidden">
        {/* Sidebar */}
        <div className="w-1/3 border-r border-gray-100 bg-gray-50 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-bold text-gray-900">Conversations</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 bg-white border-l-4 border-blue-600 cursor-pointer">
              <h3 className="font-semibold text-gray-900">Priya Sharma (Alumni)</h3>
              <p className="text-sm text-gray-500 truncate">Sure, I can review your resume tomorrow.</p>
            </div>
            <div className="p-4 hover:bg-gray-100 border-l-4 border-transparent cursor-pointer">
              <h3 className="font-semibold text-gray-900">Rohan Desai (Alumni)</h3>
              <p className="text-sm text-gray-500 truncate">Let's schedule a mock interview.</p>
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div className="w-2/3 flex flex-col">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-900">Priya Sharma</h2>
            <span className="text-xs text-green-500 font-medium flex items-center"><span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>Online</span>
          </div>
          
          <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-gray-50">
            <div className="flex justify-end">
              <div className="bg-blue-600 text-white rounded-xl rounded-tr-none p-3 max-w-sm shadow-sm">
                Hi Priya, could you take a look at my updated resume?
              </div>
            </div>
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 text-gray-800 rounded-xl rounded-tl-none p-3 max-w-sm shadow-sm">
                Sure, I can review your resume tomorrow. Send it over!
              </div>
            </div>
          </div>

          <div className="p-4 bg-white border-t border-gray-100 flex gap-4">
            <input type="text" placeholder="Type a message..." className="flex-1 border border-gray-200 rounded-full px-4 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button className="bg-blue-600 text-white p-3 rounded-full hover:bg-blue-700 transition"><Send className="w-5 h-5" /></button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
