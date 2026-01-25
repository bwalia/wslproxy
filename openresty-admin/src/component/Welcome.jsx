import * as React from 'react';
import { Box, Card, CardActions, Button, Typography, useTheme, alpha, Chip } from '@mui/material';
import ServerIcon from "@mui/icons-material/DnsRounded";
import RuleIcon from "@mui/icons-material/RuleRounded";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { useTranslate } from 'react-admin';
import Logo from './Logo';
import { useThemeMode } from '../Theme';

const Welcome = () => {
    const translate = useTranslate();
    const theme = useTheme();
    const { mode } = useThemeMode();
    const isDark = mode === 'dark';
    
    return (
        <Card
            sx={{
                position: 'relative',
                overflow: 'hidden',
                background: isDark 
                    ? `linear-gradient(135deg, ${alpha('#6366f1', 0.15)} 0%, ${alpha('#8b5cf6', 0.1)} 50%, ${alpha('#10b981', 0.1)} 100%)`
                    : `linear-gradient(135deg, ${alpha('#6366f1', 0.08)} 0%, ${alpha('#8b5cf6', 0.05)} 50%, ${alpha('#10b981', 0.05)} 100%)`,
                border: `1px solid ${isDark ? alpha('#6366f1', 0.2) : alpha('#6366f1', 0.15)}`,
                padding: 0,
                marginTop: 0,
                marginBottom: 0,
            }}
        >
            {/* Decorative elements */}
            <Box
                sx={{
                    position: 'absolute',
                    top: -50,
                    right: -50,
                    width: 200,
                    height: 200,
                    borderRadius: '50%',
                    background: `radial-gradient(circle, ${alpha('#6366f1', 0.1)} 0%, transparent 70%)`,
                }}
            />
            <Box
                sx={{
                    position: 'absolute',
                    bottom: -30,
                    left: '30%',
                    width: 150,
                    height: 150,
                    borderRadius: '50%',
                    background: `radial-gradient(circle, ${alpha('#10b981', 0.1)} 0%, transparent 70%)`,
                }}
            />
            
            <Box display="flex" sx={{ p: 4, position: 'relative', zIndex: 1 }}>
                <Box flex="1">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                        <Chip
                            label="Admin Portal"
                            size="small"
                            sx={{
                                backgroundColor: alpha(theme.palette.primary.main, 0.1),
                                color: theme.palette.primary.main,
                                fontWeight: 600,
                                fontSize: '0.7rem',
                            }}
                        />
                    </Box>
                    
                    <Typography 
                        variant="h4" 
                        component="h2" 
                        gutterBottom
                        sx={{
                            fontWeight: 700,
                            color: theme.palette.text.primary,
                            letterSpacing: '-0.02em',
                        }}
                    >
                        {translate('brahmstra.dashboard.welcome.title', { _: 'Welcome to WSL Proxy' })}
                    </Typography>
                    
                    <Box maxWidth="36em">
                        <Typography 
                            variant="body1" 
                            component="p" 
                            gutterBottom
                            sx={{
                                color: theme.palette.text.secondary,
                                lineHeight: 1.7,
                                mb: 3,
                            }}
                        >
                            {translate('brahmstra.dashboard.welcome.subtitle', { 
                                _: 'Manage your reverse proxy configurations, routing rules, and server instances from this centralized control panel.'
                            })}
                        </Typography>
                    </Box>
                    
                    <CardActions sx={{ padding: 0, gap: 2 }}>
                        <Button
                            variant="contained"
                            href="/#/servers"
                            startIcon={<ServerIcon />}
                            endIcon={<ArrowForwardIcon sx={{ fontSize: '1rem !important' }} />}
                            sx={{
                                backgroundColor: theme.palette.primary.main,
                                color: '#fff',
                                px: 3,
                                py: 1.25,
                                fontWeight: 600,
                                boxShadow: `0 4px 14px ${alpha(theme.palette.primary.main, 0.4)}`,
                                '&:hover': {
                                    backgroundColor: theme.palette.primary.dark,
                                    transform: 'translateY(-2px)',
                                    boxShadow: `0 6px 20px ${alpha(theme.palette.primary.main, 0.5)}`,
                                },
                                transition: 'all 0.2s ease',
                            }}
                        >
                            {translate('brahmstra.dashboard.welcome.server_button', { _: 'Manage Servers' })}
                        </Button>
                        <Button
                            variant="outlined"
                            href="/#/rules"
                            startIcon={<RuleIcon />}
                            sx={{
                                borderColor: theme.palette.primary.main,
                                color: theme.palette.primary.main,
                                px: 3,
                                py: 1.25,
                                fontWeight: 600,
                                '&:hover': {
                                    backgroundColor: alpha(theme.palette.primary.main, 0.08),
                                    borderColor: theme.palette.primary.dark,
                                },
                            }}
                        >
                            {translate('brahmstra.dashboard.welcome.rule_button', { _: 'Configure Rules' })}
                        </Button>
                    </CardActions>
                </Box>
                
                {/* Right side decorative logo */}
                <Box
                    display={{ xs: 'none', md: 'flex' }}
                    alignItems="center"
                    justifyContent="center"
                    sx={{
                        ml: 4,
                        opacity: 0.15,
                    }}
                >
                    <Logo variant="icon" height={150} theme={mode} />
                </Box>
            </Box>
        </Card>
    );
};

export default Welcome;