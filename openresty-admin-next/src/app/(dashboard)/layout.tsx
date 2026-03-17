'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box } from '@mui/material';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import DashboardAppBar from '@/components/layout/DashboardAppBar';
import Sidebar from '@/components/layout/Sidebar';
import LoadingOverlay from '@/components/layout/LoadingOverlay';
import VersionFooter from '@/components/layout/VersionFooter';

const SIDEBAR_WIDTH_EXPANDED = 240;
const SIDEBAR_WIDTH_COLLAPSED = 72;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { loadSettings } = useSettings();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) {
      loadSettings().catch(() => {
        // Settings load failure is non-fatal
      });
    }
  }, [isAuthenticated, loadSettings]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <LoadingOverlay />
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen((prev) => !prev)} />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
        }}
      >
        <DashboardAppBar />
        <Box sx={{ flexGrow: 1, px: 1, py: 1, mt: '64px' }}>
          {children}
        </Box>
        <VersionFooter />
      </Box>
    </Box>
  );
}
