import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import AIPanel from './AIPanel';
import StatusBar from './StatusBar';
import { Toaster } from '../ui/Toast';

export default function AppShell() {
  return (
    <div className="flex h-screen flex-col bg-paper">
      <div className="flex flex-1 overflow-hidden">
        <main className="flex flex-1 flex-col overflow-hidden">
          <Sidebar />
          <div className="paper-bg flex-1 overflow-auto px-6 py-6">
            <Outlet />
          </div>
        </main>
        <AIPanel />
      </div>
      <StatusBar />
      <Toaster />
    </div>
  );
}
