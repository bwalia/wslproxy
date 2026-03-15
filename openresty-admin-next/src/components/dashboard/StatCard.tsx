'use client';

import React from 'react';
import {
  Box,
  Card,
  Typography,
  useTheme,
  alpha,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownIcon from '@mui/icons-material/TrendingDownRounded';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import { useThemeMode } from '@/providers/ThemeProvider';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<SvgIconProps>;
  color: string;
  trend?: string;
  trendDirection?: 'up' | 'down';
  subtitle?: string;
  large?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon: Icon,
  color,
  trend,
  trendDirection = 'up',
  subtitle,
  large = false,
}) => {
  const theme = useTheme();
  const { mode } = useThemeMode();
  const isDark = mode === 'dark';

  const isPositiveTrend = trendDirection === 'up';
  const TrendIcon = isPositiveTrend ? TrendingUpIcon : TrendingDownIcon;
  const trendColor = isPositiveTrend
    ? theme.palette.success.main
    : theme.palette.error.main;

  return (
    <Card
      sx={{
        p: 0,
        height: '100%',
        minHeight: large ? 180 : 140,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        background: isDark
          ? `linear-gradient(145deg, ${alpha(color, 0.12)} 0%, ${alpha(theme.palette.background.paper, 0.95)} 100%)`
          : `linear-gradient(145deg, ${alpha(color, 0.06)} 0%, ${theme.palette.background.paper} 100%)`,
        border: `1px solid ${isDark ? alpha(color, 0.2) : alpha(color, 0.12)}`,
        borderRadius: 4,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': {
          transform: 'translateY(-6px)',
          boxShadow: isDark
            ? `0 20px 40px ${alpha(color, 0.25)}, 0 0 0 1px ${alpha(color, 0.25)}`
            : `0 20px 40px ${alpha(color, 0.18)}, 0 0 0 1px ${alpha(color, 0.15)}`,
          borderColor: alpha(color, 0.4),
          '& .stat-icon-box': {
            transform: 'scale(1.05)',
            boxShadow: `0 12px 28px ${alpha(color, 0.5)}`,
          },
        },
      }}
    >
      {/* Decorative gradient overlay */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '60%',
          height: '100%',
          background: `radial-gradient(circle at top right, ${alpha(color, 0.12)} 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Bottom decorative bar */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 4,
          background: `linear-gradient(90deg, ${color}, ${alpha(color, 0.3)})`,
          opacity: 0.6,
        }}
      />

      <Box
        sx={{
          p: large ? 3 : 2.5,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Header with icon */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            mb: large ? 2 : 1.5,
          }}
        >
          <Box
            className="stat-icon-box"
            sx={{
              width: large ? 56 : 48,
              height: large ? 56 : 48,
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: `linear-gradient(135deg, ${color} 0%, ${alpha(color, 0.75)} 100%)`,
              color: '#fff',
              boxShadow: `0 8px 24px ${alpha(color, 0.4)}`,
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <Icon sx={{ fontSize: large ? 28 : 24 }} />
          </Box>
          {trend && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1.25,
                py: 0.5,
                borderRadius: 2,
                backgroundColor: alpha(trendColor, 0.12),
                color: trendColor,
                border: `1px solid ${alpha(trendColor, 0.2)}`,
              }}
            >
              <TrendIcon sx={{ fontSize: 14 }} />
              <Typography variant="caption" fontWeight={700} fontSize="0.7rem">
                {trend}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Value */}
        <Typography
          variant="h4"
          sx={{
            fontWeight: 800,
            color: theme.palette.text.primary,
            mb: 0.5,
            fontSize: large
              ? { xs: '1.75rem', sm: '2.25rem' }
              : { xs: '1.5rem', sm: '1.85rem' },
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            background: isDark
              ? `linear-gradient(135deg, ${theme.palette.text.primary} 0%, ${alpha(color, 0.9)} 100%)`
              : 'none',
            backgroundClip: isDark ? 'text' : 'unset',
            WebkitBackgroundClip: isDark ? 'text' : 'unset',
            WebkitTextFillColor: isDark ? 'transparent' : 'unset',
          }}
        >
          {value}
        </Typography>

        {/* Title */}
        <Typography
          variant="body2"
          sx={{
            color: theme.palette.text.secondary,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontSize: large ? '0.75rem' : '0.7rem',
          }}
        >
          {title}
        </Typography>

        {/* Subtitle */}
        {subtitle && (
          <Typography
            variant="caption"
            sx={{
              color: alpha(theme.palette.text.secondary, 0.7),
              mt: 'auto',
              pt: 1,
              fontSize: '0.7rem',
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
    </Card>
  );
};

export default StatCard;
