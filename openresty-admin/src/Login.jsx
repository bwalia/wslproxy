import * as React from "react";
import { useState, useEffect } from "react";
import {
  Box,
  Button,
  TextField,
  Typography,
  Container,
  Paper,
  IconButton,
  InputAdornment,
  alpha,
  Divider,
  Link,
} from "@mui/material";
import VisibilityIcon from "@mui/icons-material/VisibilityRounded";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOffRounded";
import LightModeIcon from "@mui/icons-material/LightModeRounded";
import DarkModeIcon from "@mui/icons-material/DarkModeRounded";
import { useLogin, useNotify, Notification } from "react-admin";
import Logo from "./component/Logo";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState(() => {
    const stored = localStorage.getItem('wslproxy-theme-mode');
    return stored || 'dark';
  });
  
  const login = useLogin();
  const notify = useNotify();
  const isDark = mode === 'dark';

  const handleSubmit = (e) => {
    e.preventDefault();
    login({ email, password }).catch(() => notify("Invalid email or password"));
  };

  const toggleTheme = () => {
    const newMode = mode === 'dark' ? 'light' : 'dark';
    setMode(newMode);
    localStorage.setItem('wslproxy-theme-mode', newMode);
  };

  // Theme colors
  const colors = {
    primary: '#6366f1',
    primaryLight: '#818cf8',
    background: isDark ? '#0f172a' : '#f8fafc',
    paper: isDark ? '#1e293b' : '#ffffff',
    text: isDark ? '#f1f5f9' : '#0f172a',
    textSecondary: isDark ? '#94a3b8' : '#64748b',
    border: isDark ? '#334155' : '#e2e8f0',
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: colors.background,
        transition: 'background-color 0.3s ease',
      }}
    >
      {/* Background decorations */}
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
          zIndex: 0,
          pointerEvents: 'none',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            top: '-20%',
            right: '-10%',
            width: '50%',
            height: '60%',
            background: `radial-gradient(circle, ${alpha(colors.primary, 0.15)} 0%, transparent 70%)`,
            filter: 'blur(40px)',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            bottom: '-10%',
            left: '-10%',
            width: '40%',
            height: '50%',
            background: `radial-gradient(circle, ${alpha('#10b981', 0.1)} 0%, transparent 70%)`,
            filter: 'blur(40px)',
          }}
        />
      </Box>

      {/* Theme toggle */}
      <Box
        sx={{
          position: 'absolute',
          top: 24,
          right: 24,
          zIndex: 10,
        }}
      >
        <IconButton
          onClick={toggleTheme}
          sx={{
            backgroundColor: alpha(colors.primary, 0.1),
            color: colors.primary,
            '&:hover': {
              backgroundColor: alpha(colors.primary, 0.2),
            },
          }}
        >
          {isDark ? <LightModeIcon /> : <DarkModeIcon />}
        </IconButton>
      </Box>

      {/* Main content */}
      <Container
        component="main"
        maxWidth="sm"
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 1,
          py: 4,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            width: '100%',
            maxWidth: 440,
            p: 5,
            backgroundColor: colors.paper,
            border: `1px solid ${colors.border}`,
            borderRadius: 4,
            boxShadow: isDark 
              ? '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
              : '0 25px 50px -12px rgba(0, 0, 0, 0.1)',
          }}
        >
          {/* Logo */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              mb: 4,
            }}
          >
            <Logo width={200} height={44} theme={mode} />
          </Box>

          {/* Title */}
          <Typography
            component="h1"
            variant="h5"
            sx={{
              textAlign: 'center',
              fontWeight: 600,
              color: colors.text,
              mb: 1,
            }}
          >
            Welcome back
          </Typography>
          <Typography
            variant="body2"
            sx={{
              textAlign: 'center',
              color: colors.textSecondary,
              mb: 4,
            }}
          >
            Sign in to your admin account
          </Typography>

          {/* Form */}
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              sx={{
                mb: 2,
                '& .MuiOutlinedInput-root': {
                  backgroundColor: isDark ? alpha('#fff', 0.03) : '#fff',
                  borderRadius: 2,
                  '& fieldset': {
                    borderColor: colors.border,
                  },
                  '&:hover fieldset': {
                    borderColor: colors.primary,
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: colors.primary,
                  },
                },
                '& .MuiInputLabel-root': {
                  color: colors.textSecondary,
                },
                '& .MuiInputBase-input': {
                  color: colors.text,
                },
              }}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type={showPassword ? 'text' : 'password'}
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      sx={{ color: colors.textSecondary }}
                    >
                      {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={{
                mb: 3,
                '& .MuiOutlinedInput-root': {
                  backgroundColor: isDark ? alpha('#fff', 0.03) : '#fff',
                  borderRadius: 2,
                  '& fieldset': {
                    borderColor: colors.border,
                  },
                  '&:hover fieldset': {
                    borderColor: colors.primary,
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: colors.primary,
                  },
                },
                '& .MuiInputLabel-root': {
                  color: colors.textSecondary,
                },
                '& .MuiInputBase-input': {
                  color: colors.text,
                },
              }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{
                py: 1.5,
                backgroundColor: colors.primary,
                color: '#fff',
                fontWeight: 600,
                fontSize: '1rem',
                borderRadius: 2,
                textTransform: 'none',
                boxShadow: `0 4px 14px ${alpha(colors.primary, 0.4)}`,
                '&:hover': {
                  backgroundColor: colors.primaryLight,
                  transform: 'translateY(-1px)',
                  boxShadow: `0 6px 20px ${alpha(colors.primary, 0.5)}`,
                },
                transition: 'all 0.2s ease',
              }}
            >
              Sign In
            </Button>
          </Box>

          <Divider sx={{ my: 3, borderColor: colors.border }}>
            <Typography variant="caption" sx={{ color: colors.textSecondary }}>
              Secure Login
            </Typography>
          </Divider>

          {/* Footer */}
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              textAlign: 'center',
              color: colors.textSecondary,
            }}
          >
            Protected by WSL Proxy Gateway
          </Typography>
        </Paper>
      </Container>

      {/* Bottom branding */}
      <Box
        sx={{
          py: 3,
          textAlign: 'center',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Typography variant="caption" sx={{ color: colors.textSecondary }}>
          © {new Date().getFullYear()}{' '}
          <Link
            href="https://wslproxy.com"
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              color: colors.textSecondary,
              textDecoration: 'none',
              '&:hover': {
                color: colors.primary,
                textDecoration: 'underline',
              },
            }}
          >
            WSL Proxy
          </Link>
          . All rights reserved.
        </Typography>
      </Box>
      
      <Notification />
    </Box>
  );
};

export default Login;