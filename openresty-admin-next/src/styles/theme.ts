export const tokens = {
  colors: {
    primary: {
      50: '#eef2ff',
      100: '#e0e7ff',
      200: '#c7d2fe',
      300: '#a5b4fc',
      400: '#818cf8',
      500: '#6366f1',
      600: '#4f46e5',
      700: '#4338ca',
      800: '#3730a3',
      900: '#312e81',
    },
    accent: {
      50: '#ecfdf5',
      100: '#d1fae5',
      200: '#a7f3d0',
      300: '#6ee7b7',
      400: '#34d399',
      500: '#10b981',
      600: '#059669',
      700: '#047857',
      800: '#065f46',
      900: '#064e3b',
    },
    warning: {
      500: '#f59e0b',
      600: '#d97706',
    },
    error: {
      500: '#ef4444',
      600: '#dc2626',
    },
    success: {
      500: '#22c55e',
      600: '#16a34a',
    },
  },
  typography: {
    fontFamily: 'Inter',
  },
  shape: {
    borderRadius: 12,
  },
};

export const lightPalette = {
  mode: 'light' as const,
  primary: {
    main: tokens.colors.primary[600],
    light: tokens.colors.primary[400],
    dark: tokens.colors.primary[800],
    contrastText: '#ffffff',
  },
  secondary: {
    main: tokens.colors.accent[600],
    light: tokens.colors.accent[400],
    dark: tokens.colors.accent[800],
    contrastText: '#ffffff',
  },
  warning: {
    main: tokens.colors.warning[500],
    dark: tokens.colors.warning[600],
  },
  error: {
    main: tokens.colors.error[500],
    dark: tokens.colors.error[600],
  },
  success: {
    main: tokens.colors.success[500],
    dark: tokens.colors.success[600],
  },
  background: {
    default: '#f8fafc',
    paper: '#ffffff',
  },
  text: {
    primary: '#0f172a',
    secondary: '#475569',
  },
  divider: '#e2e8f0',
};

export const darkPalette = {
  mode: 'dark' as const,
  primary: {
    main: tokens.colors.primary[400],
    light: tokens.colors.primary[300],
    dark: tokens.colors.primary[600],
    contrastText: '#ffffff',
  },
  secondary: {
    main: tokens.colors.accent[400],
    light: tokens.colors.accent[300],
    dark: tokens.colors.accent[600],
    contrastText: '#ffffff',
  },
  warning: {
    main: tokens.colors.warning[500],
    dark: tokens.colors.warning[600],
  },
  error: {
    main: tokens.colors.error[500],
    dark: tokens.colors.error[600],
  },
  success: {
    main: tokens.colors.success[500],
    dark: tokens.colors.success[600],
  },
  background: {
    default: '#0f172a',
    paper: '#1e293b',
  },
  text: {
    primary: '#f1f5f9',
    secondary: '#94a3b8',
  },
  divider: '#334155',
};

export function getComponentOverrides(mode: string): any {
  const isDark = mode === 'dark';

  return {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: isDark ? '#0f172a' : '#f8fafc',
          transition: 'background-color 0.3s ease',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none' as const,
          fontWeight: 600,
          padding: '8px 20px',
          boxShadow: 'none',
          '&:hover': {
            boxShadow: isDark
              ? '0 4px 12px rgba(99, 102, 241, 0.4)'
              : '0 4px 12px rgba(79, 70, 229, 0.3)',
          },
        },
        contained: {
          background: isDark
            ? `linear-gradient(135deg, ${tokens.colors.primary[500]} 0%, ${tokens.colors.primary[700]} 100%)`
            : `linear-gradient(135deg, ${tokens.colors.primary[500]} 0%, ${tokens.colors.primary[600]} 100%)`,
          '&:hover': {
            background: isDark
              ? `linear-gradient(135deg, ${tokens.colors.primary[400]} 0%, ${tokens.colors.primary[600]} 100%)`
              : `linear-gradient(135deg, ${tokens.colors.primary[600]} 0%, ${tokens.colors.primary[700]} 100%)`,
          },
        },
        outlined: {
          borderColor: isDark ? tokens.colors.primary[400] : tokens.colors.primary[600],
          '&:hover': {
            backgroundColor: isDark
              ? 'rgba(99, 102, 241, 0.1)'
              : 'rgba(79, 70, 229, 0.05)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: isDark
            ? '0 4px 24px rgba(0, 0, 0, 0.4)'
            : '0 1px 3px rgba(0, 0, 0, 0.08), 0 4px 24px rgba(0, 0, 0, 0.04)',
          border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
          transition: 'box-shadow 0.2s ease, transform 0.2s ease',
          '&:hover': {
            boxShadow: isDark
              ? '0 8px 32px rgba(0, 0, 0, 0.5)'
              : '0 4px 12px rgba(0, 0, 0, 0.1), 0 8px 32px rgba(0, 0, 0, 0.06)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundImage: 'none',
        },
        elevation1: {
          boxShadow: isDark
            ? '0 2px 8px rgba(0, 0, 0, 0.3)'
            : '0 1px 3px rgba(0, 0, 0, 0.08)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: isDark ? '#1e293b' : '#ffffff',
          color: isDark ? '#f1f5f9' : '#0f172a',
          boxShadow: isDark
            ? '0 1px 3px rgba(0, 0, 0, 0.3)'
            : '0 1px 3px rgba(0, 0, 0, 0.08)',
          borderBottom: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: isDark ? '#1e293b' : '#ffffff',
          borderRight: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
          padding: '12px 16px',
        },
        head: {
          fontWeight: 600,
          backgroundColor: isDark ? '#1e293b' : '#f8fafc',
          color: isDark ? '#94a3b8' : '#475569',
          textTransform: 'uppercase' as const,
          fontSize: '0.75rem',
          letterSpacing: '0.05em',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: isDark
              ? 'rgba(99, 102, 241, 0.08)'
              : 'rgba(79, 70, 229, 0.04)',
          },
          '&.Mui-selected': {
            backgroundColor: isDark
              ? 'rgba(99, 102, 241, 0.16)'
              : 'rgba(79, 70, 229, 0.08)',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500,
        },
        filled: {
          backgroundColor: isDark
            ? 'rgba(99, 102, 241, 0.2)'
            : 'rgba(79, 70, 229, 0.1)',
          color: isDark ? tokens.colors.primary[300] : tokens.colors.primary[700],
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            '& fieldset': {
              borderColor: isDark ? '#475569' : '#cbd5e1',
            },
            '&:hover fieldset': {
              borderColor: isDark ? tokens.colors.primary[400] : tokens.colors.primary[500],
            },
            '&.Mui-focused fieldset': {
              borderColor: isDark ? tokens.colors.primary[400] : tokens.colors.primary[600],
              borderWidth: 2,
            },
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: '2px 8px',
          '&.Mui-selected': {
            backgroundColor: isDark
              ? 'rgba(99, 102, 241, 0.16)'
              : 'rgba(79, 70, 229, 0.08)',
            '&:hover': {
              backgroundColor: isDark
                ? 'rgba(99, 102, 241, 0.24)'
                : 'rgba(79, 70, 229, 0.12)',
            },
          },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: isDark ? '#334155' : '#1e293b',
          color: '#f1f5f9',
          fontSize: '0.75rem',
          borderRadius: 6,
          padding: '6px 12px',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
          boxShadow: isDark
            ? '0 24px 48px rgba(0, 0, 0, 0.5)'
            : '0 24px 48px rgba(0, 0, 0, 0.12)',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          border: '1px solid',
        },
        standardSuccess: {
          backgroundColor: isDark ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.05)',
          borderColor: isDark ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.2)',
        },
        standardError: {
          backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
          borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)',
        },
        standardWarning: {
          backgroundColor: isDark ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.05)',
          borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.2)',
        },
        standardInfo: {
          backgroundColor: isDark ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.05)',
          borderColor: isDark ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.2)',
        },
      },
    },
  };
}

export function createAppTheme(mode: string) {
  const palette = mode === 'dark' ? darkPalette : lightPalette;
  const components = getComponentOverrides(mode);

  return {
    palette,
    typography: {
      fontFamily: `"${tokens.typography.fontFamily}", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`,
      h1: {
        fontWeight: 700,
        letterSpacing: '-0.025em',
      },
      h2: {
        fontWeight: 700,
        letterSpacing: '-0.025em',
      },
      h3: {
        fontWeight: 600,
      },
      h4: {
        fontWeight: 600,
      },
      h5: {
        fontWeight: 600,
      },
      h6: {
        fontWeight: 600,
      },
      button: {
        fontWeight: 600,
        textTransform: 'none' as const,
      },
    },
    shape: {
      borderRadius: tokens.shape.borderRadius,
    },
    components,
  };
}
