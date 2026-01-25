import { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { defaultTheme } from 'react-admin';

// Design tokens matching the landing page
const tokens = {
  colors: {
    primary: {
      50: '#eef2ff',
      100: '#e0e7ff',
      200: '#c7d2fe',
      300: '#a5b4fc',
      400: '#818cf8',
      500: '#6366f1', // Main primary
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
      500: '#10b981', // Main accent
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
    fontFamily: '"Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  shape: {
    borderRadius: 12,
  },
};

// Light theme palette
const lightPalette = {
  mode: 'light',
  primary: {
    main: tokens.colors.primary[500],
    light: tokens.colors.primary[400],
    dark: tokens.colors.primary[600],
    contrastText: '#ffffff',
  },
  secondary: {
    main: tokens.colors.accent[500],
    light: tokens.colors.accent[400],
    dark: tokens.colors.accent[600],
    contrastText: '#ffffff',
  },
  error: {
    main: tokens.colors.error[500],
    dark: tokens.colors.error[600],
  },
  warning: {
    main: tokens.colors.warning[500],
    dark: tokens.colors.warning[600],
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
    disabled: '#94a3b8',
  },
  divider: '#e2e8f0',
  action: {
    hover: 'rgba(99, 102, 241, 0.04)',
    selected: 'rgba(99, 102, 241, 0.08)',
    focus: 'rgba(99, 102, 241, 0.12)',
  },
};

// Dark theme palette
const darkPalette = {
  mode: 'dark',
  primary: {
    main: tokens.colors.primary[400],
    light: tokens.colors.primary[300],
    dark: tokens.colors.primary[500],
    contrastText: '#ffffff',
  },
  secondary: {
    main: tokens.colors.accent[400],
    light: tokens.colors.accent[300],
    dark: tokens.colors.accent[500],
    contrastText: '#ffffff',
  },
  error: {
    main: tokens.colors.error[500],
    dark: tokens.colors.error[600],
  },
  warning: {
    main: tokens.colors.warning[500],
    dark: tokens.colors.warning[600],
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
    disabled: '#64748b',
  },
  divider: '#334155',
  action: {
    hover: 'rgba(129, 140, 248, 0.08)',
    selected: 'rgba(129, 140, 248, 0.16)',
    focus: 'rgba(129, 140, 248, 0.24)',
  },
};

// Create component overrides based on mode
const getComponentOverrides = (mode) => {
  const isDark = mode === 'dark';
  
  return {
    ...defaultTheme.components,
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: isDark ? '#475569 #1e293b' : '#cbd5e1 #f1f5f9',
          '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
            width: 8,
            height: 8,
          },
          '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
            borderRadius: 8,
            backgroundColor: isDark ? '#475569' : '#cbd5e1',
          },
          '&::-webkit-scrollbar-track, & *::-webkit-scrollbar-track': {
            borderRadius: 8,
            backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 8,
          padding: '8px 16px',
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
        contained: {
          '&:hover': {
            transform: 'translateY(-1px)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: isDark
            ? '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
            : '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
          backgroundImage: 'none',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
        rounded: {
          borderRadius: 12,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          boxShadow: isDark
            ? '0 1px 3px rgba(0, 0, 0, 0.3)'
            : '0 1px 3px rgba(0, 0, 0, 0.08)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
        },
        head: {
          fontWeight: 600,
          backgroundColor: isDark ? '#1e293b' : '#f8fafc',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: isDark
              ? 'rgba(129, 140, 248, 0.04)'
              : 'rgba(99, 102, 241, 0.02)',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 500,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
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
              ? 'rgba(129, 140, 248, 0.16)'
              : 'rgba(99, 102, 241, 0.08)',
            '&:hover': {
              backgroundColor: isDark
                ? 'rgba(129, 140, 248, 0.24)'
                : 'rgba(99, 102, 241, 0.12)',
            },
          },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: 6,
          fontSize: '0.75rem',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    // React Admin specific overrides
    RaDatagrid: {
      styleOverrides: {
        root: {
          backgroundColor: isDark ? '#1e293b' : '#ffffff',
          borderRadius: 12,
          overflow: 'hidden',
          '& .RaDatagrid-headerCell': {
            backgroundColor: isDark ? '#0f172a' : '#f8fafc',
            fontWeight: 600,
            lineHeight: '2.5em',
            color: isDark ? '#f1f5f9' : '#0f172a',
            borderBottom: isDark ? '2px solid #334155' : '2px solid #e2e8f0',
          },
          '& .RaDatagrid-row': {
            '&:hover': {
              backgroundColor: isDark
                ? 'rgba(129, 140, 248, 0.04)'
                : 'rgba(99, 102, 241, 0.02)',
            },
          },
          '& .RaDatagrid-rowEven': {
            backgroundColor: isDark ? '#1e293b' : '#ffffff',
          },
          '& .RaDatagrid-rowOdd': {
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.5)' : 'rgba(248, 250, 252, 0.5)',
          },
        },
      },
    },
    RaSidebar: {
      styleOverrides: {
        root: {
          backgroundColor: isDark ? '#1e293b' : '#ffffff',
          borderRight: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
        },
      },
    },
    RaMenuItemLink: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: '2px 8px',
          '&.RaMenuItemLink-active': {
            backgroundColor: isDark
              ? 'rgba(129, 140, 248, 0.16)'
              : 'rgba(99, 102, 241, 0.08)',
            color: tokens.colors.primary[isDark ? 400 : 500],
            '& .MuiSvgIcon-root': {
              color: tokens.colors.primary[isDark ? 400 : 500],
            },
          },
        },
      },
    },
    RaList: {
      styleOverrides: {
        root: {
          '& .RaList-content': {
            boxShadow: 'none',
            border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
            borderRadius: 12,
          },
        },
      },
    },
    RaShow: {
      styleOverrides: {
        root: {
          '& .RaShow-card': {
            boxShadow: 'none',
            border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
            borderRadius: 16,
          },
        },
      },
    },
    RaEdit: {
      styleOverrides: {
        root: {
          '& .RaEdit-card': {
            boxShadow: 'none',
            border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
            borderRadius: 16,
          },
        },
      },
    },
    RaCreate: {
      styleOverrides: {
        root: {
          '& .RaCreate-card': {
            boxShadow: 'none',
            border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
            borderRadius: 16,
          },
        },
      },
    },
  };
};

// Create theme function
export const createAppTheme = (mode) => {
  const palette = mode === 'dark' ? darkPalette : lightPalette;
  const components = getComponentOverrides(mode);

  return {
    ...defaultTheme,
    palette,
    typography: {
      fontFamily: tokens.typography.fontFamily,
      h1: { fontWeight: 700, letterSpacing: '-0.025em' },
      h2: { fontWeight: 700, letterSpacing: '-0.025em' },
      h3: { fontWeight: 600, letterSpacing: '-0.02em' },
      h4: { fontWeight: 600, letterSpacing: '-0.02em' },
      h5: { fontWeight: 600 },
      h6: { fontWeight: 600 },
      subtitle1: { fontWeight: 500 },
      subtitle2: { fontWeight: 500 },
      button: { fontWeight: 600, textTransform: 'none' },
    },
    shape: {
      borderRadius: tokens.shape.borderRadius,
    },
    components,
  };
};

// Theme Context
const ThemeContext = createContext({
  mode: 'light',
  toggleTheme: () => {},
  setMode: () => {},
});

// Theme Provider
export const ThemeProvider = ({ children }) => {
  const [mode, setMode] = useState(() => {
    // Check localStorage first
    const stored = localStorage.getItem('wslproxy-theme-mode');
    if (stored) return stored;
    // Then check system preference
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    localStorage.setItem('wslproxy-theme-mode', mode);
    // Update meta theme-color
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', mode === 'dark' ? '#0f172a' : '#ffffff');
    }
  }, [mode]);

  const toggleTheme = useCallback(() => {
    setMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const value = useMemo(
    () => ({
      mode,
      toggleTheme,
      setMode,
    }),
    [mode, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

// Hook to use theme
export const useThemeMode = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeMode must be used within a ThemeProvider');
  }
  return context;
};

// Export design tokens for use in custom components
export { tokens };

// Export light theme as default for React Admin
export const lightTheme = createAppTheme('light');
export const darkTheme = createAppTheme('dark');

export default lightTheme;
